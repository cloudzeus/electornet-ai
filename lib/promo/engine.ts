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

export type Mechanism = "price-percent" | "price-amount" | "special-price" | "n-plus-m" | "nth-discount" | "qty-tiers" | "together" | "bundle" | "gift" | "service" | "shipping" | "coupon-percent" | "coupon-amount" | "payment-percent" | "payment-amount";
/** Εκπτώσεις τιμής σε μία γραμμή */
export const PRICE_MECHANISMS: Mechanism[] = ["price-percent", "price-amount", "special-price"];
/** Εκπτώσεις τιμής που εξαρτώνται από πολλά τεμάχια (ανήκουν κι αυτές στην «τιμή»: μία ανά γραμμή) */
export const MULTI_MECHANISMS: Mechanism[] = ["n-plus-m", "nth-discount", "qty-tiers", "together", "bundle"];
/** Έκπτωση τρόπου πληρωμής: στο τέλος, πάνω στο ποσό που μένει (DISC3VAL στο παραστατικό) */
export const PAYMENT_MECHANISMS: Mechanism[] = ["payment-percent", "payment-amount"];
export const COUPON_MECHANISMS: Mechanism[] = ["coupon-percent", "coupon-amount"];
export type Stacking = "combine" | "no-price" | "exclusive";

/** Στόχος: προϊόν, μάρκα, κατηγορία — ή «brandcat» = μάρκα μέσα σε κατηγορία (refId «brandId|categoryId», τομή). */
export interface PromoTarget { kind: "product" | "brand" | "category" | "brandcat"; refId: string; exclude: boolean }
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
  /** μόνο για πελάτες που ανήκουν σε ένα από αυτά τα κοινά (segments) */
  segments?: string[];
  /** τα κοινά αυτά βλέπουν την προσφορά τόσες ώρες πριν την επίσημη έναρξη */
  earlyAccess?: { segments: string[]; hours: number };
}
export interface PromoReward {
  /** ποσοστό 0–100 (price-percent / coupon-percent) */
  percent?: number;
  /** λεπτά: ανά μονάδα (price-amount) ή στο καλάθι (coupon-amount) */
  amount?: number;
  /** special-price: τελική τιμή ανά variant (λεπτά) */
  price?: Record<string, number>;
  /** n-plus-m: αγοράζεις buy, παίρνεις get δωρεάν (2+1 → buy 2, get 1) */
  buy?: number; get?: number;
  /** nth-discount: κάθε nth τεμάχιο με percent (2ο −50 % → nth 2, percent 50) */
  nth?: number;
  /** qty-tiers: κλίμακες ποσότητας */
  tiers?: { minQty: number; percent: number }[];
  /** gift: το προϊόν-δώρο */
  giftProductId?: string; giftQty?: number;
  /** service: η υπηρεσία που γίνεται δωρεάν */
  serviceSlug?: string;
  /** together: τα συνοδευτικά που γίνονται φθηνότερα μαζί με το βασικό (στόχοι της προσφοράς) — percent ή amount ανά τεμάχιο */
  with?: PromoTarget[];
  /** bundle: τα προϊόντα του πακέτου και η σταθερή τιμή του (λεπτά) */
  bundle?: { productId: string; qty: number }[];
  bundlePrice?: number;
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
  customer: { id?: string | null; email?: string | null; registered: boolean; isNew: boolean; usesByPromo?: Record<string, number>; segments?: string[] };
  channel?: "online" | "click-collect";
  zip?: string | null; payment?: string | null; delivery?: string | null;
  /** το κουπόνι που έγραψε ο πελάτης, ήδη αντιστοιχισμένο με την προσφορά του (ή null αν δεν βρέθηκε) */
  coupon?: { code: string; promotionId: string | null; problem?: string } | null;
  /** δικλείδα: μέγιστη συνολική έκπτωση ανά γραμμή, % της τιμής καταλόγου */
  maxLinePct?: number;
  /** δικλείδα: ποτέ κάτω από το κόστος (προεπιλογή ναι· «όχι» μόνο αν ο κανόνας είναι «μόνο προειδοποίηση») */
  costFloor?: boolean;
}
export type AdjKind = "price" | "coupon" | "payment";
export interface Adjustment { promotionId: string; code: string; version: number; kind: AdjKind; amount: number; label: string }
export interface PricedLine extends EngineLine {
  listTotal: number; discPrice: number; discCoupon: number; discPayment: number; total: number;
  /** τελική τιμή μονάδας (λεπτά) — για εμφάνιση· το ακριβές ποσό είναι το total */
  unitFinal: number;
  adjustments: Adjustment[];
  capped?: "max-pct" | "cost";
}
export interface TraceItem { promotionId: string; code: string; name: string; applied: boolean; amount: number; reason: string; lines?: string[] }
export interface PromoRef { promotionId: string; code: string; version: number; label: string }
export interface EngineResult {
  lines: PricedLine[]; listTotal: number; discPrice: number; discCoupon: number; discPayment: number; total: number; trace: TraceItem[]; couponApplied: string | null; couponMessage: string | null;
  /** η έκπτωση τρόπου πληρωμής που εφαρμόστηκε (αν υπάρχει) */
  payment: (PromoRef & { amount: number }) | null;
  /** δώρα που δικαιούται το καλάθι (μπαίνουν ως γραμμή με αξία και έκπτωση 100 %) */
  gifts: (PromoRef & { productId: string; qty: number })[];
  /** υπηρεσίες που γίνονται δωρεάν σε συγκεκριμένες γραμμές */
  services: (PromoRef & { lineKey: string; slug: string })[];
  freeShipping: PromoRef | null;
  /** υποδείξεις για τον πελάτη: «πρόσθεσε 1 ακόμη…», «σου λείπουν 12 €…» */
  hints: string[];
}

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
  if (r.segments?.length && !r.segments.some((s) => ctx.customer.segments?.includes(s))) return ctx.customer.registered ? "μόνο για συγκεκριμένο κοινό πελατών" : "μόνο για μέλη συγκεκριμένου κοινού (χρειάζεται σύνδεση)";
  const used = ctx.customer.usesByPromo?.[p.id] ?? 0;
  if (p.maxPerCustomer != null && used >= p.maxPerCustomer) return "ο πελάτης έχει ήδη χρησιμοποιήσει την προσφορά";
  return null;
}

