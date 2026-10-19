"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { recordLogin } from "@/lib/gdpr/consent";
import { issueStaffOtp, maskEmail } from "@/lib/auth/otp";
import { LOGIN_LIMITS, loginBlocked } from "@/lib/auth/throttle";
import { captureEvidence } from "@/lib/gdpr/evidence";

const COOKIE = "eu_admin_chal";

export interface Step1State { error?: string; sentTo?: string; expiresAt?: string }

/**
 * Βήμα 1: έλεγχος κωδικού πρόσβασης και αποστολή OTP.
 *
 * Η απάντηση είναι σκόπιμα ίδια για «άγνωστο email» και «λάθος κωδικός»,
 * ώστε η φόρμα να μην αποκαλύπτει ποιοι λογαριασμοί υπάρχουν.
 */
export async function requestOtp(_prev: Step1State, fd: FormData): Promise<Step1State> {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const password = String(fd.get("password") ?? "");
  const generic = "Λάθος email ή κωδικός.";
  if (!email || !password) return { error: generic };
  // πολλές αποτυχίες για αυτό το email ή από αυτή τη διεύθυνση IP: παύση πριν ελεγχθεί ο κωδικός
  const since = new Date(Date.now() - LOGIN_LIMITS.windowMin * 60_000);
  const { ipHash } = await captureEvidence();
  // μετρούν οι λάθος κωδικοί / άγνωστα email — όχι οι ίδιες οι φραγές, ώστε η φραγή να λήγει 15′ μετά την τελευταία προσπάθεια
  const failed = { success: false, method: "admin", reason: { in: ["bad-password", "unknown", "blocked"] }, at: { gte: since } };
  const [byEmail, byIp] = await Promise.all([db.loginEvent.count({ where: { ...failed, email } }), ipHash ? db.loginEvent.count({ where: { ...failed, ipHash } }) : 0]);
  if (loginBlocked({ byEmail, byIp })) {
    await recordLogin({ email, success: false, method: "admin", reason: "throttled" });
    return { error: `Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε ${LOGIN_LIMITS.windowMin} λεπτά.` };
  }
  const staff = await db.staff.findUnique({ where: { email }, include: { roles: true } });
  if (!staff || !staff.active || !staff.passwordHash) {
    await recordLogin({ email, success: false, method: "admin", reason: !staff ? "unknown" : "blocked" });
    return { error: generic };
  }
  if (!(await bcrypt.compare(password, staff.passwordHash))) {
    await recordLogin({ staffId: staff.id, email, success: false, method: "admin", reason: "bad-password" });
    return { error: generic };
  }
  if (!staff.roles.length) {
    await recordLogin({ staffId: staff.id, email, success: false, method: "admin", reason: "no-access" });
    return { error: "Ο λογαριασμός δεν έχει πρόσβαση στη διαχείριση." };
  }
  const r = await issueStaffOtp({ id: staff.id, email: staff.email, name: staff.name });
  if (!r.ok) return { error: r.message };
  (await cookies()).set(COOKIE, r.challengeId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: 15 * 60 });
  return { sentTo: r.maskedEmail, expiresAt: r.expiresAt.toISOString() };
}

/** Το τρέχον challenge (για το βήμα 2) — null αν δεν υπάρχει ή έληξε. */
export async function currentChallenge() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const c = await db.staffLoginChallenge.findUnique({ where: { id }, select: { id: true, email: true, expiresAt: true, usedAt: true } });
  if (!c || c.usedAt || c.expiresAt < new Date()) return null;
  return { id: c.id, maskedEmail: maskEmail(c.email), expiresAt: c.expiresAt.toISOString() };
}

/** Ακύρωση: ο χρήστης πάτησε «άλλος λογαριασμός». */
export async function cancelChallenge() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.staffLoginChallenge.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  jar.delete(COOKIE);
}
