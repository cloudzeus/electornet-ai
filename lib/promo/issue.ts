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

interface IssueInput { promotionCode: string; trigger: IssueTrigger; email: string; customerId?: string | null; firstName?: string | null; validDays?: number; prefix?: string; send?: boolean; staffId?: string | null }

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

  const existing = await db.coupon.findFirst({ where: { promotionId: promo.id, kind: "unique", OR: [{ email }, ...(input.customerId ? [{ customerId: input.customerId }] : [])] } });
  if (existing) return { ok: true as const, coupon: existing, created: false };

  const days = input.validDays ?? (await getPromoPolicy()).couponValidDays;
  let expiresAt = new Date(Date.now() + days * 86400_000);
  if (promo.endsAt && promo.endsAt < expiresAt) expiresAt = promo.endsAt;
  let coupon = null;
  for (let i = 0; i < 5 && !coupon; i++) {
    coupon = await db.coupon.create({ data: { code: randomCode(input.prefix ?? (input.trigger === "newsletter" ? "NL" : input.trigger === "signup" ? "WELCOME" : "EU")), promotionId: promo.id, kind: "unique", email, customerId: input.customerId ?? null, trigger: input.trigger, expiresAt, maxUses: 1 } }).catch(() => null); // σύγκρουση κωδικού: ξανά
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
