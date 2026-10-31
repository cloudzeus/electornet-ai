import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";
import { maskEmail } from "@/lib/auth/otp";
import { createPortalSession, portalUrl } from "./session";
import { portalLog } from "./log";

/**
 * Σύνδεση στην πύλη συνεργατών σε δύο βήματα: κωδικός → 6ψήφιος κωδικός στο email → συνεδρία.
 * Κωδικός ορίζεται μόνο από link (set: πρόσκληση από εμάς · reset: «Ξέχασα τον κωδικό»), ισχύει 72 ώρες / 1 ώρα, μία χρήση.
 * Ό,τι μυστικό φυλάγεται μόνο ως hash. Μετά από 6 λάθος κωδικούς ο λογαριασμός κλειδώνει 15′.
 */
export const OTP_MIN = 10, OTP_TRIES = 5, LOCK_AFTER = 6, LOCK_MIN = 15;
export const LINK_HOURS = { set: 72, reset: 1 } as const;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const GENERIC = "Λάθος email ή κωδικός.";
/** ίδιος χρόνος απάντησης όταν δεν υπάρχει λογαριασμός */
const DUMMY = bcrypt.hashSync("synergaton-dummy", 10);

async function reqInfo() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null, ua: h.get("user-agent") ?? "" };
}
const deviceOf = (ua: string) => `${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"} · ${/iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "—"}`;

import { RULES as PASSWORD_RULES } from "./password-rules";
export { PASSWORD_RULES };
export const passwordProblems = (p: string, email: string) => PASSWORD_RULES.filter((r) => !r.test(p, email)).map((r) => r.label);