/** Ταιριάζει η γραμμή στο πεδίο της προσφοράς; Χωρίς «συμπερίληψη» = όλα τα προϊόντα. Οι εξαιρέσεις κερδίζουν πάντα. */
export function matches(p: { targets: PromoTarget[] }, l: Pick<EngineLine, "productId" | "variantId" | "brandId" | "categoryIds">): boolean {
  const hit = (t: PromoTarget) => {
    if (t.kind === "product") return t.refId === l.productId || t.refId === l.variantId;
    if (t.kind === "brand") return t.refId === l.brandId;
    if (t.kind === "brandcat") { const [b, c] = t.refId.split("|"); return b === l.brandId && l.categoryIds.includes(c); }
    return l.categoryIds.includes(t.refId);
  };
  if (p.targets.some((t) => t.exclude && hit(t))) return false;
  const inc = p.targets.filter((t) => !t.exclude);
  return inc.length === 0 || inc.some(hit);
}

/** Ανήκει η γραμμή στην προσφορά; Για «μαζί φθηνότερα» και τα συνοδευτικά, για πακέτο τα προϊόντα του. */
export function inScope(p: EnginePromo, l: Pick<EngineLine, "productId" | "variantId" | "brandId" | "categoryIds">): boolean {
  const r = p.reward ?? {};
  if (p.mechanism === "bundle") return (r.bundle ?? []).some((i) => i.productId === l.productId || i.productId === l.variantId);
  if (p.mechanism === "together") return matches(p, l) || (!!r.with?.some((t) => !t.exclude) && matches({ targets: r.with! }, l));
  return matches(p, l);
}

const PAY_LABEL: Record<string, string> = { card: "κάρτα", "no-card": "δόσεις χωρίς κάρτα", iris: "IRIS", bank: "τραπεζική κατάθεση", cod: "αντικαταβολή", store: "πληρωμή στο κατάστημα", apple: "Apple Pay", google: "Google Pay", revolut: "Revolut" };
export const payLabel = (codes: string[] = []) => codes.map((c) => PAY_LABEL[c] ?? c).join(" ή ");

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

