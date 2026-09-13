import "server-only";
import { randomInt, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { captureEvidence, sha256 } from "@/lib/gdpr/evidence";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

/**
 * Lost password with email OTP.
 *  1. request(email)  → always OK (no account enumeration); if the account exists: 6-digit code,
 *     hashed at rest, expires in 10 min; email with the code + device/IP of the request.
 *  2. verify(email, code) → max 5 attempts per code; returns a single-use reset token (30 min).
 *  3. reset(token, password) → bcrypt hash, invalidates every open code, notification email,
 *     CustomerEvent «password-reset» with evidence.
 * Rate limits: 3 requests / 15 min per email, 10 / hour per IP.
 */
const CODE_TTL_MIN = 10, TOKEN_TTL_MIN = 30, MAX_ATTEMPTS = 5;
const hashCode = (email: string, code: string) => sha256(`${email.toLowerCase()}:${code}:${process.env.AUTH_SECRET ?? "eu"}`);
export const passwordOk = (p: string) => p.length >= 8 && /[A-Za-zΑ-Ωα-ω]/.test(p) && /\d/.test(p);

export async function requestPasswordReset(emailRaw: string, opts: { staffId?: string | null } = {}) {
  const email = emailRaw.trim().toLowerCase();
  const ev = await captureEvidence();
  const since15 = new Date(Date.now() - 15 * 60000), since60 = new Date(Date.now() - 3600000);
  const [perEmail, perIp] = await Promise.all([db.passwordReset.count({ where: { email, createdAt: { gte: since15 } } }), ev.ipHash ? db.passwordReset.count({ where: { ipHash: ev.ipHash, createdAt: { gte: since60 } } }) : Promise.resolve(0)]);
  if (perEmail >= 3 || perIp >= 10) return { ok: true as const, throttled: true as const };
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || c.status !== "active") {
    await db.customerEvent.create({ data: { customerId: c?.id ?? "unknown", kind: "password-reset-request", meta: { email, found: false, ip: ev.ip } } }).catch(() => null);
    return { ok: true as const, throttled: false as const };
  }
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await db.passwordReset.updateMany({ where: { customerId: c.id, usedAt: null }, data: { expiresAt: new Date() } }); // one live code at a time
  await db.passwordReset.create({ data: { customerId: c.id, email, codeHash: hashCode(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60000), requestedBy: opts.staffId ?? null, ip: ev.ip, ipHash: ev.ipHash, userAgent: ev.userAgent, os: ev.os, browser: ev.browser, device: ev.device } });
  await db.customerEvent.create({ data: { customerId: c.id, kind: "password-reset-request", meta: { ip: ev.ip, os: ev.os, browser: ev.browser, byStaff: !!opts.staffId }, staffId: opts.staffId ?? null } });
  const where = [ev.os, ev.browser].filter(Boolean).join(" · ");
  const m = await renderTemplate("password-otp", { firstName: c.firstName, code, minutes: CODE_TTL_MIN, ip: ev.ip, device: where || null });
  await sendMail({ to: email, template: "password-otp", meta: { customerId: c.id }, ...m });
  return { ok: true as const, throttled: false as const };
}

export async function verifyPasswordCode(emailRaw: string, code: string) {
  const email = emailRaw.trim().toLowerCase();
  const pr = await db.passwordReset.findFirst({ where: { email, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!pr) return { ok: false as const, error: "Ο κωδικός έληξε ή δεν υπάρχει. Ζήτησε νέο." };
  if (pr.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: "Πολλές λανθασμένες προσπάθειες. Ζήτησε νέο κωδικό." };
  if (pr.codeHash !== hashCode(email, code.replace(/\D/g, ""))) {
    await db.passwordReset.update({ where: { id: pr.id }, data: { attempts: { increment: 1 } } });
    return { ok: false as const, error: `Λάθος κωδικός. Απομένουν ${MAX_ATTEMPTS - pr.attempts - 1} προσπάθειες.` };
  }
  const token = randomBytes(32).toString("base64url");
  await db.passwordReset.update({ where: { id: pr.id }, data: { verifiedAt: new Date(), token, expiresAt: new Date(Date.now() + TOKEN_TTL_MIN * 60000) } });
  return { ok: true as const, token };
}

export async function resetPassword(token: string, password: string) {
  if (!passwordOk(password)) return { ok: false as const, error: "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες, με γράμματα και αριθμούς." };
  const pr = await db.passwordReset.findUnique({ where: { token }, include: { customer: true } });
  if (!pr || pr.usedAt || pr.expiresAt < new Date() || !pr.verifiedAt) return { ok: false as const, error: "Ο σύνδεσμος επαναφοράς δεν ισχύει πια. Ξεκίνα ξανά." };
  const ev = await captureEvidence();
  await db.$transaction([
    db.customer.update({ where: { id: pr.customerId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.passwordReset.update({ where: { id: pr.id }, data: { usedAt: new Date() } }),
    db.passwordReset.updateMany({ where: { customerId: pr.customerId, usedAt: null }, data: { expiresAt: new Date() } }),
    db.customerEvent.create({ data: { customerId: pr.customerId, kind: "password-reset", meta: { ip: ev.ip, os: ev.os, browser: ev.browser } } }),
  ]);
  const m = await renderTemplate("password-changed", { firstName: pr.customer.firstName, when: new Date().toLocaleString("el-GR"), ip: ev.ip, device: [ev.os, ev.browser].filter(Boolean).join(" · ") || null });
  await sendMail({ to: pr.email, template: "password-changed", meta: { customerId: pr.customerId }, ...m });
  return { ok: true as const, email: pr.email };
}
