import "server-only";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { EncryptJWT, SignJWT, jwtDecrypt, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { recordLogin } from "@/lib/gdpr/consent";
import { rateLimiter } from "@/lib/account/profile-core";
import { phoneDigits } from "@/lib/orders/contact";
import { safeNext } from "@/lib/security/safe-next";

/** Customer session: signed JWT cookie (30 days), separate from the staff Auth.js session. */
const COOKIE = "eu_session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export async function createCustomerSession(customerId: string) {
  const jwt = await new SignJWT({ sub: customerId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
}
export async function destroyCustomerSession() {
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
}
export async function getCustomerSession() {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, key());
    const id = String(payload.sub ?? "");
    const customer = await db.customer.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, status: true, loyaltyPoints: true, number: true } });
    return customer && customer.status === "active" ? customer : null;
  } catch {
    return null;
  }
}

/** Email + password login with evidence on every attempt. */
export async function loginCustomer(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || !c.passwordHash) { await recordLogin({ email, success: false, method: "password", reason: "unknown" }); return { ok: false as const, error: "Λάθος email ή κωδικός." }; }
  if (c.status !== "active") { await recordLogin({ customerId: c.id, email, success: false, method: "password", reason: "blocked" }); return { ok: false as const, error: "Ο λογαριασμός δεν είναι ενεργός. Επικοινώνησε μαζί μας." }; }
  if (!(await bcrypt.compare(password, c.passwordHash))) { await recordLogin({ customerId: c.id, email, success: false, method: "password", reason: "bad-password" }); return { ok: false as const, error: "Λάθος email ή κωδικός." }; }
  await db.customer.update({ where: { id: c.id }, data: { lastLoginAt: new Date() } });
  await recordLogin({ customerId: c.id, email, success: true, method: "password" });
  await db.customerEvent.create({ data: { customerId: c.id, kind: "login", meta: { method: "password" } } }).catch(() => null);
  await createCustomerSession(c.id);
  return { ok: true as const, name: c.firstName };
}

/* ---------- εγγραφή με επιβεβαίωση email ---------- */

const REGISTER_AUD = "register", REGISTER_HOURS = 24;
/** Το token της εγγραφής είναι ΚΡΥΠΤΟΓΡΑΦΗΜΕΝΟ (όχι απλώς υπογεγραμμένο): κουβαλά το hash του κωδικού μέσα σε σύνδεσμο. */
const sealKey = () => createHash("sha256").update(process.env.AUTH_SECRET ?? "dev-secret").digest();
const registerLimit = rateLimiter(5, 3600000);
interface PendingRegistration { email: string; firstName: string; lastName: string; mobile: string | null; passwordHash: string; source: string; next: string }

/**
 * Εγγραφή πελάτη από το site, βήμα 1: έλεγχος στοιχείων και email με σύνδεσμο επιβεβαίωσης (24 ώρες). Ο λογαριασμός
 * ΔΕΝ δημιουργείται εδώ — μόνο όταν πατηθεί ο σύνδεσμος (confirmRegistration), άρα δεν μένουν ανεπιβεβαίωτοι
 * λογαριασμοί στη βάση και κανείς δεν πιάνει ξένο email. Τα στοιχεία ταξιδεύουν μέσα στο κρυπτογραφημένο token.
 */
