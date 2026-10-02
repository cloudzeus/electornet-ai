/**
 * Μηχανή προσφορών — ο πυρήνας (Φάση 0). Καθαρή συνάρτηση: ίδια είσοδος → ίδιο αποτέλεσμα, χωρίς βάση, χωρίς ρολόι
 * (το «τώρα» έρχεται στο ctx). Τρέχει στο καλάθι, στο checkout και στον προσομοιωτή του admin με τον ίδιο κώδικα.
 *
 * Ποσά σε ΛΕΠΤΑ (ακέραιοι), με ΦΠΑ, όπως οι τιμές του e-shop — καμία στρογγυλοποίηση floating point στα χρήματα.
 *
 * Σειρά εφαρμογής: 1) εκπτώσεις τιμής ανά γραμμή (μία ανά γραμμή: η καλύτερη για τον πελάτη, εκτός αν κάποια είναι
 * «αποκλειστική»), 2) κουπόνι στο καλάθι, κατανεμημένο αναλογικά στις γραμμές (σωστός ΦΠΑ και σωστές επιστροφές ανά
 * γραμμή), 3) δικλείδες: μέγιστο % έκπτωσης ανά γραμμή, ποτέ κάτω από το κόστος όταν είναι γνωστό.
 * Κάθε προσφορά που εξετάστηκε μπαίνει στο ίχνος με «εφαρμόστηκε» ή τον λόγο που δεν εφαρμόστηκε — σε απλά ελληνικά.
 */

export type Mechanism = "price-percent" | "price-amount" | "special-price" | "coupon-percent" | "coupon-amount";
export const PRICE_MECHANISMS: Mechanism[] = ["price-percent", "price-amount", "special-price"];
export const COUPON_MECHANISMS: Mechanism[] = ["coupon-percent", "coupon-amount"];
export type Stacking = "combine" | "no-price" | "exclusive";

export interface PromoTarget { kind: "product" | "brand" | "category"; refId: string; exclude: boolean }
export interface PromoRules {
  customers?: "all" | "new" | "registered";
  /** ελάχιστη αξία (λεπτά) των επιλέξιμων γραμμών */
  minValue?: number;
  minQty?: number;
  channels?: ("online" | "click-collect")[];
  /** ΤΚ ή προθέματα ΤΚ («151», «15125») */
  zips?: string[];
  payment?: string[];
  delivery?: string[];
}
export interface PromoReward {
  /** ποσοστό 0–100 (price-percent / coupon-percent) */
  percent?: number;
  /** λεπτά: ανά μονάδα (price-amount) ή στο καλάθι (coupon-amount) */
  amount?: number;
  /** special-price: τελική τιμή ανά variant (λεπτά) */
  price?: Record<string, number>;
}
export interface EnginePromo {
  id: string; code: string; version: number; name: string;
  mechanism: string; status: string; held: boolean;
  priority: number; stacking: Stacking;
  startsAt?: Date | null; endsAt?: Date | null;
  reward: PromoReward; rules: PromoRules; targets: PromoTarget[];
  maxUses?: number | null; usedCount: number; maxPerCustomer?: number | null;
  budgetCents?: number | null; spentCents: number;
  tagLabel?: string | null;
}
export interface EngineLine {
  key: string; variantId: string; productId: string; brandId?: string | null; categoryIds: string[];
  qty: number;
  /** τιμή καταλόγου μονάδας (λεπτά, με ΦΠΑ) */
  unit: number;
  /** κόστος μονάδας (λεπτά), όταν είναι γνωστό — για τη δικλείδα «κάτω από κόστος» */
  cost?: number | null;
}
export interface EngineCtx {
  now: Date;
  customer: { id?: string | null; email?: string | null; registered: boolean; isNew: boolean; usesByPromo?: Record<string, number> };
  channel?: "online" | "click-collect";
  zip?: string | null; payment?: string | null; delivery?: string | null;
  /** το κουπόνι που έγραψε ο πελάτης, ήδη αντιστοιχισμένο με την προσφορά του (ή null αν δεν βρέθηκε) */
  coupon?: { code: string; promotionId: string | null; problem?: string } | null;
  /** δικλείδα: μέγιστη συνολική έκπτωση ανά γραμμή, % της τιμής καταλόγου */
  maxLinePct?: number;
}
export type AdjKind = "price" | "coupon";
export interface Adjustment { promotionId: string; code: string; version: number; kind: AdjKind; amount: number; label: string }
export interface PricedLine extends EngineLine {
  listTotal: number; discPrice: number; discCoupon: number; total: number;
  /** τελική τιμή μονάδας (λεπτά) — για εμφάνιση· το ακριβές ποσό είναι το total */
  unitFinal: number;
  adjustments: Adjustment[];
  capped?: "max-pct" | "cost";
}
export interface TraceItem { promotionId: string; code: string; name: string; applied: boolean; amount: number; reason: string; lines?: string[] }
export interface EngineResult { lines: PricedLine[]; listTotal: number; discPrice: number; discCoupon: number; total: number; trace: TraceItem[]; couponApplied: string | null; couponMessage: string | null }

