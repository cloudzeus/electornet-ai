// Τιμές με markup: καθαρές συναρτήσεις (χωρίς prisma / δίκτυο) για την προεπισκόπηση εισαγωγής και την έγκριση νέων ειδών.
export type Rounding = "none" | "int" | "90" | "99";

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Τιμή από κελί Excel → αριθμός > 0 ή null. Ο ΤΕΛΕΥΤΑΙΟΣ διαχωριστής είναι το δεκαδικό· μόνο τελείες τύπου «1.234» = χιλιάδες. */
export function parseMoney(v: string): number | null {
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const dot = s.lastIndexOf("."), comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? "." : ",";
    s = s.split(dec === "." ? "," : ".").join("");
    if (dec === ",") s = s.replace(",", ".");
  } else if (comma >= 0) {
    s = s.split(".").join("").replace(",", ".");
  } else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Ο πιο ειδικός ενεργός κανόνας: μάρκα+κατηγορία > κατηγορία > μάρκα > γενικός. Ισοβαθμία → ο πρώτος. */
export function pickRule<R extends { brandId: string | null; categoryId: string | null; active: boolean }>(
  rules: R[], brandId: string | null, categoryId: string | null,
): R | null {
  let best: R | null = null, bestScore = -1;
  for (const r of rules) {
    if (!r.active) continue;
    if (r.brandId !== null && r.brandId !== brandId) continue;
    if (r.categoryId !== null && r.categoryId !== categoryId) continue;
    const score = r.brandId !== null && r.categoryId !== null ? 3 : r.categoryId !== null ? 2 : r.brandId !== null ? 1 : 0;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

// Στρογγυλοποίηση της τιμής με ΦΠΑ· δουλεύουμε σε ακέραια λεπτά ώστε το 161,90 να μένει 161,90.
function roundGross(p: number, rounding: Rounding): number {
  const cents = Math.round(p * 100);
  if (rounding === "none") return cents / 100;
  if (rounding === "int") return Math.ceil(cents / 100);
  const end = rounding === "90" ? 90 : 99;
  let c = Math.floor(cents / 100) * 100 + end;
  if (c < cents) c += 100;
  return c / 100;
}

/** Κόστος → τιμή λιανικής με ΦΠΑ: κόστος × (1+markup%) × (1+ΦΠΑ%), στρογγυλοποίηση, πλαφόν στην ΤΛΤ. margin = καθαρή τιμή − κόστος. */
export function priceFrom(i: { cost: number; percent: number; vat: number; rounding: Rounding; rrp?: number | null }): { price: number; capped: boolean; margin: number } {
  const gross = round2(i.cost * (1 + i.percent / 100) * (1 + i.vat / 100));
  let price = roundGross(gross, i.rounding);
  let capped = false;
  if (typeof i.rrp === "number" && Number.isFinite(i.rrp) && i.rrp > 0 && price > i.rrp) { price = round2(i.rrp); capped = true; }
  return { price, capped, margin: round2(price / (1 + i.vat / 100) - i.cost) };
}