/**
 * Κατανομή έκπτωσης για μηχανισμούς πολλών τεμαχίων. Τα τεμάχια ταξινομούνται από το ακριβότερο: σε κάθε ομάδα
 * δωρεάν / με έκπτωση γίνεται το φθηνότερο της ομάδας (ο πελάτης πληρώνει τα ακριβότερα, όπως παντού στην αγορά).
 */
function multiAlloc(p: EnginePromo, pool: EngineLine[]): { alloc: Map<string, number>; used: Set<string>; hint: string | null } {
  const alloc = new Map<string, number>();
  /** γραμμές που συμμετέχουν σε πλήρη ομάδα (και τα «πληρωμένα» τεμάχια) */
  const used = new Set<string>();
  const units = pool.flatMap((l) => Array.from({ length: l.qty }, () => ({ key: l.key, unit: l.unit }))).sort((a, b) => b.unit - a.unit);
  const r = p.reward ?? {};
  let hint: string | null = null;
  if (p.mechanism === "n-plus-m") {
    const buy = Math.max(1, r.buy ?? 1), get = Math.max(1, r.get ?? 1), size = buy + get;
    for (let i = 0; i + size <= units.length; i += size) {
      for (let k = i; k < i + size; k++) used.add(units[k].key);
      for (let k = i + buy; k < i + size; k++) alloc.set(units[k].key, (alloc.get(units[k].key) ?? 0) + units[k].unit);
    }
    const rem = units.length % size;
    if (rem >= buy || units.length < size) { const need = size - (units.length < size ? units.length : rem); hint = `Πρόσθεσε ${need} ακόμη ${need === 1 ? "προϊόν" : "προϊόντα"} από την προσφορά «${p.tagLabel || p.name}» και ${get === 1 ? "το φθηνότερο είναι δωρεάν" : `τα ${get} φθηνότερα είναι δωρεάν`}.`; }
  } else if (p.mechanism === "nth-discount") {
    const nth = Math.max(2, r.nth ?? 2), pct = r.percent ?? 0;
    for (let i = nth - 1; i < units.length; i += nth) {
      for (let k = i - nth + 1; k <= i; k++) used.add(units[k].key);
      alloc.set(units[i].key, (alloc.get(units[i].key) ?? 0) + Math.round((units[i].unit * pct) / 100));
    }
    if (units.length % nth === nth - 1) hint = `Πρόσθεσε 1 ακόμη προϊόν από την προσφορά «${p.tagLabel || p.name}» και παίρνεις −${pct} % στο φθηνότερο.`;
  } else if (p.mechanism === "qty-tiers") {
    const tiers = [...(r.tiers ?? [])].sort((a, b) => a.minQty - b.minQty);
    const tier = [...tiers].reverse().find((t) => units.length >= t.minQty);
    if (tier) for (const l of pool) { used.add(l.key); alloc.set(l.key, Math.round((l.unit * l.qty * tier.percent) / 100)); }
    const next = tiers.find((t) => t.minQty > units.length);
    if (next) hint = `Με ${next.minQty - units.length} ακόμη ${next.minQty - units.length === 1 ? "τεμάχιο" : "τεμάχια"} η έκπτωση γίνεται −${next.percent} %.`;
  } else if (p.mechanism === "together") {
    // ένα συνοδευτικό με έκπτωση ανά τεμάχιο βασικού· πρώτα τα ακριβότερα συνοδευτικά (καλύτερο για τον πελάτη)
    const mainKeys = new Set(pool.filter((l) => matches(p, l)).map((l) => l.key));
    const mains = units.filter((u) => mainKeys.has(u.key)).length;
    const comps = units.filter((u) => !mainKeys.has(u.key));
    const n = Math.min(mains, comps.length);
    for (let i = 0; i < n; i++) {
      const u = comps[i];
      const d = r.percent != null ? Math.round((u.unit * r.percent) / 100) : Math.min(u.unit, r.amount ?? 0);
      if (d > 0) { alloc.set(u.key, (alloc.get(u.key) ?? 0) + d); used.add(u.key); }
    }
    const off = r.percent != null ? `−${r.percent} %` : `−${eur(r.amount ?? 0)}`;
    if (mains > comps.length) hint = `Πρόσθεσε ένα συνοδευτικό της προσφοράς «${p.tagLabel || p.name}» και παίρνεις ${off} σε αυτό.`;
    else if (!mains && comps.length) hint = `Με το βασικό προϊόν της προσφοράς «${p.tagLabel || p.name}» παίρνεις ${off} σε αυτό.`;
  } else if (p.mechanism === "bundle") {
    const items = (r.bundle ?? []).filter((i) => i.qty > 0);
    const linesOf = (pid: string) => pool.filter((l) => l.productId === pid || l.variantId === pid);
    const n = items.length ? Math.min(...items.map((i) => Math.floor(linesOf(i.productId).reduce((a, l) => a + l.qty, 0) / i.qty))) : 0;
    if (n > 0 && r.bundlePrice != null) {
      // τα τεμάχια του πακέτου ανά γραμμή, και η έκπτωση μοιρασμένη αναλογικά στην αξία τους
      const parts: { key: string; value: number }[] = [];
      for (const i of items) { let need = i.qty * n; for (const l of linesOf(i.productId)) { const take = Math.min(need, l.qty); if (take > 0) { parts.push({ key: l.key, value: l.unit * take }); need -= take; } } }
      const list = parts.reduce((a, x) => a + x.value, 0);
      const disc = Math.max(0, list - r.bundlePrice * n);
      allocate(disc, parts.map((x) => x.value)).forEach((d, k) => { used.add(parts[k].key); if (d > 0) alloc.set(parts[k].key, (alloc.get(parts[k].key) ?? 0) + d); });
    } else if (items.some((i) => linesOf(i.productId).length)) hint = `Ολοκλήρωσε το πακέτο «${p.tagLabel || p.name}» και πληρώνεις ${eur(r.bundlePrice ?? 0)} για όλο το πακέτο.`;
  }
  return { alloc, used, hint };
}