const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Ενεργή τώρα; (κατάσταση, ανενεργή-μέχρι-διευκρίνιση, χρονικό παράθυρο, όρια) — null = ναι, αλλιώς ο λόγος. */
export function inactiveReason(p: EnginePromo, now: Date): string | null {
  if (p.held) return "ανενεργή μέχρι να διευκρινιστεί";
  if (p.status !== "active" && p.status !== "scheduled") return p.status === "paused" ? "σε παύση" : p.status === "draft" ? "πρόχειρη" : "έληξε";
  if (p.startsAt && now < p.startsAt) return `ξεκινά ${p.startsAt.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })}`;
  if (p.endsAt && now > p.endsAt) return "έληξε";
  if (p.maxUses != null && p.usedCount >= p.maxUses) return "εξαντλήθηκαν οι χρήσεις";
  if (p.budgetCents != null && p.spentCents >= p.budgetCents) return "εξαντλήθηκε το budget";
  return null;
}

/** Οι κανόνες «ποιος / πού / πώς» για αυτό το καλάθι. */
function ruleReason(p: EnginePromo, ctx: EngineCtx): string | null {
  const r = p.rules ?? {};
  if (r.customers === "registered" && !ctx.customer.registered) return "μόνο για εγγεγραμμένα μέλη";
  if (r.customers === "new" && !ctx.customer.isNew) return "μόνο για πρώτη αγορά";
  if (r.channels?.length && ctx.channel && !r.channels.includes(ctx.channel)) return "δεν ισχύει σε αυτό το κανάλι";
  if (r.zips?.length) { if (!ctx.zip) return "χρειάζεται ΤΚ"; if (!r.zips.some((z) => ctx.zip!.startsWith(z))) return "δεν ισχύει στον ΤΚ " + ctx.zip; }
  if (r.payment?.length && ctx.payment && !r.payment.includes(ctx.payment)) return "δεν ισχύει με αυτόν τον τρόπο πληρωμής";
  if (r.delivery?.length && ctx.delivery && !r.delivery.includes(ctx.delivery)) return "δεν ισχύει με αυτόν τον τρόπο παράδοσης";
  const used = ctx.customer.usesByPromo?.[p.id] ?? 0;
  if (p.maxPerCustomer != null && used >= p.maxPerCustomer) return "ο πελάτης έχει ήδη χρησιμοποιήσει την προσφορά";
  return null;
}

/** Ταιριάζει η γραμμή στο πεδίο της προσφοράς; Χωρίς «συμπερίληψη» = όλα τα προϊόντα. Οι εξαιρέσεις κερδίζουν πάντα. */
export function matches(p: { targets: PromoTarget[] }, l: Pick<EngineLine, "productId" | "variantId" | "brandId" | "categoryIds">): boolean {
  const hit = (t: PromoTarget) => (t.kind === "product" ? t.refId === l.productId || t.refId === l.variantId : t.kind === "brand" ? t.refId === l.brandId : l.categoryIds.includes(t.refId));
  if (p.targets.some((t) => t.exclude && hit(t))) return false;
  const inc = p.targets.filter((t) => !t.exclude);
  return inc.length === 0 || inc.some(hit);
}

/** Έκπτωση μονάδας μιας προσφοράς τιμής (λεπτά), ποτέ αρνητική ούτε πάνω από την τιμή. */
function unitDiscount(p: EnginePromo, l: EngineLine): number {
  const r = p.reward ?? {};
  let d = 0;
  if (p.mechanism === "price-percent") d = Math.round((l.unit * (r.percent ?? 0)) / 100);
  else if (p.mechanism === "price-amount") d = r.amount ?? 0;
  else if (p.mechanism === "special-price") { const sp = r.price?.[l.variantId] ?? r.price?.[l.productId]; d = sp != null ? l.unit - sp : 0; }
  return Math.max(0, Math.min(l.unit, d));
}

