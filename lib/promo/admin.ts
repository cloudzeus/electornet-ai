import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { services } from "@/lib/data/fixtures/services";
import { evaluate, matches, MULTI_MECHANISMS, PRICE_MECHANISMS, type EngineLine, type EnginePromo, type PromoReward, type PromoRules, type PromoTarget, type Stacking } from "./engine";
import { TEMPLATES, type PromoStatus } from "./catalog";
import { getPromoPolicy } from "./policy";
import { invalidatePromos } from "./server";
import { recomputeOffers } from "./offers";

/** Ό,τι συμπληρώνει ο οδηγός. Ποσά σε λεπτά (όπως η μηχανή), ημερομηνίες ISO. */
export interface PromoDraft {
  id?: string | null;
  template: string;
  name: string;
  mechanism: string;
  priority: number;
  stacking: Stacking;
  startsAt: string | null;
  endsAt: string | null;
  reward: PromoReward;
  rules: PromoRules;
  maxUses: number | null;
  maxPerCustomer: number | null;
  budgetEur: number | null;
  termsText: string | null;
  tagLabel: string | null;
  targets: PromoTarget[];
  /** κοινός κωδικός κουπονιού (μόνο για κουπόνια) */
  couponCode?: string | null;
}

export const emptyDraft = (template = "percent"): PromoDraft => {
  const t = TEMPLATES.find((x) => x.key === template) ?? TEMPLATES[0];
  return { template: t.key, name: "", mechanism: t.mechanism, priority: 100, stacking: t.stacking, startsAt: null, endsAt: null, reward: structuredClone(t.reward), rules: structuredClone(t.rules ?? {}), maxUses: null, maxPerCustomer: null, budgetEur: null, termsText: null, tagLabel: null, targets: [], couponCode: null };
};

type Row = Prisma.PromotionGetPayload<{ include: { targets: true; coupons: true } }>;
export function draftOf(p: Row): PromoDraft {
  const t = TEMPLATES.find((x) => x.mechanism === p.mechanism && !x.held) ?? TEMPLATES[0];
  return {
    id: p.id, template: (p.rules as { template?: string } | null)?.template ?? t.key, name: p.name, mechanism: p.mechanism, priority: p.priority, stacking: p.stacking as Stacking,
    startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, reward: p.reward as PromoReward, rules: stripMeta(p.rules as PromoRules),
    maxUses: p.maxUses, maxPerCustomer: p.maxPerCustomer, budgetEur: p.budgetEur != null ? Number(p.budgetEur) : null, termsText: p.termsText, tagLabel: p.tagLabel,
    targets: p.targets.map((x) => ({ kind: x.kind as PromoTarget["kind"], refId: x.refId, exclude: x.exclude })),
    couponCode: p.coupons.find((c) => c.kind === "shared")?.code ?? null,
  };
}
const stripMeta = (r: PromoRules & { template?: string }) => { const { template: _t, ...rest } = r ?? {}; void _t; return rest; };