export function evaluate(linesIn: EngineLine[], promos: EnginePromo[], ctx: EngineCtx): EngineResult {
  const trace: TraceItem[] = [];
  const lines: PricedLine[] = linesIn.map((l) => ({ ...l, listTotal: l.unit * l.qty, discPrice: 0, discCoupon: 0, discPayment: 0, total: l.unit * l.qty, unitFinal: l.unit, adjustments: [] }));
  const live: EnginePromo[] = [];
  for (const p of promos) {
    // early access: για τα κοινά του, η προσφορά «ξεκινά» νωρίτερα
    const early = p.rules?.earlyAccess;
    const eff = early && early.hours > 0 && p.startsAt && early.segments.some((s) => ctx.customer.segments?.includes(s)) ? { ...p, startsAt: new Date(p.startsAt.getTime() - early.hours * 3_600_000) } : p;
    const why = inactiveReason(eff, ctx.now) ?? ruleReason(p, ctx);
    if (why) { if (lines.some((l) => inScope(p, l))) trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: why }); continue; }
    live.push(p);
  }

  // ---- 1. εκπτώσεις τιμής: μία ανά γραμμή (απλές + πολλών τεμαχίων) ----
  const hints: string[] = [];
  const pricePromos = live.filter((p) => (PRICE_MECHANISMS as string[]).includes(p.mechanism)).sort((a, b) => a.priority - b.priority);
  // ελάχιστη αξία / ποσότητα μετριέται στις γραμμές που ταιριάζουν στην προσφορά
  const qualifies = (p: EnginePromo, ls = lines.filter((l) => matches(p, l))) => {
    const v = ls.reduce((a, l) => a + l.listTotal, 0), q = ls.reduce((a, l) => a + l.qty, 0);
    if (p.rules?.minValue && v < p.rules.minValue) return { why: `χρειάζεται καλάθι τουλάχιστον ${eur(p.rules.minValue)} σε προϊόντα της προσφοράς (τώρα ${eur(v)})`, missing: p.rules.minValue - v };
    if (p.rules?.minQty && q < p.rules.minQty) return { why: `χρειάζονται τουλάχιστον ${p.rules.minQty} τεμάχια (τώρα ${q})`, missing: 0 };
    return null;
  };
  const priceWin = new Map<string, { p: EnginePromo; d: number }>(); // γραμμή → νικήτρια απλή (ανά μονάδα)
  const priceTrace = new Map<string, TraceItem>();
  for (const p of pricePromos) {
    const touched = lines.filter((l) => matches(p, l));
    if (!touched.length) continue;
    const q = qualifies(p, touched);
    if (q) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: q.why }); continue; }
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
  // πολλών τεμαχίων: συγκρίνονται με τις απλές στις ίδιες γραμμές — κερδίζει ό,τι δίνει περισσότερα (ή η αποκλειστική)
  const multiWin = new Map<string, { p: EnginePromo; amt: number }>();
  const multiPromos = live.filter((p) => (MULTI_MECHANISMS as string[]).includes(p.mechanism)).sort((a, b) => (a.stacking === "exclusive" ? -1 : 0) - (b.stacking === "exclusive" ? -1 : 0) || a.priority - b.priority);
  for (const p of multiPromos) {
    const pool = lines.filter((l) => inScope(p, l) && !multiWin.has(l.key) && !(priceWin.get(l.key)?.p.stacking === "exclusive" && p.stacking !== "exclusive"));
    if (!pool.length) { if (lines.some((l) => inScope(p, l))) trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: "τα προϊόντα της έχουν ήδη αποκλειστική προσφορά" }); continue; }
    const q = qualifies(p, pool);
    if (q) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: q.why }); continue; }
    const { alloc, used, hint } = multiAlloc(p, pool);
    if (hint) hints.push(hint);
    // «συνδυάζεται»: δεσμεύονται μόνο τα τεμάχια με έκπτωση· αλλιώς όλη η ομάδα (και τα πληρωμένα) χάνει την απλή έκπτωση
    const claimed = pool.filter((l) => (p.stacking === "combine" ? (alloc.get(l.key) ?? 0) > 0 : used.has(l.key)));
    const B = claimed.reduce((a, l) => a + (alloc.get(l.key) ?? 0), 0);
    if (!B) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: hint ?? "δεν συμπληρώνεται ακόμα η ποσότητα" }); continue; }
    const S = claimed.reduce((a, l) => a + (priceWin.get(l.key)?.d ?? 0) * l.qty, 0);
    if (p.stacking !== "exclusive" && S >= B) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: "στα ίδια προϊόντα η έκπτωση τιμής δίνει περισσότερα" }); continue; }
    for (const l of claimed) { multiWin.set(l.key, { p, amt: alloc.get(l.key) ?? 0 }); priceWin.delete(l.key); }
  }
  for (const l of lines) {
    const w = priceWin.get(l.key), m = multiWin.get(l.key);
    const p = m?.p ?? w?.p;
    if (!p) continue;
    const amt = m ? m.amt : w!.d * l.qty;
    if (amt <= 0) continue; // «πληρωμένο» τεμάχιο της ομάδας: συμμετέχει, χωρίς έκπτωση
    l.discPrice = amt;
    l.adjustments.push({ promotionId: p.id, code: p.code, version: p.version, kind: "price", amount: amt, label: p.tagLabel || p.name });
    if (m) {
      let t = trace.find((x) => x.promotionId === p.id && x.applied);
      if (!t) { t = { promotionId: p.id, code: p.code, name: p.name, applied: true, amount: 0, reason: "εφαρμόστηκε", lines: [] }; trace.push(t); }
      t.amount += amt; t.lines!.push(l.key);
    } else { const t = priceTrace.get(p.id)!; t.applied = true; t.amount += amt; t.lines!.push(l.key); }
  }
  for (const [id, t] of priceTrace) {
    if (t.applied) { t.reason = "εφαρμόστηκε"; trace.push(t); continue; }
    // ήταν επιλέξιμη αλλά «έχασε» σε κάθε γραμμή της
    const p = pricePromos.find((x) => x.id === id)!;
    const winners = [...new Set(lines.filter((l) => matches(p, l)).map((l) => (multiWin.get(l.key) ?? priceWin.get(l.key))?.p).filter(Boolean).map((x) => x!.name))];
    trace.push({ ...t, reason: winners.length ? `στα ίδια προϊόντα εφαρμόστηκε η «${winners.join("», «")}», που δίνει περισσότερα ή είναι αποκλειστική` : "δεν δίνει έκπτωση σε αυτά τα προϊόντα" });
  }

  // ---- δώρα, δωρεάν υπηρεσίες, δωρεάν μεταφορικά: συνδυάζονται με όλα ----
  const gifts: EngineResult["gifts"] = [], servicesFree: EngineResult["services"] = [];
  let freeShipping: PromoRef | null = null;
  for (const p of live) {
    if (p.mechanism !== "gift" && p.mechanism !== "service" && p.mechanism !== "shipping") continue;
    const touched = lines.filter((l) => matches(p, l));
    if (!touched.length) continue;
    const ref = { promotionId: p.id, code: p.code, version: p.version, label: p.tagLabel || p.name };
    const q = qualifies(p, touched);
    if (q) {
      trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: q.why });
      if (q.missing > 0) hints.push(p.mechanism === "shipping" ? `Σου λείπουν ${eur(q.missing)} για δωρεάν μεταφορικά.` : p.mechanism === "gift" ? `Σου λείπουν ${eur(q.missing)} για το δώρο της προσφοράς «${p.name}».` : `Σου λείπουν ${eur(q.missing)} για την προσφορά «${p.name}».`);
      continue;
    }
    if (p.mechanism === "gift" && p.reward.giftProductId) gifts.push({ ...ref, productId: p.reward.giftProductId, qty: Math.max(1, p.reward.giftQty ?? 1) });
    else if (p.mechanism === "service" && p.reward.serviceSlug) for (const l of touched) servicesFree.push({ ...ref, lineKey: l.key, slug: p.reward.serviceSlug });
    else if (p.mechanism === "shipping") freeShipping ??= ref;
    trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: true, amount: 0, reason: "εφαρμόστηκε", lines: touched.map((l) => l.key) });
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
      const exclusiveLines = new Set(lines.filter((l) => (multiWin.get(l.key) ?? priceWin.get(l.key))?.p.stacking === "exclusive").map((l) => l.key));
      // «σε προσφορά» = έχει έκπτωση τιμής Ή συμμετέχει σε ομάδα 2+1 / 2ο −Χ % / ποσότητας (και ως «πληρωμένο» τεμάχιο)
      const eligible = lines.filter((l) => matches(p, l) && !exclusiveLines.has(l.key) && (p.stacking !== "no-price" || (l.discPrice === 0 && !multiWin.has(l.key))));
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

  // ---- 2β. έκπτωση τρόπου πληρωμής: μία, η μεγαλύτερη· πάνω σε ό,τι μένει μετά από προσφορές και κουπόνι ----
  let payment: EngineResult["payment"] = null;
  {
    const exclusiveLines = new Set(lines.filter((l) => (multiWin.get(l.key) ?? priceWin.get(l.key))?.p.stacking === "exclusive").map((l) => l.key));
    let best: { p: EnginePromo; want: number; eligible: PricedLine[] } | null = null;
    for (const p of live.filter((x) => (PAYMENT_MECHANISMS as string[]).includes(x.mechanism)).sort((a, b) => a.priority - b.priority)) {
      const codes = p.rules?.payment ?? [];
      const off = p.mechanism === "payment-percent" ? `−${p.reward.percent ?? 0} %` : `−${eur(p.reward.amount ?? 0)}`;
      if (!codes.length) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: "δεν έχει οριστεί τρόπος πληρωμής" }); continue; }
      if (!ctx.payment || !codes.includes(ctx.payment)) {
        if (lines.some((l) => matches(p, l))) {
          trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: `ισχύει μόνο με ${payLabel(codes)}` });
          hints.push(`${off} αν πληρώσεις με ${payLabel(codes)}.`);
        }
        continue;
      }
      const eligible = lines.filter((l) => matches(p, l) && !exclusiveLines.has(l.key) && (p.stacking !== "no-price" || (l.discPrice === 0 && l.discCoupon === 0 && !multiWin.has(l.key))));
      const base = eligible.reduce((a, l) => a + (l.listTotal - l.discPrice - l.discCoupon), 0);
      if (!eligible.length || base <= 0) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: p.stacking === "no-price" ? "δεν συνδυάζεται με προϊόντα σε προσφορά" : "κανένα επιλέξιμο προϊόν" }); continue; }
      if (p.rules?.minValue && base < p.rules.minValue) { trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: `χρειάζεται καλάθι τουλάχιστον ${eur(p.rules.minValue)}` }); continue; }
      const want = p.mechanism === "payment-percent" ? Math.round((base * (p.reward.percent ?? 0)) / 100) : Math.min(base, p.reward.amount ?? 0);
      if (!best || want > best.want) { if (best) trace.push({ promotionId: best.p.id, code: best.p.code, name: best.p.name, applied: false, amount: 0, reason: `εφαρμόστηκε η «${p.name}», που δίνει περισσότερα` }); best = { p, want, eligible }; }
      else trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: false, amount: 0, reason: `εφαρμόστηκε η «${best.p.name}», που δίνει περισσότερα` });
    }
    if (best && best.want > 0) {
      const { p, want, eligible } = best;
      const parts = allocate(want, eligible.map((l) => l.listTotal - l.discPrice - l.discCoupon));
      eligible.forEach((l, i) => { if (parts[i] > 0) { l.discPayment = parts[i]; l.adjustments.push({ promotionId: p.id, code: p.code, version: p.version, kind: "payment", amount: parts[i], label: p.tagLabel || p.name }); } });
      payment = { promotionId: p.id, code: p.code, version: p.version, label: p.tagLabel || p.name, amount: want };
      trace.push({ promotionId: p.id, code: p.code, name: p.name, applied: true, amount: want, reason: "εφαρμόστηκε", lines: eligible.map((l) => l.key) });
    }
  }

  // ---- 3. δικλείδες ανά γραμμή ----
  const maxPct = ctx.maxLinePct ?? 100;
  for (const l of lines) {
    let disc = l.discPrice + l.discCoupon + l.discPayment;
    // οι μηχανισμοί πολλών τεμαχίων (2+1, 2ο −Χ %, ποσότητα) έχουν ήδη όριο από τον σχεδιασμό τους (π.χ. 1 στα 3 δωρεάν):
    // το δωρεάν τεμάχιο είναι 100 % στη δική του γραμμή και δεν κόβεται· μόνο το κουπόνι δεν περνά το υπόλοιπο της γραμμής
    const multi = multiWin.has(l.key);
    const capPct = multi ? l.listTotal : Math.floor((l.listTotal * maxPct) / 100);
    const capCost = multi || ctx.costFloor === false ? Infinity : l.cost != null ? Math.max(0, l.listTotal - l.cost * l.qty) : Infinity;
    const cap = Math.min(capPct, capCost);
    if (disc > cap) {
      // κόβεται πρώτα η έκπτωση πληρωμής, μετά το κουπόνι, μετά η έκπτωση τιμής
      let over = disc - cap;
      const fromPay = Math.min(over, l.discPayment); l.discPayment -= fromPay; over -= fromPay;
      const fromCoupon = Math.min(over, l.discCoupon); l.discCoupon -= fromCoupon; over -= fromCoupon;
      l.discPrice -= over;
      for (const a of l.adjustments) a.amount = a.kind === "coupon" ? l.discCoupon : a.kind === "payment" ? l.discPayment : l.discPrice;
      l.capped = capCost < capPct ? "cost" : "max-pct";
      disc = cap;
    }
    l.total = l.listTotal - disc;
    l.unitFinal = Math.round(l.total / l.qty);
  }
  // το ίχνος δείχνει τα πραγματικά ποσά μετά τις δικλείδες
  for (const t of trace) if (t.applied) t.amount = lines.reduce((a, l) => a + l.adjustments.filter((x) => x.promotionId === t.promotionId).reduce((b, x) => b + x.amount, 0), 0);

  const listTotal = lines.reduce((a, l) => a + l.listTotal, 0), discPrice = lines.reduce((a, l) => a + l.discPrice, 0), discCoupon = lines.reduce((a, l) => a + l.discCoupon, 0), discPayment = lines.reduce((a, l) => a + l.discPayment, 0);
  if (payment) payment.amount = discPayment;
  return { lines, listTotal, discPrice, discCoupon, discPayment, total: listTotal - discPrice - discCoupon - discPayment, trace, couponApplied, couponMessage, payment: payment && payment.amount > 0 ? payment : null, gifts, services: servicesFree, freeShipping, hints };
}
