import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";
import { audit } from "@/lib/rbac/audit";
import { getPromoPolicy } from "./policy";

/**
 * Προσωπικά κουπόνια (εγγραφή, newsletter, χειροκίνητα από το διαχειριστικό). Κάθε κουπόνι είναι μοναδικός κωδικός
 * δεμένος με ένα email / πελάτη, μίας χρήσης, με λήξη. Η αξία και οι όροι είναι της προσφοράς-κουπονιού στην οποία ανήκει.
 * Ένα κουπόνι ανά email ανά προσφορά — μια δεύτερη εγγραφή ή επιβεβαίωση δεν δίνει δεύτερο.
 */

export type IssueTrigger = "signup" | "newsletter" | "manual" | "birthday" | "next-order" | "cart";

// χωρίς 0/O/1/I/L για να μη μπερδεύονται στο διάβασμα
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCode(prefix = "EU", len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10) || "EU"}-${s}`;
}

const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
export function couponValueLabel(p: { mechanism: string; reward: unknown }) {
  const r = (p.reward ?? {}) as { percent?: number; amount?: number };
  return p.mechanism === "coupon-percent" ? `${r.percent ?? 0} % έκπτωση` : `${eur(r.amount ?? 0)} έκπτωση`;
}

interface IssueInput {
  promotionCode: string; trigger: IssueTrigger; email: string; customerId?: string | null; firstName?: string | null; validDays?: number; prefix?: string; send?: boolean; staffId?: string | null;
  /** «ever»: ένα ανά email για πάντα (εγγραφή, newsletter) · «active»: όχι αν έχει ήδη αχρησιμοποίητο σε ισχύ (επόμενη αγορά, καλάθι) · «year»: ένα τον χρόνο (γενέθλια) */
  dedupe?: "ever" | "active" | "year";
}

/** Εκδίδει (ή επιστρέφει το ήδη εκδομένο) προσωπικό κουπόνι. Δεν πετάει σφάλμα προς τα έξω — επιστρέφει τον λόγο. */
export async function issueCoupon(input: IssueInput) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, reason: "μη έγκυρο email" };
  const promo = await db.promotion.findUnique({ where: { code: input.promotionCode.trim().toUpperCase() } });
  if (!promo) return { ok: false as const, reason: "η προσφορά δεν υπάρχει" };
  if (!promo.mechanism.startsWith("coupon")) return { ok: false as const, reason: "η προσφορά δεν είναι κουπόνι" };
  if (promo.held) return { ok: false as const, reason: "η προσφορά είναι ανενεργή μέχρι διευκρίνιση" };
  if (!["active", "scheduled"].includes(promo.status)) return { ok: false as const, reason: `η προσφορά είναι σε κατάσταση «${promo.status}»` };
  if (promo.endsAt && promo.endsAt < new Date()) return { ok: false as const, reason: "η προσφορά έχει λήξει" };

  const dedupe = input.dedupe ?? "ever";
  const now = new Date();
  const existing = await db.coupon.findFirst({
    where: {
      promotionId: promo.id, kind: "unique",
      AND: [
        { OR: [{ email }, ...(input.customerId ? [{ customerId: input.customerId }] : [])] },
        ...(dedupe === "active" ? [{ usedCount: 0 }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] : dedupe === "year" ? [{ createdAt: { gt: new Date(now.getTime() - 300 * 86400_000) } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return { ok: true as const, coupon: existing, created: false };

  const days = input.validDays ?? (await getPromoPolicy()).couponValidDays;
  let expiresAt = new Date(Date.now() + days * 86400_000);
  if (promo.endsAt && promo.endsAt < expiresAt) expiresAt = promo.endsAt;
  let coupon = null;
  for (let i = 0; i < 5 && !coupon; i++) {
    coupon = await db.coupon.create({ data: { code: randomCode(input.prefix ?? ({ newsletter: "NL", signup: "WELCOME", "next-order": "NEXT", birthday: "BDAY", cart: "CART" } as Record<string, string>)[input.trigger] ?? "EU"), promotionId: promo.id, kind: "unique", email, customerId: input.customerId ?? null, trigger: input.trigger, expiresAt, maxUses: 1 } }).catch(() => null); // σύγκρουση κωδικού: ξανά
  }
  if (!coupon) return { ok: false as const, reason: "δεν βρέθηκε ελεύθερος κωδικός" };
  if (input.staffId) await audit(input.staffId, "coupon.issue", "Coupon", coupon.id, null, { code: coupon.code, email, promotion: promo.code }).catch(() => null);

  if (input.send !== false) {
    const rules = (promo.rules ?? {}) as { minValue?: number };
    const m = await renderTemplate("coupon-issued", {
      firstName: input.firstName ?? null, code: coupon.code, value: couponValueLabel(promo), minValue: rules.minValue ? eur(rules.minValue) : null,
      until: expiresAt.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" }), terms: promo.termsText ?? null, trigger: input.trigger,
    });
    await sendMail({ to: email, template: "coupon-issued", meta: { couponId: coupon.id, promotionId: promo.id }, ...m }).catch(() => null);
  }
  return { ok: true as const, coupon, created: true };
}

/** Από τα σημεία της βιτρίνας (εγγραφή, newsletter): βάσει των κανόνων προσφορών. Ποτέ δεν μπλοκάρει τη ροή. */
export async function issueWelcomeCoupon(trigger: "signup" | "newsletter", who: { email: string; customerId?: string | null; firstName?: string | null }) {
  try {
    const policy = await getPromoPolicy();
    const code = trigger === "signup" ? policy.signupPromotion : policy.newsletterPromotion;
    if (!code) return null;
    return await issueCoupon({ promotionCode: code, trigger, ...who });
  } catch {
    return null;
  }
}

/** Παρτίδα μοναδικών κωδικών (π.χ. για φυλλάδιο, συνεργάτη, κατάστημα). Χωρίς email — όποιος έχει τον κωδικό, μία χρήση. */
export async function createCouponBatch(input: { promotionId: string; count: number; prefix: string; validDays: number | null; staffId: string }) {
  const promo = await db.promotion.findUnique({ where: { id: input.promotionId } });
  if (!promo || !promo.mechanism.startsWith("coupon")) return { ok: false as const, error: "Διάλεξε προσφορά-κουπόνι." };
  if (promo.held) return { ok: false as const, error: "Η προσφορά είναι ανενεργή μέχρι διευκρίνιση." };
  const count = Math.max(1, Math.min(5000, Math.floor(input.count)));
  const prefix = input.prefix.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10) || "EU";
  let expiresAt = input.validDays ? new Date(Date.now() + input.validDays * 86400_000) : promo.endsAt;
  if (promo.endsAt && expiresAt && promo.endsAt < expiresAt) expiresAt = promo.endsAt;
  const codes = new Set<string>();
  while (codes.size < count) codes.add(randomCode(prefix, count > 900 ? 8 : 6));
  const taken = new Set((await db.coupon.findMany({ where: { code: { in: [...codes] } }, select: { code: true } })).map((c) => c.code));
  const fresh = [...codes].filter((c) => !taken.has(c));
  await db.coupon.createMany({ data: fresh.map((code) => ({ code, promotionId: promo.id, kind: "unique", trigger: "batch", expiresAt, maxUses: 1 })), skipDuplicates: true });
  await audit(input.staffId, "coupon.batch", "Promotion", promo.id, null, { count: fresh.length, prefix, expiresAt });
  return { ok: true as const, codes: fresh, expiresAt, promotion: promo.code };
}

/**
 * Συναίνεση για προωθητικά email: η τελευταία καταγραφή για «offers» ή «newsletter» μέσω email· αν δεν υπάρχει
 * καταγραφή, η επιλογή newsletter του λογαριασμού. Χωρίς συναίνεση: ο κωδικός εκδίδεται αλλά δεν στέλνεται email.
 */
export async function marketingAllowed(customerIds: string[]): Promise<Set<string>> {
  if (!customerIds.length) return new Set();
  const [consents, customers] = await Promise.all([
    db.consent.findMany({ where: { customerId: { in: customerIds }, topic: { in: ["offers", "newsletter"] }, channel: "email" }, orderBy: { at: "desc" }, select: { customerId: true, granted: true } }),
    db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, newsletter: true } }),
  ]);
  const latest = new Map<string, boolean>();
  for (const c of consents) if (c.customerId && !latest.has(c.customerId)) latest.set(c.customerId, c.granted);
  return new Set(customers.filter((c) => latest.get(c.id) ?? c.newsletter).map((c) => c.id));
}

/** Προσωπικά κουπόνια σε όλα τα μέλη ενός κοινού. Email μόνο σε όσους έχουν δώσει συναίνεση. */
export async function issueToSegment(input: { segmentId: string; promotionCode: string; send: boolean; staffId: string }) {
  const { membersOf } = await import("./segments");
  const seg = await db.segment.findUnique({ where: { id: input.segmentId } });
  if (!seg) return { ok: false as const, error: "Το κοινό δεν βρέθηκε." };
  const members = await membersOf(seg.rules as never, { limit: 5000 });
  const allowed = input.send ? await marketingAllowed(members.map((m) => m.id)) : new Set<string>();
  let issued = 0, existing = 0, emailed = 0, failed = 0;
  for (const m of members) {
    const send = allowed.has(m.id);
    const r = await issueCoupon({ promotionCode: input.promotionCode, trigger: "manual", email: m.email, customerId: m.id, firstName: m.firstName, send, prefix: "VIP" });
    if (!r.ok) { failed++; if (failed === 1 && !issued && !existing) return { ok: false as const, error: r.reason }; continue; }
    if (r.created) { issued++; if (send) emailed++; } else existing++;
  }
  await audit(input.staffId, "coupon.segment", "Segment", seg.id, null, { promotion: input.promotionCode, members: members.length, issued, existing, emailed });
  return { ok: true as const, members: members.length, issued, existing, emailed, noConsent: input.send ? members.length - allowed.size : 0 };
}

/** Κουπόνι από τους κανόνες για ένα γεγονός (επόμενη αγορά, γενέθλια). Ποτέ δεν μπλοκάρει τη ροή που το καλεί. */
export async function issueTriggerCoupon(trigger: "next-order" | "birthday", who: { email: string; customerId?: string | null; firstName?: string | null }, opts: { send: boolean }) {
  try {
    const policy = await getPromoPolicy();
    const code = trigger === "next-order" ? policy.nextOrderPromotion : policy.birthdayPromotion;
    if (!code) return null;
    return await issueCoupon({ promotionCode: code, trigger, ...who, send: opts.send, dedupe: trigger === "birthday" ? "year" : "active" });
  } catch {
    return null;
  }
}