/** Βήμα 1: email + κωδικός → challenge και OTP στο email. */
export async function startLogin(emailRaw: string, password: string): Promise<{ ok: true; challengeId: string; maskedEmail: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  const a = await db.partnerAccount.findUnique({ where: { email }, include: { contact: { include: { partner: { select: { id: true, active: true } } } } } });
  if (!a || !a.passwordHash) { await bcrypt.compare(password, DUMMY); return { ok: false, error: GENERIC }; }
  const pid = a.contact.partner.id;
  if (!a.active || !a.contact.partner.active) { await portalLog(pid, "login", false, "Σύνδεση σε ανενεργό λογαριασμό", { accountId: a.id }); return { ok: false, error: "Ο λογαριασμός δεν είναι ενεργός. Επικοινώνησε με την Euronics." }; }
  if (a.lockedUntil && a.lockedUntil > new Date()) return { ok: false, error: `Πολλές λάθος προσπάθειες. Δοκίμασε ξανά μετά τις ${a.lockedUntil.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" })}.` };
  if (!(await bcrypt.compare(password, a.passwordHash))) {
    const n = a.failedCount + 1;
    await db.partnerAccount.update({ where: { id: a.id }, data: { failedCount: n, ...(n >= LOCK_AFTER ? { lockedUntil: new Date(Date.now() + LOCK_MIN * 60_000), failedCount: 0 } : {}) } });
    await portalLog(pid, "login", false, n >= LOCK_AFTER ? "Κλείδωμα μετά από λάθος κωδικούς" : "Λάθος κωδικός", { accountId: a.id });
    return { ok: false, error: GENERIC };
  }
  const recent = await db.partnerToken.count({ where: { accountId: a.id, purpose: "otp", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 5) return { ok: false, error: "Ζητήθηκαν πολλοί κωδικοί. Περίμενε λίγα λεπτά." };
  const challengeId = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { ip, ua } = await reqInfo();
  await db.partnerToken.create({ data: { accountId: a.id, purpose: "otp", tokenHash: sha(challengeId), codeHash: await bcrypt.hash(code, 8), expiresAt: new Date(Date.now() + OTP_MIN * 60_000), ip } });
  try {
    const m = await renderTemplate("partner-login-otp", { name: a.contact.name, code, minutes: OTP_MIN, device: deviceOf(ua), ip: ip ?? "—" });
    await sendMail({ to: a.email, subject: m.subject, html: m.html, text: m.text, template: "partner-login-otp", meta: { accountId: a.id } });
  } catch {
    return { ok: false, error: "Δεν ήταν δυνατή η αποστολή του κωδικού στο email. Δοκίμασε ξανά σε λίγο." };
  }
  return { ok: true, challengeId, maskedEmail: maskEmail(a.email) };
}

/** Βήμα 2: OTP → συνεδρία. */
export async function finishLogin(challengeId: string, code: string): Promise<{ ok: true } | { ok: false; error: string; restart?: boolean }> {
  const t = await db.partnerToken.findUnique({ where: { tokenHash: sha(challengeId) }, include: { account: { include: { contact: { select: { partnerId: true } } } } } });
  if (!t || t.purpose !== "otp" || t.usedAt || t.expiresAt < new Date()) return { ok: false, error: "Ο κωδικός έληξε. Ξεκίνα ξανά τη σύνδεση.", restart: true };
  if (t.attempts >= OTP_TRIES) return { ok: false, error: "Πολλές λάθος προσπάθειες. Ξεκίνα ξανά τη σύνδεση.", restart: true };
  if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, t.codeHash ?? ""))) {
    await db.partnerToken.update({ where: { id: t.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: `Λάθος κωδικός. Απομένουν ${Math.max(0, OTP_TRIES - t.attempts - 1)} προσπάθειες.` };
  }
  await db.$transaction([
    db.partnerToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db.partnerAccount.update({ where: { id: t.accountId }, data: { lastLoginAt: new Date(), failedCount: 0, lockedUntil: null } }),
  ]);
  const { ua } = await reqInfo();
  await portalLog(t.account.contact.partnerId, "login", true, "Σύνδεση στην πύλη", { accountId: t.accountId, detail: { device: deviceOf(ua) } });
  await createPortalSession(t.accountId);
  return { ok: true };
}

/** Link ορισμού (πρόσκληση) ή αλλαγής κωδικού. Επιστρέφει το URL — το στέλνει ο καλών ή το αντιγράφει το προσωπικό. */
export async function issuePasswordLink(accountId: string, purpose: "set" | "reset", staffId?: string) {
  const token = randomBytes(32).toString("base64url");
  // ένα ενεργό link ανά λογαριασμό: τα προηγούμενα ακυρώνονται
  await db.partnerToken.updateMany({ where: { accountId, purpose: { in: ["set", "reset"] }, usedAt: null }, data: { usedAt: new Date() } });
  await db.partnerToken.create({ data: { accountId, purpose, tokenHash: sha(token), expiresAt: new Date(Date.now() + LINK_HOURS[purpose] * 3600_000), createdBy: staffId ?? null } });
  return { url: portalUrl(`/kodikos/${token}`), hours: LINK_HOURS[purpose] };
}

export async function sendPasswordLink(accountId: string, purpose: "set" | "reset", staffId?: string) {
  const a = await db.partnerAccount.findUniqueOrThrow({ where: { id: accountId }, include: { contact: { include: { partner: { select: { id: true, name: true } } } } } });
  const { url, hours } = await issuePasswordLink(accountId, purpose, staffId);
  const m = await renderTemplate("partner-password-link", { name: a.contact.name, partner: a.contact.partner.name, url, hours, invite: purpose === "set" });
  await sendMail({ to: a.email, subject: m.subject, html: m.html, text: m.text, template: "partner-password-link", meta: { accountId, purpose } });
  await portalLog(a.contact.partner.id, "password", true, purpose === "set" ? "Στάλθηκε πρόσκληση ορισμού κωδικού" : "Στάλθηκε link αλλαγής κωδικού", { accountId, staffId });
  return { url, hours };
}

/** «Ξέχασα τον κωδικό»: πάντα ίδια απάντηση, ώστε να μη φαίνεται ποια email υπάρχουν. */
export async function requestReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const a = await db.partnerAccount.findUnique({ where: { email }, select: { id: true, active: true, tokens: { where: { purpose: "reset", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } }, select: { id: true } } } });
  if (a?.active && a.tokens.length < 3) await sendPasswordLink(a.id, "reset").catch(() => null);
}