// ---- επικύρωση ----
export function validateDraft(d: PromoDraft): string[] {
  const e: string[] = [];
  const t = TEMPLATES.find((x) => x.key === d.template);
  if (!t) e.push("Άγνωστο πρότυπο.");
  if (t?.held) e.push(`Το πρότυπο «${t.title}» είναι ανενεργό μέχρι διευκρίνιση: ${t.held}`);
  if (!d.name.trim()) e.push("Δώσε όνομα στην προσφορά.");
  const r = d.reward ?? {};
  const pct = (n?: number) => n != null && n > 0 && n <= 100;
  switch (d.mechanism) {
    case "price-percent": case "coupon-percent": if (!pct(r.percent)) e.push("Το ποσοστό πρέπει να είναι από 1 έως 100 %."); break;
    case "price-amount": case "coupon-amount": if (!(r.amount && r.amount > 0)) e.push("Το ποσό πρέπει να είναι πάνω από 0 €."); break;
    case "special-price": if (!Object.values(r.price ?? {}).some((v) => v > 0)) e.push("Βάλε ειδική τιμή σε τουλάχιστον έναν κωδικό."); break;
    case "n-plus-m": if (!(r.buy && r.buy >= 1 && r.get && r.get >= 1)) e.push("Συμπλήρωσε «αγοράζεις» και «παίρνεις δωρεάν»."); break;
    case "nth-discount": if (!(r.nth && r.nth >= 2) || !pct(r.percent)) e.push("Συμπλήρωσε ποιο τεμάχιο (2ο, 3ο…) και το ποσοστό."); break;
    case "qty-tiers": if (!(r.tiers ?? []).length || (r.tiers ?? []).some((x) => !(x.minQty >= 2) || !pct(x.percent))) e.push("Κάθε κλίμακα θέλει ποσότητα από 2 και ποσοστό."); break;
    case "gift": if (!r.giftProductId) e.push("Διάλεξε το προϊόν-δώρο."); break;
    case "service": if (!services.some((s) => s.slug === r.serviceSlug)) e.push("Διάλεξε την υπηρεσία που γίνεται δωρεάν."); break;
    case "together":
      if (!(r.with ?? []).some((t) => !t.exclude)) e.push("Διάλεξε τα συνοδευτικά που γίνονται φθηνότερα (βήμα «Προϊόντα»).");
      if (!(pct(r.percent) || (r.amount && r.amount > 0))) e.push("Συμπλήρωσε την έκπτωση στο συνοδευτικό.");
      break;
    case "bundle":
      if ((r.bundle ?? []).length < 2) e.push("Το πακέτο θέλει τουλάχιστον 2 προϊόντα.");
      if (!(r.bundlePrice && r.bundlePrice > 0)) e.push("Βάλε την τιμή του πακέτου.");
      break;
    case "payment-percent": case "payment-amount":
      if (!(d.rules.payment ?? []).length) e.push("Διάλεξε τρόπο πληρωμής.");
      if (d.mechanism === "payment-percent" ? !pct(r.percent) : !(r.amount && r.amount > 0)) e.push("Συμπλήρωσε την έκπτωση.");
      break;
  }
  if (d.rules.earlyAccess?.segments.length && !d.startsAt) e.push("Το early access θέλει ημερομηνία έναρξης.");
  if (d.mechanism.startsWith("coupon") && !d.couponCode?.trim() && !d.id) {
    // επιτρέπεται κουπόνι μόνο με μοναδικούς κωδικούς (παρτίδες / καλωσόρισμα) — απλή υπενθύμιση, όχι σφάλμα
  }
  if (d.couponCode && !/^[A-Z0-9][A-Z0-9-]{2,29}$/.test(d.couponCode.trim().toUpperCase())) e.push("Ο κωδικός κουπονιού: 3–30 λατινικά κεφαλαία, αριθμοί ή «-».");
  if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) e.push("Η λήξη πρέπει να είναι μετά την έναρξη.");
  if (!d.mechanism.startsWith("coupon") && !d.mechanism.startsWith("payment") && d.mechanism !== "shipping" && d.mechanism !== "bundle" && !d.targets.some((x) => !x.exclude) && d.mechanism !== "special-price")
    e.push("Διάλεξε σε ποια προϊόντα, μάρκες ή κατηγορίες ισχύει (για όλο το κατάστημα πρόσθεσε τη ρίζα του καταλόγου).");
  return e;
}

/** Παράγωγα πεδία: στο πακέτο οι στόχοι είναι τα προϊόντα του (για βιτρίνα, ημερολόγιο, επικαλύψεις). */
export function normalizeDraft(d: PromoDraft): PromoDraft {
  if (d.mechanism === "bundle") return { ...d, targets: (d.reward.bundle ?? []).map((i) => ({ kind: "product" as const, refId: i.productId, exclude: false })) };
  return d;
}

// ---- ανάλυση: ποια προϊόντα, πόση έκπτωση, συγκρούσεις, έγκριση ----
interface CatalogLine extends EngineLine { title: string }
let catalogCache: { at: number; lines: CatalogLine[] } | null = null;
async function catalogLines(): Promise<CatalogLine[]> {
  if (catalogCache && Date.now() - catalogCache.at < 120_000) return catalogCache.lines;
  const [products, cats] = await Promise.all([
    db.product.findMany({ where: { active: true }, select: { id: true, title: true, brandId: true, categoryId: true, variants: { select: { id: true, price: true }, take: 1 } } }),
    db.category.findMany({ select: { id: true, parentId: true } }),
  ]);
  const parent = new Map(cats.map((c) => [c.id, c.parentId]));
  const chain = (id: string) => { const out: string[] = []; for (let c: string | null | undefined = id, g = 0; c && g < 8; c = parent.get(c), g++) out.push(c); return out; };
  const lines = products.flatMap((p): CatalogLine[] => { const v = p.variants[0]; const unit = v ? Math.round(Number(v.price) * 100) : 0; return v && unit > 0 ? [{ key: p.id, productId: p.id, variantId: v.id, brandId: p.brandId, categoryIds: chain(p.categoryId), qty: 1, unit, title: p.title }] : []; });
  catalogCache = { at: Date.now(), lines };
  return lines;
}

