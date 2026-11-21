/**
 * Εγγύηση και επέκταση εγγύησης — οι κανόνες του καταστήματος, χωρίς βάση:
 * - Η εγγύηση του κατασκευαστή δεν είναι σε πεδίο του SoftOne (το GUARTIME είναι κενό παντού)· γράφεται στην αναλυτική
 *   περιγραφή («Εγγύηση : 2 χρόνια», «5 Χρόνια Kenwood», «Διετής…»). Χωρίς αναφορά: η νόμιμη 2ετής.
 * - Επέκταση +24 μήνες: ΠΑΝΤΑ με χρέωση, όπως στα καταστήματα. Το «Επέκταση Εγγύησης» (MTRL.CCCWARRANTY) λέει ποια
 *   είδη τη δέχονται (6.822 από 9.278 είδη του site) — ΟΧΙ ότι είναι δωρεάν: στα παραστατικά των καταστημάτων τα ίδια
 *   είδη χρεώνονται με το είδος ΕΓΓΥΗΣΗ, 15,5 % της τιμής της συσκευής (ελεγμένο σε 351 γραμμές ΕΓΓΥΗΣΗ).
 * - Τιμή: οι κλίμακες της διαχείρισης (κατηγορία × τιμή αγοράς: σταθερό ποσό ή ποσοστό) — η γενική κλίμακα είναι 15,5 %.
 * - Πού αγοράζεται: προαιρετική επιλογή στη σελίδα προϊόντος και στο καλάθι, ή αργότερα από «Οι συσκευές μου»
 *   (πληρωμή Viva) όσο η εγγύηση του κατασκευαστή είναι σε ισχύ, μία φορά, μόνο για αγορές Euronics.
 */
export const LEGAL_WARRANTY_MONTHS = 24;
export const EXTENSION_MONTHS = 24;
export const EXTENSION_SLUG = "epektasi-eggyisis";

/**
 * Η εγγύηση ενός προϊόντος όπως τη δείχνει η σελίδα: μήνες κατασκευαστή και η ΠΡΟΑΙΡΕΤΙΚΗ επέκταση
 * (`extMonths` 0 = δεν προσφέρεται για αυτό το είδος, `extPrice` = η τιμή της από τις κλίμακες).
 */
export interface WarrantyInfo { months: number; extMonths: number; extPrice?: number | null }

const span = (m: number) => (m % 12 ? `${m} μήνες` : m === 12 ? "1 έτος" : `${m / 12} έτη`);
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: n % 1 ? 2 : 0 });

/** «Εγγύηση 2 έτη» — η εγγύηση του κατασκευαστή (η επέκταση είναι προαιρετική αγορά, δεν μπαίνει στον τίτλο). */
export function warrantyLabel(w: WarrantyInfo | undefined) {
  return `Εγγύηση ${span(w?.months ?? LEGAL_WARRANTY_MONTHS)}`;
}
/** «2 έτη από τον κατασκευαστή… · προαιρετική επέκταση +2 έτη με 54,10 €» — μία διατύπωση για όλο το site. */
export function warrantyDetail(w: WarrantyInfo | undefined) {
  const base = `${span(w?.months ?? LEGAL_WARRANTY_MONTHS)} από τον κατασκευαστή, με την απόδειξη αγοράς`;
  if (!w?.extMonths) return base;
  return `${base} · προαιρετική επέκταση +${span(w.extMonths)}${w.extPrice ? ` με ${eur(w.extPrice)}` : ""}`;
}

const WORD_YEARS: [RegExp, number][] = [[/διετ|δυο ετ|δύο ετ|2ετ/i, 2], [/τριετ|3ετ/i, 3], [/τετραετ|4ετ/i, 4], [/πενταετ|5ετ/i, 5]];

/** Μήνες εγγύησης από ελεύθερο κείμενο («2 χρόνια», «24 μήνες», «5 Χρόνια Kenwood», «2 years», «Διετής»). */
export function parseWarrantyMonths(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const m = t.match(/(\d{1,2})\s*(?:\+\s*\d{1,2}\s*)?(χρ[οό]ν|ετ[ηώ]|έτ[ηώ]|έτος|ετος|year|yr|y\b)/i);
  if (m) { const y = Number(m[1]); return y >= 1 && y <= 10 ? y * 12 : null; }
  const mo = t.match(/(\d{1,3})\s*μ[ηή]ν/i);
  if (mo) { const n = Number(mo[1]); return n >= 6 && n <= 120 ? n : null; }
  for (const [re, y] of WORD_YEARS) if (re.test(t)) return y * 12;
  return null;
}

