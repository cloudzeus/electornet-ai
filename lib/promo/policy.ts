import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Κανόνες επικάλυψης και δικλείδες των προσφορών. Τους αλλάζει ο υπεύθυνος προσφορών (catalog.promos.write) από
 * /admin/prosfores/kanones — γι' αυτό ζουν σε δική τους εγγραφή (Setting "promos") και όχι στις ρυθμίσεις του super-admin.
 */
export interface PromoPolicy {
  /** μέγιστη έκπτωση ανά γραμμή (%), εκτός από 1+1 / 2ο −Χ % / κλίμακες */
  maxLinePct: number;
  /** ποτέ κάτω από το κόστος: «block» = δεν εφαρμόζεται κάτω από το κόστος, «warn» = μόνο προειδοποίηση στον οδηγό */
  belowCost: "block" | "warn";
  /** κουπόνι μαζί με προσφορά τιμής: προεπιλογή για νέα κουπόνια */
  couponDefaultStacking: "no-price" | "combine";
  /** έγκριση δεύτερου προσώπου όταν η έκπτωση ξεπερνά αυτό το % */
  approvalAbovePct: number;
  /** ή όταν το budget ξεπερνά αυτό το ποσό (€) */
  approvalAboveBudget: number;
  /** ή όταν αφορά περισσότερα από τόσα προϊόντα */
  approvalAboveProducts: number;
  /** ετικέτες ανά κάρτα προϊόντος */
  maxTagsPerCard: number;
  /** κωδικός προσφοράς-κουπονιού που εκδίδεται στην εγγραφή (κενό = όχι) */
  signupPromotion: string;
  /** κωδικός προσφοράς-κουπονιού που εκδίδεται στην επιβεβαίωση newsletter (κενό = όχι) */
  newsletterPromotion: string;
  /** ημέρες ισχύος των προσωπικών κουπονιών */
  couponValidDays: number;
}

export const DEFAULT_POLICY: PromoPolicy = {
  maxLinePct: 40, belowCost: "block", couponDefaultStacking: "no-price",
  approvalAbovePct: 30, approvalAboveBudget: 5000, approvalAboveProducts: 500,
  maxTagsPerCard: 2, signupPromotion: "", newsletterPromotion: "", couponValidDays: 30,
};

const SECTION = "promos";
let cached: { at: number; v: PromoPolicy } | null = null;

export async function getPromoPolicy(): Promise<PromoPolicy> {
  if (cached && Date.now() - cached.at < 15_000) return cached.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = { ...DEFAULT_POLICY, ...((row?.data as Partial<PromoPolicy> | null) ?? {}) };
  cached = { at: Date.now(), v };
  return v;
}

export async function savePromoPolicy(next: PromoPolicy, staffId: string | null) {
  const data = sanitize(next);
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data: data as unknown as Prisma.InputJsonValue, updatedById: staffId }, update: { data: data as unknown as Prisma.InputJsonValue, updatedById: staffId } });
  cached = null;
  return data;
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => { const x = Number(n); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : d; };
export function sanitize(p: Partial<PromoPolicy>): PromoPolicy {
  const d = DEFAULT_POLICY;
  return {
    maxLinePct: clamp(p.maxLinePct, 5, 100, d.maxLinePct),
    belowCost: p.belowCost === "warn" ? "warn" : "block",
    couponDefaultStacking: p.couponDefaultStacking === "combine" ? "combine" : "no-price",
    approvalAbovePct: clamp(p.approvalAbovePct, 0, 100, d.approvalAbovePct),
    approvalAboveBudget: clamp(p.approvalAboveBudget, 0, 10_000_000, d.approvalAboveBudget),
    approvalAboveProducts: clamp(p.approvalAboveProducts, 0, 1_000_000, d.approvalAboveProducts),
    maxTagsPerCard: clamp(p.maxTagsPerCard, 1, 4, d.maxTagsPerCard),
    signupPromotion: String(p.signupPromotion ?? "").trim().toUpperCase().slice(0, 60),
    newsletterPromotion: String(p.newsletterPromotion ?? "").trim().toUpperCase().slice(0, 60),
    couponValidDays: clamp(p.couponValidDays, 1, 365, d.couponValidDays),
  };
}