const asEngine = (d: PromoDraft, id = "draft"): EnginePromo => ({
  id, code: "DRAFT", version: 1, name: d.name || "Προσχέδιο", mechanism: d.mechanism, status: "active", held: false, priority: d.priority, stacking: d.stacking,
  startsAt: null, endsAt: null, reward: d.reward, rules: { ...d.rules, minValue: undefined, minQty: undefined, customers: undefined }, targets: d.targets, usedCount: 0, spentCents: 0,
});
const overlaps = (a: { startsAt: Date | null; endsAt: Date | null }, b: { startsAt: Date | null; endsAt: Date | null }) =>
  (a.startsAt?.getTime() ?? -Infinity) < (b.endsAt?.getTime() ?? Infinity) && (b.startsAt?.getTime() ?? -Infinity) < (a.endsAt?.getTime() ?? Infinity);

export interface DraftAnalysis {
  products: number;
  sample: { title: string; before: number; after: number; pct: number }[];
  maxPct: number;
  capped: number;
  conflicts: { id: string; code: string; name: string; status: string; mechanism: string; shared: number; outcome: string }[];
  approval: { needed: boolean; reasons: string[] };
  errors: string[];
}

export async function analyzeDraft(d0: PromoDraft): Promise<DraftAnalysis> {
  const d = normalizeDraft(d0);
  const [lines, policy] = await Promise.all([catalogLines(), getPromoPolicy()]);
  const me = asEngine(d);
  const special = d.mechanism === "special-price";
  const priceKeys = new Set(Object.keys(d.reward.price ?? {}));
  const mine = lines.filter((l) => (special ? priceKeys.has(l.variantId) || priceKeys.has(l.productId) : matches(me, l)) && (special || d.targets.length > 0 || d.mechanism.startsWith("coupon") || d.mechanism.startsWith("payment") || d.mechanism === "shipping"));
  // έκπτωση ανά προϊόν για ένα τεμάχιο (για 1+1 κ.λπ. με την ελάχιστη ομάδα)
  const qtyFor = d.mechanism === "n-plus-m" ? (d.reward.buy ?? 1) + (d.reward.get ?? 1) : d.mechanism === "nth-discount" ? d.reward.nth ?? 2 : d.mechanism === "qty-tiers" ? Math.max(...(d.reward.tiers ?? [{ minQty: 1 }]).map((t) => t.minQty)) : 1;
  const isPrice = PRICE_MECHANISMS.includes(d.mechanism as never) || MULTI_MECHANISMS.includes(d.mechanism as never);
  let maxPct = 0, capped = 0;
  const sample: DraftAnalysis["sample"] = [];
  if (d.mechanism === "bundle") {
    const items = d.reward.bundle ?? [];
    const sum = items.reduce((a, i) => a + (lines.find((l) => l.productId === i.productId)?.unit ?? 0) * i.qty, 0);
    if (sum && d.reward.bundlePrice) {
      maxPct = Math.round(((sum - d.reward.bundlePrice) / sum) * 100);
      sample.push({ title: `Πακέτο: ${items.map((i) => lines.find((l) => l.productId === i.productId)?.title ?? "—").join(" + ")}`, before: sum, after: d.reward.bundlePrice, pct: maxPct });
    }
  } else if (d.mechanism === "together") {
    maxPct = d.reward.percent ?? 0;
  } else if (d.mechanism.startsWith("payment")) {
    maxPct = d.reward.percent ?? 0;
  } else if (isPrice) {
    for (const l of mine) {
      const line = { ...l, qty: qtyFor };
      const r = evaluate([line], [me], { now: new Date(), customer: { registered: true, isNew: true }, maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block" });
      const raw = evaluate([line], [me], { now: new Date(), customer: { registered: true, isNew: true } });
      const before = l.unit * qtyFor, after = r.lines[0].total;
      const pct = before ? Math.round(((before - raw.lines[0].total) / before) * 100) : 0;
      maxPct = Math.max(maxPct, pct);
      if (r.lines[0].capped) capped++;
      if (sample.length < 6 && after < before) sample.push({ title: l.title, before, after, pct });
    }
  } else if (d.mechanism === "coupon-percent") maxPct = d.reward.percent ?? 0;

  // συγκρούσεις: άλλες προσφορές με κοινά προϊόντα και επικαλυπτόμενες ημερομηνίες
  const others = await db.promotion.findMany({ where: { status: { in: ["active", "scheduled", "paused", "pending"] }, ...(d.id ? { id: { not: d.id } } : {}) }, include: { targets: true } });
  const window = { startsAt: d.startsAt ? new Date(d.startsAt) : null, endsAt: d.endsAt ? new Date(d.endsAt) : null };
  const mineIds = new Set(mine.map((l) => l.productId));
  const conflicts: DraftAnalysis["conflicts"] = [];
  for (const o of others) {
    if (!overlaps(window, o)) continue;
    const oe = { targets: o.targets.map((t) => ({ kind: t.kind as PromoTarget["kind"], refId: t.refId, exclude: t.exclude })) };
    const oPrice = Object.keys((o.reward as PromoReward).price ?? {});
    const shared = o.mechanism === "special-price" ? lines.filter((l) => mineIds.has(l.productId) && (oPrice.includes(l.variantId) || oPrice.includes(l.productId))).length : lines.filter((l) => mineIds.has(l.productId) && matches(oe, l)).length;
    if (!shared) continue;
    const bothPrice = isPrice && (PRICE_MECHANISMS.includes(o.mechanism as never) || MULTI_MECHANISMS.includes(o.mechanism as never));
    const outcome = o.stacking === "exclusive" ? "Η άλλη είναι αποκλειστική: κερδίζει σε αυτά τα προϊόντα." : d.stacking === "exclusive" ? "Αυτή είναι αποκλειστική: κερδίζει σε αυτά τα προϊόντα." : bothPrice ? (d.stacking === "combine" && o.stacking === "combine" ? "Συνδυάζονται, μέσα στις δικλείδες." : "Ανά προϊόν μένει η καλύτερη για τον πελάτη.") : "Συνδυάζονται (διαφορετικό είδος παροχής).";
    conflicts.push({ id: o.id, code: o.code, name: o.name, status: o.status, mechanism: o.mechanism, shared, outcome });
  }

  const reasons: string[] = [];
  if (maxPct > policy.approvalAbovePct) reasons.push(`έκπτωση έως ${maxPct} % (όριο ${policy.approvalAbovePct} %)`);
  if (d.budgetEur != null && d.budgetEur > policy.approvalAboveBudget) reasons.push(`budget ${d.budgetEur.toLocaleString("el-GR")} € (όριο ${policy.approvalAboveBudget.toLocaleString("el-GR")} €)`);
  if (d.budgetEur == null && d.mechanism.startsWith("coupon") && !d.maxUses) reasons.push("κουπόνι χωρίς budget και χωρίς μέγιστες χρήσεις");
  if (mine.length > policy.approvalAboveProducts) reasons.push(`${mine.length.toLocaleString("el-GR")} προϊόντα (όριο ${policy.approvalAboveProducts.toLocaleString("el-GR")})`);
  return { products: mine.length, sample, maxPct, capped, conflicts, approval: { needed: reasons.length > 0, reasons }, errors: validateDraft(d) };
}

// ---- αποθήκευση ----
async function nextCode() {
  const y = new Date().getFullYear();
  const n = await db.promotion.count({ where: { code: { startsWith: `CMP-${y}-` } } });
  return `CMP-${y}-${String(n + 1).padStart(3, "0")}`;
}

const json = (v: unknown) => v as Prisma.InputJsonValue;
function dataOf(d: PromoDraft) {
  return {
    name: d.name.trim().slice(0, 160), mechanism: d.mechanism, priority: Math.max(0, Math.min(999, Math.round(d.priority || 100))), stacking: d.stacking,
    startsAt: d.startsAt ? new Date(d.startsAt) : null, endsAt: d.endsAt ? new Date(d.endsAt) : null,
    reward: json(d.reward), rules: json({ ...d.rules, template: d.template }),
    maxUses: d.maxUses || null, maxPerCustomer: d.maxPerCustomer || null, budgetEur: d.budgetEur != null && d.budgetEur > 0 ? new Prisma.Decimal(d.budgetEur) : null,
    termsText: d.termsText?.trim() || null, tagLabel: d.tagLabel?.trim() || null,
  };
}

export const snapshotOf = (p: Row) => ({ code: p.code, name: p.name, mechanism: p.mechanism, stacking: p.stacking, priority: p.priority, startsAt: p.startsAt, endsAt: p.endsAt, reward: p.reward, rules: p.rules, maxUses: p.maxUses, maxPerCustomer: p.maxPerCustomer, budgetEur: p.budgetEur, termsText: p.termsText, tagLabel: p.tagLabel, targets: p.targets.map((t) => ({ kind: t.kind, refId: t.refId, exclude: t.exclude })) });

/** Μετά από κάθε αλλαγή που επηρεάζει τη βιτρίνα: φρέσκια cache και έτοιμες τιμές (στο παρασκήνιο). */
export function refreshStorefront() {
  invalidatePromos();
  void recomputeOffers().catch(() => null);
}

const liveStatus = (startsAt: Date | null, endsAt: Date | null): PromoStatus => (endsAt && endsAt <= new Date() ? "ended" : startsAt && startsAt > new Date() ? "scheduled" : "active");

export type SaveIntent = "draft" | "publish";
export interface SaveResult { ok: boolean; id?: string; code?: string; status?: PromoStatus; errors?: string[]; approval?: string[]; pendingChange?: boolean }

/**
 * Αποθήκευση από τον οδηγό. «draft» κρατά πρόχειρο (ή, σε δημοσιευμένη, γράφει νέα έκδοση χωρίς να αλλάξει κατάσταση).
 * «publish»: αν χρειάζεται έγκριση και ο χρήστης δεν έχει δικαίωμα έγκρισης → «Αναμένει έγκριση».
 */
export async function savePromotion(d: PromoDraft, staff: { id: string; canApprove: boolean }, intent: SaveIntent): Promise<SaveResult> {
  d = normalizeDraft(d);
  const errors = validateDraft(d);
  if (intent === "publish" && errors.length) return { ok: false, errors };
  if (!d.name.trim()) return { ok: false, errors: ["Δώσε όνομα στην προσφορά."] };
  const analysis = intent === "publish" ? await analyzeDraft(d) : null;
  const prev = d.id ? await db.promotion.findUnique({ where: { id: d.id }, include: { targets: true, coupons: true } }) : null;
  if (d.id && !prev) return { ok: false, errors: ["Η προσφορά δεν βρέθηκε."] };
  if (prev && prev.status === "archived") return { ok: false, errors: ["Η προσφορά είναι στο αρχείο — κάνε αντιγραφή για νέα."] };
  const data = dataOf(d);
  const wasLive = !!prev && ["active", "scheduled", "paused"].includes(prev.status);
  let status: PromoStatus = (prev?.status as PromoStatus) ?? "draft";
  if (intent === "publish") status = analysis!.approval.needed && !staff.canApprove ? "pending" : prev?.status === "paused" ? "paused" : liveStatus(data.startsAt, data.endsAt);
  else if (!prev) status = "draft";
  // Ζωντανή προσφορά + αλλαγή που χρειάζεται έγκριση: η εγκεκριμένη έκδοση μένει σε ισχύ και η αλλαγή περιμένει χωριστά
  // (στιγμιότυπο «pending» στην επόμενη έκδοση). Με την έγκριση εφαρμόζεται.
  if (wasLive && !staff.canApprove) {
    const a = analysis ?? (await analyzeDraft(d));
    if (a.approval.needed) {
      const version = prev!.version + 1;
      const snapshot = json({ pending: true, by: staff.id, draft: { ...d, id: prev!.id } });
      await db.promotionVersion.upsert({ where: { promotionId_version: { promotionId: prev!.id, version } }, create: { promotionId: prev!.id, version, snapshot, createdById: staff.id }, update: { snapshot, createdById: staff.id, createdAt: new Date() } });
      return { ok: true, id: prev!.id, code: prev!.code, status: "pending", approval: a.approval.reasons, pendingChange: true };
    }
  }

  const coupon = d.couponCode?.trim().toUpperCase() || null;
  if (coupon) {
    const taken = await db.coupon.findUnique({ where: { code: coupon } });
    if (taken && taken.promotionId !== prev?.id) return { ok: false, errors: [`Ο κωδικός ${coupon} χρησιμοποιείται ήδη από άλλη προσφορά.`] };
  }

  const bump = wasLive || (prev && status !== "draft" && status !== "pending" && prev.status !== status) || (!prev && status !== "draft" && status !== "pending");
  const version = prev ? (wasLive ? prev.version + 1 : prev.version) : 1;
  const row = await db.$transaction(async (tx) => {
    const code = prev?.code ?? (await nextCode());
    const saved = prev
      ? await tx.promotion.update({ where: { id: prev.id }, data: { ...data, status, version, ...(status === "pending" ? { approvedById: null } : {}), ...(intent === "publish" && staff.canApprove && status !== "pending" ? { approvedById: staff.id } : {}) } })
      : await tx.promotion.create({ data: { ...data, code, status, version, createdById: staff.id, ...(intent === "publish" && status !== "pending" ? { approvedById: staff.id } : {}) } });
    await tx.promotionTarget.deleteMany({ where: { promotionId: saved.id } });
    if (d.targets.length) await tx.promotionTarget.createMany({ data: d.targets.slice(0, 2000).map((t) => ({ promotionId: saved.id, kind: t.kind, refId: t.refId, exclude: !!t.exclude })) });
    if (coupon) {
      const shared = prev?.coupons.find((c) => c.kind === "shared");
      if (shared && shared.code !== coupon) await tx.coupon.update({ where: { id: shared.id }, data: { code: coupon } });
      else if (!shared) await tx.coupon.create({ data: { code: coupon, promotionId: saved.id, kind: "shared", trigger: "manual" } });
    }
    const full = await tx.promotion.findUniqueOrThrow({ where: { id: saved.id }, include: { targets: true, coupons: true } });
    if (bump && status !== "pending") await tx.promotionVersion.upsert({ where: { promotionId_version: { promotionId: full.id, version: full.version } }, create: { promotionId: full.id, version: full.version, snapshot: json(snapshotOf(full)), createdById: staff.id }, update: { snapshot: json(snapshotOf(full)), createdById: staff.id } });
    return full;
  });
  if (status !== "draft" || wasLive) refreshStorefront();
  return { ok: true, id: row.id, code: row.code, status, approval: analysis?.approval.reasons };
}

/** Έγκριση από δεύτερο πρόσωπο: όχι από αυτόν που τη δημιούργησε. */
export async function approvePromotion(id: string, staffId: string) {
  const p = await db.promotion.findUnique({ where: { id }, include: { targets: true, coupons: true } });
  if (!p) return { ok: false as const, error: "Δεν βρέθηκε." };
  const change = await pendingChange(id, p.version);
  if (change) {
    if (change.by === staffId) return { ok: false as const, error: "Την έγκριση τη δίνει δεύτερο πρόσωπο, όχι αυτός που έκανε την αλλαγή." };
    const r = await savePromotion(change.draft, { id: staffId, canApprove: true }, "publish");
    return r.ok ? { ok: true as const, status: r.status! } : { ok: false as const, error: (r.errors ?? []).join(" ") };
  }
  if (p.status !== "pending") return { ok: false as const, error: "Η προσφορά δεν αναμένει έγκριση." };
  if (p.createdById === staffId) return { ok: false as const, error: "Την έγκριση τη δίνει δεύτερο πρόσωπο, όχι αυτός που τη δημιούργησε." };
  const status = liveStatus(p.startsAt, p.endsAt);
  const version = (await db.promotionVersion.count({ where: { promotionId: id } })) ? p.version + 1 : p.version;
  const full = await db.promotion.update({ where: { id }, data: { status, approvedById: staffId, version }, include: { targets: true, coupons: true } });
  await db.promotionVersion.upsert({ where: { promotionId_version: { promotionId: id, version } }, create: { promotionId: id, version, snapshot: json(snapshotOf(full)), createdById: staffId }, update: {} });
  refreshStorefront();
  return { ok: true as const, status };
}

/** Αλλαγή σε ζωντανή προσφορά που περιμένει έγκριση (αν υπάρχει). */
export async function pendingChange(promotionId: string, current: number) {
  const v = await db.promotionVersion.findFirst({ where: { promotionId, version: { gt: current } }, orderBy: { version: "desc" } });
  const s = v?.snapshot as { pending?: boolean; by?: string; draft?: PromoDraft } | undefined;
  return s?.pending && s.draft ? { version: v!.version, by: s.by ?? null, draft: s.draft, at: v!.createdAt } : null;
}

/** Απόρριψη αλλαγής που περιμένει: η εγκεκριμένη έκδοση μένει ως έχει. */
export async function rejectChange(promotionId: string) {
  const p = await db.promotion.findUnique({ where: { id: promotionId }, select: { version: true } });
  if (!p) return false;
  const r = await db.promotionVersion.deleteMany({ where: { promotionId, version: { gt: p.version } } });
  return r.count > 0;
}

export type BulkAction = "pause" | "resume" | "end" | "archive" | "duplicate" | "reject";
/** Μαζικές ενέργειες από τη λίστα. Επιστρέφει πόσες άλλαξαν. */
export async function bulkPromotions(ids: string[], action: BulkAction, staffId: string) {
  const rows = await db.promotion.findMany({ where: { id: { in: ids.slice(0, 200) } }, include: { targets: true, coupons: true } });
  let changed = 0;
  for (const p of rows) {
    if (action === "duplicate") { await duplicatePromotion(p.id, staffId); changed++; continue; }
    const next: PromoStatus | null =
      action === "pause" ? (["active", "scheduled"].includes(p.status) ? "paused" : null)
      : action === "resume" ? (p.status === "paused" ? liveStatus(p.startsAt, p.endsAt) : null)
      : action === "end" ? (["active", "scheduled", "paused"].includes(p.status) ? "ended" : null)
      : action === "reject" ? (p.status === "pending" ? "draft" : ((await rejectChange(p.id)) ? (changed++, null) : null))
      : action === "archive" ? (p.status !== "archived" ? "archived" : null) : null;
    if (!next) continue;
    await db.promotion.update({ where: { id: p.id }, data: { status: next, ...(action === "end" && (!p.endsAt || p.endsAt > new Date()) ? { endsAt: new Date() } : {}) } });
    changed++;
  }
  if (changed) refreshStorefront();
  return changed;
}

export async function duplicatePromotion(id: string, staffId: string) {
  const p = await db.promotion.findUnique({ where: { id }, include: { targets: true } });
  if (!p) return null;
  const code = await nextCode();
  return db.promotion.create({
    data: {
      code, name: `${p.name} (αντίγραφο)`.slice(0, 160), mechanism: p.mechanism, status: "draft", held: p.held, heldReason: p.heldReason, priority: p.priority, stacking: p.stacking,
      startsAt: null, endsAt: null, reward: json(p.reward), rules: json(p.rules), maxUses: p.maxUses, maxPerCustomer: p.maxPerCustomer, budgetEur: p.budgetEur,
      termsText: p.termsText, tagLabel: p.tagLabel, createdById: staffId, targets: { create: p.targets.map((t) => ({ kind: t.kind, refId: t.refId, exclude: t.exclude })) },
    },
  });
}

/** Ονόματα για τα ids των στόχων (για τον οδηγό και τη λίστα). */
export async function targetNames(targets: { kind: string; refId: string }[]) {
  const ids = (k: string) => targets.filter((t) => t.kind === k).map((t) => t.refId);
  const bc = targets.filter((t) => t.kind === "brandcat").map((t) => t.refId.split("|"));
  const extraBrands = bc.map((x) => x[0]), extraCats = bc.map((x) => x[1]);
  const [p, b, c] = await Promise.all([
    ids("product").length ? db.product.findMany({ where: { OR: [{ id: { in: ids("product") } }, { variants: { some: { id: { in: ids("product") } } } }] }, select: { id: true, title: true, sku: true, variants: { select: { id: true }, take: 1 } } }) : [],
    ids("brand").length + extraBrands.length ? db.brand.findMany({ where: { id: { in: [...ids("brand"), ...extraBrands] } }, select: { id: true, name: true } }) : [],
    ids("category").length + extraCats.length ? db.category.findMany({ where: { id: { in: [...ids("category"), ...extraCats] } }, select: { id: true, name: true } }) : [],
  ]);
  const out: Record<string, string> = {};
  for (const x of p) { out[x.id] = `${x.title} · ${x.sku}`; if (x.variants[0]) out[x.variants[0].id] = out[x.id]; }
  for (const x of b) out[x.id] = x.name;
  for (const x of c) out[x.id] = x.name;
  for (const [bid, cid] of bc) out[`${bid}|${cid}`] = `${out[bid] ?? "μάρκα"} στα ${out[cid] ?? "κατηγορία"}`;
  return out;
}

// ---- ημερολόγιο: μπάρες ανά προσφορά και ζώνες επικάλυψης ανά ημέρα ----
export interface CalendarPromo { id: string; code: string; name: string; status: string; mechanism: string; stacking: string; startsAt: string | null; endsAt: string | null; products: number }
export interface CalendarDay { date: string; live: number; clashes: { a: string; b: string; shared: number; kind: "price" | "combine" }[] }

/** Προσφορές που τρέχουν στο διάστημα και, για κάθε ημέρα, ποια ζεύγη μοιράζονται προϊόντα (και πώς λύνεται). */
export async function calendarData(from: Date, days: number) {
  const to = new Date(from.getTime() + days * 86400_000);
  const rows = await db.promotion.findMany({
    where: { status: { in: ["active", "scheduled", "paused", "pending"] }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lt: to } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: from } }] }] },
    include: { targets: true }, orderBy: [{ startsAt: "asc" }, { priority: "asc" }],
  });
  const lines = await catalogLines();
  const sets = new Map<string, Set<string>>();
  for (const p of rows) {
    const targets = p.targets.map((t) => ({ kind: t.kind as PromoTarget["kind"], refId: t.refId, exclude: t.exclude }));
    const price = Object.keys((p.reward as PromoReward).price ?? {});
    const cartWide = (p.mechanism.startsWith("coupon") || p.mechanism === "shipping") && !targets.some((t) => !t.exclude);
    sets.set(p.id, new Set(cartWide ? [] : lines.filter((l) => (p.mechanism === "special-price" ? price.includes(l.variantId) || price.includes(l.productId) : matches({ targets }, l))).map((l) => l.productId)));
  }
  const isPrice = (m: string) => PRICE_MECHANISMS.includes(m as never) || MULTI_MECHANISMS.includes(m as never);
  const pairs: { a: (typeof rows)[number]; b: (typeof rows)[number]; shared: number }[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const A = sets.get(rows[i].id)!, B = sets.get(rows[j].id)!;
    if (!A.size || !B.size) continue;
    let shared = 0; const [small, big] = A.size < B.size ? [A, B] : [B, A];
    for (const x of small) if (big.has(x)) shared++;
    if (shared) pairs.push({ a: rows[i], b: rows[j], shared });
  }
  const live = (p: { startsAt: Date | null; endsAt: Date | null }, d0: Date, d1: Date) => (p.startsAt?.getTime() ?? -Infinity) < d1.getTime() && (p.endsAt?.getTime() ?? Infinity) > d0.getTime();
  const out: CalendarDay[] = [];
  for (let k = 0; k < days; k++) {
    const d0 = new Date(from.getTime() + k * 86400_000), d1 = new Date(d0.getTime() + 86400_000);
    out.push({
      date: d0.toISOString(), live: rows.filter((p) => live(p, d0, d1)).length,
      clashes: pairs.filter((x) => live(x.a, d0, d1) && live(x.b, d0, d1)).map((x) => ({ a: x.a.id, b: x.b.id, shared: x.shared, kind: isPrice(x.a.mechanism) && isPrice(x.b.mechanism) && !(x.a.stacking === "combine" && x.b.stacking === "combine") ? "price" as const : "combine" as const })),
    });
  }
  const promos: CalendarPromo[] = rows.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, mechanism: p.mechanism, stacking: p.stacking, startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null, products: sets.get(p.id)!.size }));
  return { promos, days: out };
}