/** Η εγγύηση του κατασκευαστή από τα χαρακτηριστικά του προϊόντος (γραμμές με «Εγγύηση» στην ετικέτα). */
export function warrantyFromSpecs(specs: { key: string; value: string }[]): { months: number; text: string } | null {
  for (const s of specs) {
    if (!/εγγ[υύ]ησ/i.test(s.key)) continue;
    const months = parseWarrantyMonths(s.value) ?? parseWarrantyMonths(s.key);
    if (months) return { months, text: s.value.trim() };
  }
  return null;
}

export const addMonths = (d: Date, n: number) => { const x = new Date(d.getTime()); x.setMonth(x.getMonth() + n); return x; };

export interface ExtendCheck { eligible: boolean; reason: string | null }
/** Οι όροι κάθε επέκτασης: αγορά Euronics, εγγύηση κατασκευαστή σε ισχύ, χωρίς επέκταση ως τώρα. */
export function canExtendAtAll(d: { registeredBy: string; warrantyUntil: Date | null; extendedUntil: Date | null }, now = new Date()): ExtendCheck {
  if (d.extendedUntil) return { eligible: false, reason: "Έχει ήδη επέκταση εγγύησης." };
  if (d.registeredBy !== "order" && d.registeredBy !== "erp") return { eligible: false, reason: "Η επέκταση ισχύει για αγορές από Euronics." };
  if (!d.warrantyUntil || d.warrantyUntil.getTime() <= now.getTime()) return { eligible: false, reason: "Η εγγύηση του κατασκευαστή έχει λήξει." };
  return { eligible: true, reason: null };
}

// ---------- επέκταση επί πληρωμή: κλίμακες τιμών ----------

/**
 * Μία κλίμακα: κατηγορία (slug, κενό = όλες) × εύρος τιμής αγοράς (με ΦΠΑ, € — max κενό = χωρίς όριο) → τιμή
 * επέκτασης, είτε σταθερό ποσό (`price`) είτε ποσοστό της τιμής αγοράς (`pct` > 0 — έτσι χρεώνεται στα καταστήματα: 15,5 %).
 */
export interface ExtTier { id: string; category: string; min: number; max: number | null; price: number; pct: number }
export interface ExtPricing { enabled: boolean; tiers: ExtTier[] }

/**
 * Η τιμή της επέκτασης για μια συσκευή: η πιο ειδική κατηγορία κερδίζει (η ίδια, μετά οι πρόγονοι με τη σειρά, στο
 * τέλος οι γενικές κλίμακες) και μέσα της το εύρος που περιέχει την τιμή αγοράς. Χωρίς τιμή αγοράς ή κλίμακα: null.
 * Στις ποσοστιαίες κλίμακες το `price` που γυρίζει είναι το ποσό για αυτή τη συσκευή, στρογγυλεμένο στο λεπτό.
 */
export function extensionPrice(p: ExtPricing, categoryPath: string[], purchasePrice: number | null): ExtTier | null {
  if (!p.enabled || purchasePrice == null || !(purchasePrice > 0)) return null;
  for (const cat of [...categoryPath, ""]) {
    const hit = p.tiers.find((t) => t.category === cat && purchasePrice >= t.min && (t.max == null || purchasePrice <= t.max));
    if (hit) return hit.pct > 0 ? { ...hit, price: Math.round(purchasePrice * hit.pct) / 100 } : hit;
  }
  return null;
}

/** Καθαρές κλίμακες από ό,τι αποθηκεύτηκε (ή έστειλε η φόρμα): αριθμοί, εύρη με λογική, θετική τιμή. */
export function normalizePricing(raw: unknown): ExtPricing {
  const o = (raw ?? {}) as { enabled?: unknown; tiers?: unknown };
  const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
  const tiers: ExtTier[] = [];
  for (const x of Array.isArray(o.tiers) ? o.tiers : []) {
    const t = x as Record<string, unknown>;
    const min = num(t.min) ?? 0, max = num(t.max), price = num(t.price), pct = num(t.pct) ?? 0;
    if (min < 0 || (max != null && max < min)) continue;
    if (pct > 0 ? pct > 100 : price == null || price <= 0) continue;
    tiers.push({ id: String(t.id || `t${tiers.length + 1}`).slice(0, 40), category: String(t.category ?? "").trim().slice(0, 160), min, max, price: pct > 0 ? 0 : price!, pct: pct > 0 ? pct : 0 });
  }
  tiers.sort((a, b) => a.category.localeCompare(b.category) || a.min - b.min);
  return { enabled: o.enabled === true, tiers };
}