/** Κατανομή ποσού σε γραμμές αναλογικά με τα βάρη, με τη μέθοδο του μεγαλύτερου υπολοίπου (το άθροισμα βγαίνει ακριβώς). */
export function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || amount <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / sum);
  const out = raw.map(Math.floor);
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; out[i]++; rest--; }
  return out;
}

export function evaluate(linesIn: EngineLine[], promos: EnginePromo[], ctx: EngineCtx): EngineResult {
  const trace: TraceItem[] = [];
  const lines: PricedLine[] = linesIn.map((l) => ({ ...l, listTotal: l.unit * l.qty, discPrice: 0, discCoupon: 0, total: l.unit * l.qty, unitFinal: l.unit, adjustments: [] }));
  const live: EnginePromo[] = [];
  for (const p of promos) {
    const why = inactiveReason(p, ctx.now) ?? ruleReason(p, ctx);
    if (why) { if (lines.some((l) => matches(p, l))) trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: why }); continue; }
    live.push(p);
  }

  // ---- 1. εκπτώσεις τιμής: μία ανά γραμμή ----
  const pricePromos = live.filter((p) => (PRICE_MECHANISMS as string[]).includes(p.mechanism)).sort((a, b) => a.priority - b.priority);
  // ελάχιστη αξία / ποσότητα μετριέται στις γραμμές που ταιριάζουν στην προσφορά
  const qualifies = (p: EnginePromo) => {
    const ls = lines.filter((l) => matches(p, l));
    const v = ls.reduce((a, l) => a + l.listTotal, 0), q = ls.reduce((a, l) => a + l.qty, 0);
    if (p.rules?.minValue && v < p.rules.minValue) return `χρειάζεται καλάθι τουλάχιστον ${eur(p.rules.minValue)} σε προϊόντα της προσφοράς (τώρα ${eur(v)})`;
    if (p.rules?.minQty && q < p.rules.minQty) return `χρειάζονται τουλάχιστον ${p.rules.minQty} τεμάχια (τώρα ${q})`;
    return null;
  };
  const priceWin = new Map<string, { p: EnginePromo; d: number }>(); // γραμμή → νικήτρια
  const priceTrace = new Map<string, TraceItem>();
  for (const p of pricePromos) {
    const why = qualifies(p);
    const touched = lines.filter((l) => matches(p, l));
    if (!touched.length) continue;
    if (why) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: why }); continue; }
    priceTrace.set(p.id, { promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: "", lines: [] });
    for (const l of touched) {
      const d = unitDiscount(p, l);
      if (d <= 0) continue;
      const cur = priceWin.get(l.key);
      const better = !cur
        || (p.stacking === "exclusive" && cur.p.stacking !== "exclusive")
        || (!(cur.p.stacking === "exclusive" && p.stacking !== "exclusive") && (d > cur.d || (d === cur.d && p.priority < cur.p.priority)));
      if (better) priceWin.set(l.key, { p, d });
    }
  }
  for (const l of lines) {
    const w = priceWin.get(l.key);
    if (!w) continue;
    const amt = w.d * l.qty;
    l.discPrice = amt;
    l.adjustments.push({ promotionId: w.p.id, code: w.p.code, version: w.p.version, kind: "price", amount: amt, label: w.p.tagLabel || w.p.name });
    const t = priceTrace.get(w.p.id)!; t.applied = true; t.amount += amt; t.lines!.push(l.key);
  }
  for (const [id, t] of priceTrace) {
    if (t.applied) { t.reason = "εφαρμόστηκε"; trace.push(t); continue; }
    // ήταν επιλέξιμη αλλά «έχασε» σε κάθε γραμμή της
    const p = pricePromos.find((x) => x.id === id)!;
    const winners = [...new Set(lines.filter((l) => matches(p, l)).map((l) => priceWin.get(l.key)?.p).filter(Boolean).map((x) => x!.name))];
    trace.push({ ...t, reason: winners.length ? `στα ίδια προϊόντα εφαρμόστηκε η «${winners.join("», «")}», που δίνει περισσότερα ή είναι αποκλειστική` : "δεν δίνει έκπτωση σε αυτά τα προϊόντα" });
  }

  // ---- 2. κουπόνι στο καλάθι ----
  let couponApplied: string | null = null, couponMessage: string | null = null;
  if (ctx.coupon) {
    const p = ctx.coupon.promotionId ? promos.find((x) => x.id === ctx.coupon!.promotionId) : null;
    const isCoupon = p && (COUPON_MECHANISMS as string[]).includes(p.mechanism);
    const why = ctx.coupon.problem ?? (!p ? "ο κωδικός δεν υπάρχει" : !isCoupon ? "ο κωδικός δεν αντιστοιχεί σε κουπόνι" : inactiveReason(p, ctx.now) ?? ruleReason(p, ctx));
    if (why || !p) {
      couponMessage = `Ο κωδικός ${ctx.coupon.code} δεν εφαρμόστηκε: ${why}.`;
      if (p) trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: why ?? "" });
    } else {
      const exclusiveLines = new Set(lines.filter((l) => priceWin.get(l.key)?.p.stacking === "exclusive").map((l) => l.key));
      const eligible = lines.filter((l) => matches(p, l) && !exclusiveLines.has(l.key) && (p.stacking !== "no-price" || l.discPrice === 0));
      const base = eligible.reduce((a, l) => a + (l.listTotal - l.discPrice), 0);
      const minWhy = p.rules?.minValue && base < p.rules.minValue ? `χρειάζεται καλάθι τουλάχιστον ${eur(p.rules.minValue)} σε προϊόντα που δέχονται το κουπόνι (τώρα ${eur(base)})` : null;
      if (!eligible.length || minWhy) {
        const reason = minWhy ?? (p.stacking === "no-price" ? "δεν συνδυάζεται με προϊόντα που είναι ήδη σε προσφορά" : "κανένα προϊόν του καλαθιού δεν είναι επιλέξιμο");
        couponMessage = `Ο κωδικός ${ctx.coupon.code} δεν εφαρμόστηκε: ${reason}.`;
        trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason });
      } else {
        const want = p.mechanism === "coupon-percent" ? Math.round((base * (p.reward.percent ?? 0)) / 100) : Math.min(base, p.reward.amount ?? 0);
        const parts = allocate(want, eligible.map((l) => l.listTotal - l.discPrice));
        eligible.forEach((l, i) => { if (parts[i] > 0) { l.discCoupon = parts[i]; l.adjustments.push({ promotionId: p.id, code: p.code, version: p.version, kind: "coupon", amount: parts[i], label: `Κουπόνι ${ctx.coupon!.code}` }); } });
        couponApplied = ctx.coupon.code;
        couponMessage = `Κουπόνι ${ctx.coupon.code}: −${eur(want)}.`;
        trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: true, amount: want, reason: "εφαρμόστηκε", lines: eligible.map((l) => l.key) });
      }
    }
  }

  // ---- 3. δικλείδες ανά γραμμή ----
  const maxPct = ctx.maxLinePct ?? 100;
  for (const l of lines) {
    let disc = l.discPrice + l.discCoupon;
    const capPct = Math.floor((l.listTotal * maxPct) / 100);
    const capCost = l.cost != null ? Math.max(0, l.listTotal - l.cost * l.qty) : Infinity;
    const cap = Math.min(capPct, capCost);
    if (disc > cap) {
      // κόβεται πρώτα το κουπόνι, μετά η έκπτωση τιμής
      const over = disc - cap;
      const fromCoupon = Math.min(over, l.discCoupon);
      l.discCoupon -= fromCoupon; l.discPrice -= over - fromCoupon;
      for (const a of l.adjustments) a.amount = a.kind === "coupon" ? l.discCoupon : l.discPrice;
      l.capped = capCost < capPct ? "cost" : "max-pct";
      disc = cap;
    }
    l.total = l.listTotal - disc;
    l.unitFinal = Math.round(l.total / l.qty);
  }
  // το ίχνος δείχνει τα πραγματικά ποσά μετά τις δικλείδες
  for (const t of trace) if (t.applied) t.amount = lines.reduce((a, l) => a + l.adjustments.filter((x) => x.promotionId === t.promotionId).reduce((b, x) => b + x.amount, 0), 0);

  const listTotal = lines.reduce((a, l) => a + l.listTotal, 0), discPrice = lines.reduce((a, l) => a + l.discPrice, 0), discCoupon = lines.reduce((a, l) => a + l.discCoupon, 0);
  return { lines, listTotal, discPrice, discCoupon, total: listTotal - discPrice - discCoupon, trace, couponApplied, couponMessage };
}
