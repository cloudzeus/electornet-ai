/**
 * Εγγύηση και επέκταση εγγύησης — οι κανόνες του καταστήματος, χωρίς βάση:
 * - Η εγγύηση του κατασκευαστή δεν είναι σε πεδίο του SoftOne (το GUARTIME είναι κενό παντού)· γράφεται στην αναλυτική
 *   περιγραφή («Εγγύηση : 2 χρόνια», «5 Χρόνια Kenwood», «Διετής…»). Χωρίς αναφορά: η νόμιμη 2ετής.
 * - Επέκταση: ΔΩΡΕΑΝ +24 μήνες, μόνο για είδη με «Επέκταση Εγγύησης» (MTRL.CCCWARRANTY) στο SoftOne.
 * - Για παλιές αγορές (προφίλ): μόνο αγορές Euronics (e-shop ή κατάστημα, από το SoftOne), όσο η εγγύηση είναι σε ισχύ,
 *   μία φορά.
 */
export const LEGAL_WARRANTY_MONTHS = 24;
export const EXTENSION_MONTHS = 24;
export const EXTENSION_SLUG = "epektasi-eggyisis";

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
/** Μπορεί αυτή η συσκευή του πελάτη να πάρει τη δωρεάν επέκταση; */
export function canExtend(d: { registeredBy: string; productEligible: boolean; warrantyUntil: Date | null; extendedUntil: Date | null }, now = new Date()): ExtendCheck {
  if (d.extendedUntil) return { eligible: false, reason: "Έχει ήδη επέκταση εγγύησης." };
  if (d.registeredBy !== "order" && d.registeredBy !== "erp") return { eligible: false, reason: "Η επέκταση ισχύει για αγορές από Euronics." };
  if (!d.productEligible) return { eligible: false, reason: "Αυτό το προϊόν δεν έχει επέκταση εγγύησης." };
  if (!d.warrantyUntil || d.warrantyUntil.getTime() <= now.getTime()) return { eligible: false, reason: "Η εγγύηση του κατασκευαστή έχει λήξει." };
  return { eligible: true, reason: null };
}