export async function checkLink(token: string) {
  const t = await db.partnerToken.findUnique({ where: { tokenHash: sha(token) }, include: { account: { include: { contact: { include: { partner: { select: { name: true } } } } } } } });
  if (!t || !["set", "reset"].includes(t.purpose)) return { ok: false as const, reason: "missing" as const };
  if (t.usedAt) return { ok: false as const, reason: "used" as const };
  if (t.expiresAt < new Date()) return { ok: false as const, reason: "expired" as const };
  return { ok: true as const, purpose: t.purpose as "set" | "reset", email: t.account.email, name: t.account.contact.name, partner: t.account.contact.partner.name, expiresAt: t.expiresAt };
}

/** Ορισμός κωδικού από link. Συνδέει αμέσως (το link ήρθε στο email — ισοδυναμεί με τον δεύτερο παράγοντα). */
export async function consumeLink(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await db.partnerToken.findUnique({ where: { tokenHash: sha(token) }, include: { account: { include: { contact: { select: { partnerId: true } } } } } });
  if (!t || !["set", "reset"].includes(t.purpose) || t.usedAt || t.expiresAt < new Date()) return { ok: false, error: "Το link δεν ισχύει πια. Ζήτησε νέο." };
  const problems = passwordProblems(password, t.account.email);
  if (problems.length) return { ok: false, error: `Ο κωδικός δεν πληροί: ${problems.join(", ")}.` };
  if (t.account.passwordHash && (await bcrypt.compare(password, t.account.passwordHash))) return { ok: false, error: "Διάλεξε κωδικό διαφορετικό από τον προηγούμενο." };
  const now = new Date();
  await db.$transaction([
    db.partnerToken.update({ where: { id: t.id }, data: { usedAt: now } }),
    db.partnerAccount.update({ where: { id: t.accountId }, data: { passwordHash: await bcrypt.hash(password, 10), passwordAt: now, failedCount: 0, lockedUntil: null, lastLoginAt: now } }),
  ]);
  await portalLog(t.account.contact.partnerId, "password", true, t.purpose === "set" ? "Ορίστηκε κωδικός (πρόσκληση)" : "Άλλαξε ο κωδικός (link)", { accountId: t.accountId });
  await createPortalSession(t.accountId);
  return { ok: true };
}

/** Αλλαγή κωδικού μέσα από την πύλη (με τον τρέχοντα κωδικό). Ακυρώνει τις άλλες συνεδρίες. */
export async function changePassword(accountId: string, current: string, next: string): Promise<{ ok: true } | { ok: false; error: string; field?: "current" | "next" }> {
  const a = await db.partnerAccount.findUniqueOrThrow({ where: { id: accountId }, include: { contact: { select: { partnerId: true } } } });
  if (!a.passwordHash || !(await bcrypt.compare(current, a.passwordHash))) return { ok: false, error: "Ο τρέχων κωδικός δεν είναι σωστός.", field: "current" };
  const problems = passwordProblems(next, a.email);
  if (problems.length) return { ok: false, error: `Ο νέος κωδικός δεν πληροί: ${problems.join(", ")}.`, field: "next" };
  if (current === next) return { ok: false, error: "Ο νέος κωδικός είναι ίδιος με τον τρέχοντα.", field: "next" };
  await db.partnerAccount.update({ where: { id: a.id }, data: { passwordHash: await bcrypt.hash(next, 10), passwordAt: new Date() } });
  await portalLog(a.contact.partnerId, "password", true, "Άλλαξε ο κωδικός από την πύλη", { accountId });
  await createPortalSession(a.id); // νέα συνεδρία εδώ· οι υπόλοιπες ακυρώνονται από το passwordAt
  return { ok: true };
}
