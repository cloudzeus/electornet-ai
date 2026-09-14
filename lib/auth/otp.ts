import "server-only";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { captureEvidence } from "@/lib/gdpr/evidence";
import { recordLogin } from "@/lib/gdpr/consent";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

/**
 * Δεύτερος παράγοντας για το προσωπικό.
 *
 * Ροή: σωστός κωδικός → δημιουργείται challenge και στέλνεται 6ψήφιος
 * κωδικός στο εταιρικό email → η συνεδρία δίνεται μόνο αφού επαληθευτεί.
 * Ο κωδικός δεν αποθηκεύεται ποτέ σε καθαρή μορφή και το challenge καίγεται
 * με τη χρήση του.
 *
 * Σκόπιμα **δεν** υπάρχει παράκαμψη όταν αποτύχει η αποστολή email: ένας
 * δεύτερος παράγοντας που παρακάμπτεται δεν είναι δεύτερος παράγοντας. Αν το
 * email δεν φεύγει, η σύνδεση μπλοκάρει και το λέει καθαρά.
 */
export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Πόσα challenges επιτρέπονται ανά λογαριασμό σε 15 λεπτά. */
const MAX_PER_WINDOW = 5;

export type IssueResult =
  | { ok: true; challengeId: string; maskedEmail: string; expiresAt: Date }
  | { ok: false; code: "rate" | "email-failed" | "blocked"; message: string };

/** «gkozyris@i4ria.com» → «gk•••••@i4ria.com» */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${"•".repeat(Math.max(3, user.length - head.length))}@${domain}`;
}

/** Δημιουργεί challenge και στέλνει τον κωδικό. Καλείται ΜΟΝΟ αφού έχει επαληθευτεί ο κωδικός πρόσβασης. */
export async function issueStaffOtp(staff: { id: string; email: string; name: string | null }): Promise<IssueResult> {
  const since = new Date(Date.now() - 15 * 60000);
  const recent = await db.staffLoginChallenge.count({ where: { staffId: staff.id, createdAt: { gte: since } } });
  if (recent >= MAX_PER_WINDOW) return { ok: false, code: "rate", message: "Πολλές προσπάθειες σύνδεσης. Δοκίμασε ξανά σε λίγα λεπτά." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Εκτός request scope (script/cron) δεν υπάρχουν headers: τα τεκμήρια είναι
  // προαιρετικά, δεν επιτρέπεται να ρίξουν τη σύνδεση.
  const ev = await captureEvidence().catch(() => ({ ip: null, ipHash: null, userAgent: null, os: null, browser: null }) as Awaited<ReturnType<typeof captureEvidence>>);
  const challenge = await db.staffLoginChallenge.create({
    data: {
      staffId: staff.id,
      email: staff.email,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60000),
      ip: ev.ip, ipHash: ev.ipHash, userAgent: ev.userAgent,
    },
  });

  const mail = await renderTemplate("staff-login-otp", {
    name: staff.name ?? staff.email,
    code,
    minutes: OTP_TTL_MIN,
    device: [ev.browser, ev.os].filter(Boolean).join(" · ") || "άγνωστη συσκευή",
    ip: ev.ip ?? "—",
  });
  const sent = await sendMail({ to: staff.email, template: "staff-login-otp", meta: { challengeId: challenge.id }, ...mail });
  const delivered = sent.ok;
  await db.staffLoginChallenge.update({ where: { id: challenge.id }, data: { sent: delivered } });
  if (!delivered) {
    await recordLogin({ staffId: staff.id, email: staff.email, success: false, method: "admin", reason: "otp-email-failed" });
    return { ok: false, code: "email-failed", message: "Δεν στάλθηκε ο κωδικός επιβεβαίωσης. Έλεγξε τις ρυθμίσεις email και δοκίμασε ξανά." };
  }
  return { ok: true, challengeId: challenge.id, maskedEmail: maskEmail(staff.email), expiresAt: challenge.expiresAt };
}

export type VerifyResult = { ok: true; staffId: string } | { ok: false; message: string };

/** Επαληθεύει τον κωδικό ενός challenge και τον καίει. */
export async function verifyStaffOtp(challengeId: string, code: string): Promise<VerifyResult> {
  const c = await db.staffLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!c || c.usedAt) return { ok: false, message: "Άκυρος ή χρησιμοποιημένος κωδικός. Ξεκίνα από την αρχή." };
  if (c.expiresAt < new Date()) return { ok: false, message: "Ο κωδικός έληξε. Ζήτα καινούργιο." };
  if (c.attempts >= OTP_MAX_ATTEMPTS) {
    await db.staffLoginChallenge.update({ where: { id: c.id }, data: { usedAt: new Date() } });
    await recordLogin({ staffId: c.staffId, email: c.email, success: false, method: "admin", reason: "otp-attempts" });
    return { ok: false, message: "Πολλές λάθος προσπάθειες. Ξεκίνα από την αρχή." };
  }
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !(await bcrypt.compare(clean, c.codeHash))) {
    const attempts = c.attempts + 1;
    await db.staffLoginChallenge.update({ where: { id: c.id }, data: { attempts } });
    return { ok: false, message: `Λάθος κωδικός. Απομένουν ${Math.max(0, OTP_MAX_ATTEMPTS - attempts)} προσπάθειες.` };
  }
  await db.staffLoginChallenge.update({ where: { id: c.id }, data: { usedAt: new Date() } });
  return { ok: true, staffId: c.staffId };
}

/** Καθαρισμός ληγμένων challenges (καλείται από το cron των backups/lookups). */
export const purgeExpiredChallenges = () => db.staffLoginChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400000) } } });