export async function registerCustomer(input: { firstName: string; lastName: string; email: string; mobile?: string; password: string; acceptTerms: boolean; source?: string; next?: string; origin: string }) {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim(), lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false as const, error: "Συμπλήρωσε όνομα και επώνυμο." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Το email δεν φαίνεται σωστό." };
  const mobile = phoneDigits(input.mobile);
  if (input.mobile?.trim() && !/^\d{10}$/.test(mobile)) return { ok: false as const, error: "Το κινητό θέλει 10 ψηφία, με ή χωρίς +30 (π.χ. 6912345678 ή +30 6912345678)." };
  if (input.password.length < 8) return { ok: false as const, error: "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες." };
  if (!input.acceptTerms) return { ok: false as const, error: "Χρειάζεται η αποδοχή των όρων χρήσης." };
  // υπάρχει ήδη (με κωδικό, ή από αγορά ως επισκέπτης / από το κατάστημα χωρίς κωδικό): ΠΟΤΕ δεν ορίζουμε κωδικό σε
  // υπάρχοντα πελάτη από εδώ — όποιος ήξερε το email θα έπαιρνε τον λογαριασμό. Η επιβεβαίωση γίνεται με «Ξέχασα τον κωδικό» (email).
  const exists = await db.customer.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { ok: false as const, error: "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου, ή πάτα «Ξέχασα τον κωδικό» για να ορίσεις κωδικό.", exists: true };
  const { captureEvidence } = await import("@/lib/gdpr/evidence");
  const ev = await captureEvidence();
  // και τα δύο κλειδιά μετράνε πάντα (όχι ||), ώστε να μη στέλνουμε σωρό email σε ξένη διεύθυνση
  const tooMany = [registerLimit.hit(`e:${email}`), registerLimit.hit(`i:${ev.ip ?? "?"}`)].some(Boolean);
  if (tooMany) return { ok: false as const, error: "Στείλαμε ήδη αρκετά email επιβεβαίωσης. Δοκίμασε ξανά σε μία ώρα." };
  const pending: PendingRegistration = { email, firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), mobile: mobile || null, passwordHash: await bcrypt.hash(input.password, 10), source: input.source ?? "register", next: safeNext(input.next, "/logariasmos") };
  const token = await new EncryptJWT({ ...pending }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setAudience(REGISTER_AUD).setIssuedAt().setExpirationTime(`${REGISTER_HOURS}h`).encrypt(sealKey());
  const { sendMail } = await import("@/lib/email/send");
  const { renderTemplate } = await import("@/lib/email/templates");
  const m = await renderTemplate("account-welcome", { firstName, verifyUrl: `${input.origin}/api/account/verify?token=${encodeURIComponent(token)}` });
  try { await sendMail({ to: email, template: "account-welcome", ...m }); } catch { return { ok: false as const, error: "Δεν μπορέσαμε να στείλουμε το email επιβεβαίωσης. Δοκίμασε ξανά σε λίγο." }; }
  return { ok: true as const, pending: true as const, sentTo: email, hours: REGISTER_HOURS };
}

/**
 * Εγγραφή, βήμα 2 (ο σύνδεσμος του email): δημιουργεί τον λογαριασμό με επιβεβαιωμένο email και συνδέει τον πελάτη.
 * «done» = ο σύνδεσμος ξαναπατήθηκε ή το email πιάστηκε στο μεταξύ· δεν συνδέουμε ποτέ σε υπάρχοντα λογαριασμό από εδώ.
 */
export async function confirmRegistration(token: string): Promise<{ status: "ok"; next: string } | { status: "expired" | "done" }> {
  let p: PendingRegistration;
  try {
    const { payload } = await jwtDecrypt(token, sealKey(), { audience: REGISTER_AUD, keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    p = payload as unknown as PendingRegistration;
    if (!p.email || !p.passwordHash || !p.firstName) return { status: "expired" };
  } catch { return { status: "expired" }; }
  const c = await db.customer.create({ data: { email: p.email, firstName: p.firstName, lastName: p.lastName, mobile: p.mobile, passwordHash: p.passwordHash, source: "web", emailVerifiedAt: new Date(), lastLoginAt: new Date() } })
    .catch((e: { code?: string }) => (e?.code === "P2002" ? null : Promise.reject(e))); // το email είναι unique: δεύτερο κλικ → «done»
  if (!c) return { status: "done" };
  const { recordConsent } = await import("@/lib/gdpr/consent");
  await recordConsent({ customerId: c.id, email: p.email, topic: "terms", channel: "web", granted: true, method: "checkbox", source: p.source, evidence: { step: "register" } }).catch(() => null);
  await db.customerEvent.create({ data: { customerId: c.id, kind: "register", meta: { source: p.source, emailVerified: true } } }).catch(() => null);
  await recordLogin({ customerId: c.id, email: p.email, success: true, method: "register" }).catch(() => null);
  await createCustomerSession(c.id);
  // κουπόνι καλωσορίσματος, αν το έχει ορίσει ο υπεύθυνος προσφορών (Προσφορές → Κανόνες)· ποτέ δεν μπλοκάρει την εγγραφή
  const { issueWelcomeCoupon } = await import("@/lib/promo/issue");
  await issueWelcomeCoupon("signup", { email: p.email, customerId: c.id, firstName: p.firstName });
  return { status: "ok", next: safeNext(p.next, "/logariasmos") };
}
