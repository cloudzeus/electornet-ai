// Καθαρά: περιθώριο και δικλείδες της «Αλλαγής τιμής» ενός προϊόντος. Χωρίς DB — και στον client και στον server.

const r1 = (x: number) => Math.round((x + Number.EPSILON) * 10) / 10;
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Περιθώριο % στην καθαρή τιμή: (τιμή χωρίς ΦΠΑ − κόστος) / τιμή χωρίς ΦΠΑ. Το κόστος αγοράς είναι πάντα χωρίς ΦΠΑ. */
export function marginPct(priceWithVat: number | null, vatRate: number, netCost: number | null): number | null {
  if (priceWithVat == null || priceWithVat <= 0 || netCost == null || netCost <= 0) return null;
  const net = priceWithVat / (1 + vatRate / 100);
  return r1(((net - netCost) / net) * 100);
}

/** Μείωση πάνω από αυτό το ποσοστό θέλει δεύτερο πάτημα. */
export const BIG_DROP_PCT = 20;

export type PriceCheck =
  | { ok: false; error: string }
  | { ok: true; value: number; changeEur: number; changePct: number; margin: number | null; belowCost: boolean; bigDrop: boolean };

/** Έλεγχος της νέας τιμής (με ΦΠΑ) απέναντι στην τωρινή τιμή web και στο κόστος. Η κρίση «χρειάζεται επιβεβαίωση» = belowCost || bigDrop. */
export function checkPrice(input: string | number, web: number, vatRate: number, netCost: number | null): PriceCheck {
  const v = typeof input === "number" ? input : Number(String(input).trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "Γράψε την τιμή σε ευρώ, π.χ. 849,90." };
  if (v > 100000) return { ok: false, error: "Η τιμή φαίνεται λάθος (πάνω από 100.000 €)." };
  const value = r2(v);
  if (Math.abs(value - web) < 0.005) return { ok: false, error: "Ίδια με την τωρινή τιμή." };
  const changeEur = r2(value - web), changePct = r1((changeEur / web) * 100);
  const margin = marginPct(value, vatRate, netCost);
  return { ok: true, value, changeEur, changePct, margin, belowCost: margin != null && margin < 0, bigDrop: changePct < -BIG_DROP_PCT };
}

/** Πάνω από αυτό το περιθώριο, ανεπιβεβαίωτο κόστος (τελευταία τιμή προμηθευτή) θεωρείται λάθος γραμμή (π.χ. παραστατικό εξόδων). */
export const MAX_UNVERIFIED_MARGIN = 60;

/** Κόστος για προβολή: το ανεπιβεβαίωτο κρύβεται όταν δίνει απίθανο περιθώριο στην τωρινή τιμή. */
export function shownCost(c: { cost: number; source: string } | null | undefined, priceWithVat: number | null, vatRate: number): { cost: number; unverified: boolean } | null {
  if (!c) return null;
  if (c.source !== "supplier-unverified") return { cost: c.cost, unverified: false };
  const m = marginPct(priceWithVat, vatRate, c.cost);
  return m != null && m > MAX_UNVERIFIED_MARGIN ? null : { cost: c.cost, unverified: true };
}
