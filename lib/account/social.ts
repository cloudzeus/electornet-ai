import "server-only";
import { db } from "@/lib/db";
import { createCustomerSession } from "./session";
import { recordConsent, recordLogin } from "@/lib/gdpr/consent";
import type { OAuthProfile } from "./oauth";

/**
 * Σύνδεση / εγγραφή από προφίλ παρόχου:
 *  1. υπάρχει ήδη σύνδεση με αυτόν τον λογαριασμό παρόχου → είσοδος
 *  2. υπάρχει πελάτης με το ίδιο email → δένεται ΜΟΝΟ αν ο πάροχος εγγυάται ότι το email είναι επιβεβαιωμένο
 *     (αλλιώς κάποιος θα μπορούσε να «πάρει» ξένο λογαριασμό δηλώνοντας το email του)
 *  3. αλλιώς νέος λογαριασμός (με αποδοχή όρων, όπως γράφει δίπλα στα κουμπιά)
 */
export type SocialError = "no-email" | "unverified-exists" | "blocked";
export async function signInWithProfile(p: OAuthProfile, opts: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true; customerId: string; created: boolean } | { ok: false; error: SocialError }> {
  const linked = await db.socialAccount.findUnique({ where: { provider_providerAccountId: { provider: p.provider, providerAccountId: p.sub } }, include: { customer: { select: { id: true, status: true } } } });
  let customerId: string | null = null, created = false;
  if (linked) {
    if (linked.customer.status !== "active") return { ok: false, error: "blocked" };
    customerId = linked.customer.id;
  } else {
    if (!p.email) return { ok: false, error: "no-email" };
    const existing = await db.customer.findUnique({ where: { email: p.email }, select: { id: true, status: true, emailVerifiedAt: true } });
    if (existing) {
      if (existing.status !== "active") return { ok: false, error: "blocked" };
      if (!p.emailVerified) return { ok: false, error: "unverified-exists" };
      customerId = existing.id;
      if (!existing.emailVerifiedAt) await db.customer.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
    } else {
      const c = await db.customer.create({ data: { email: p.email, firstName: p.firstName.trim() || p.email.split("@")[0], lastName: p.lastName.trim(), source: "web", emailVerifiedAt: p.emailVerified ? new Date() : null } });
      customerId = c.id; created = true;
      await recordConsent({ customerId: c.id, email: p.email, topic: "terms", channel: "web", granted: true, method: "social-button", source: `social:${p.provider}`, evidence: { step: "social-register", provider: p.provider } }).catch(() => null);
      await db.customerEvent.create({ data: { customerId: c.id, kind: "register", meta: { source: `social:${p.provider}` } } }).catch(() => null);
    }
    await db.socialAccount.create({ data: { customerId, provider: p.provider, providerAccountId: p.sub, email: p.email } });
  }
  await db.customer.update({ where: { id: customerId }, data: { lastLoginAt: new Date() } });
  await recordLogin({ customerId, email: p.email ?? "", success: true, method: `social:${p.provider}` }).catch(() => null);
  await db.customerEvent.create({ data: { customerId, kind: "login", meta: { method: `social:${p.provider}`, ip: opts.ip ?? null } } }).catch(() => null);
  await createCustomerSession(customerId);
  if (created) { const { issueWelcomeCoupon } = await import("@/lib/promo/issue"); const c = await db.customer.findUnique({ where: { id: customerId }, select: { email: true, firstName: true } }); if (c) await issueWelcomeCoupon("signup", { email: c.email, customerId, firstName: c.firstName }); }
  return { ok: true, customerId, created };
}

export const SOCIAL_ERRORS: Record<SocialError | "failed" | "state" | "off", string> = {
  "no-email": "Ο λογαριασμός δεν μας έδωσε email. Δοκίμασε άλλον τρόπο ή δώσε πρόσβαση στο email.",
  "unverified-exists": "Υπάρχει ήδη λογαριασμός με αυτό το email και ο πάροχος δεν επιβεβαίωσε ότι το email είναι δικό σου. Συνδέσου με τον κωδικό σου — αν δεν τον θυμάσαι, πάτα «Ξέχασα τον κωδικό».",
  blocked: "Ο λογαριασμός δεν είναι ενεργός. Επικοινώνησε μαζί μας.",
  failed: "Η σύνδεση δεν ολοκληρώθηκε. Δοκίμασε ξανά.",
  state: "Η σύνδεση έληξε ή άνοιξε σε άλλο παράθυρο. Δοκίμασε ξανά.",
  off: "Αυτός ο τρόπος σύνδεσης δεν είναι διαθέσιμος.",
};
