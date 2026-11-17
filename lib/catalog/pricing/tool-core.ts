// Τιμολόγηση: καθαρές αποφάσεις (χωρίς DB / δίκτυο). Πωλήσεις είδους → τελευταία τιμή και μέση τιμή· πρόταση markup· νέα τιμή ή λόγος αποκλεισμού.
import { priceFrom, type Rounding } from "./markup";

/** Μία κίνηση πώλησης του είδους (MTRTRN): `net` = αξία γραμμής χωρίς ΦΠΑ για όλη την ποσότητα· `retail` = πελάτης λιανικής (eshop). */
export type Trn = { date: Date; retail: boolean; qty: number; net: number };
export const PERIODS = [30, 90, 365] as const;
export type Period = (typeof PERIODS)[number];
/** eshop: τιμή μονάδας ΜΕ ΦΠΑ (όπως τη βλέπει ο πελάτης)· συνεργάτης: ΧΩΡΙΣ ΦΠΑ (όπως τιμολογείται)· avg: μέση τιμή eshop με ΦΠΑ, σταθμισμένη στα τεμάχια. */
export type Sales = { eshop: { price: number; at: string } | null; partner: { price: number; at: string } | null; avg: Record<Period, number | null> };

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const r1 = (x: number) => Math.round((x + Number.EPSILON) * 10) / 10;
const DAY = 86_400_000;

export function salesStats(trns: Trn[], vat: number, now: Date): Sales {
  const ok = trns.filter((t) => t.qty > 0 && t.net > 0).sort((a, b) => b.date.getTime() - a.date.getTime());
  const gross = 1 + vat / 100;
  const last = (retail: boolean) => { const t = ok.find((x) => x.retail === retail); return t ? { price: r2((t.net / t.qty) * (retail ? gross : 1)), at: t.date.toISOString() } : null; };
  const avg = {} as Sales["avg"];
  for (const p of PERIODS) {
    const w = ok.filter((t) => t.retail && now.getTime() - t.date.getTime() <= p * DAY);
    const qty = w.reduce((s, t) => s + t.qty, 0);
    avg[p] = qty > 0 ? r2((w.reduce((s, t) => s + t.net, 0) / qty) * gross) : null;
  }
  return { eshop: last(true), partner: last(false), avg };
}

/** Markup % πάνω στο κόστος (χωρίς ΦΠΑ) που δίνει τιμή με ΦΠΑ `gross`. Με ένα δεκαδικό· ποτέ αρνητικό. */
export function markupOf(gross: number | null | undefined, cost: number | null | undefined, vat: number): number | null {
  if (gross == null || cost == null || !(gross > 0) || !(cost > 0)) return null;
  return Math.max(0, r1((gross / (1 + vat / 100) / cost - 1) * 100));
}

export type Skip = "promo" | "no-cost" | "no-markup" | "low-margin" | "same";
export type Plan = { newPrice: number; changeEur: number; changePct: number } | { skip: Skip };
export type Opts = { rounding: Rounding; minMarginPct: number };
export const DEFAULT_OPTS: Opts = { rounding: "90", minMarginPct: 8 };

/**
 * `web` = η τιμή web τώρα (με ΦΠΑ)· `cost` χωρίς ΦΠΑ· `percent` null = ο χρήστης δεν έβαλε markup.
 * `target` = ρητή τιμή με ΦΠΑ (π.χ. τιμή Κωτσόβολου − Χ): γράφεται όπως είναι, χωρίς στρογγύλεμα, αλλά περνά την ίδια δικλείδα ελάχιστου κέρδους.
 */
export function planPrice(r: { cost: number | null; vat: number; web: number; promo: boolean }, percent: number | null, o: Opts, target?: number | null): Plan {
  if (r.promo) return { skip: "promo" };
  if (r.cost == null || !(r.cost > 0)) return { skip: "no-cost" };
  let newPrice: number;
  if (target != null) {
    if (!Number.isFinite(target) || target <= 0) return { skip: "no-markup" };
    newPrice = r2(target);
    if ((newPrice / (1 + r.vat / 100) / r.cost - 1) * 100 < o.minMarginPct) return { skip: "low-margin" };
  } else {
    if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 500) return { skip: "no-markup" };
    if (percent < o.minMarginPct) return { skip: "low-margin" };
    newPrice = priceFrom({ cost: r.cost, percent, vat: r.vat, rounding: o.rounding }).price;
  }
  if (Math.abs(newPrice - r.web) < 0.005) return { skip: "same" };
  const changeEur = r2(newPrice - r.web);
  return { newPrice, changeEur, changePct: r1((changeEur / r.web) * 100) };
}

/** Τιμή ανταγωνιστή μείον ποσό σε € ή ποσοστό, στο λεπτό. null όταν δεν βγαίνει θετική τιμή. */
export function underCut(theirs: number, amount: number, mode: "eur" | "pct"): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const p = r2(mode === "eur" ? theirs - amount : theirs * (1 - amount / 100));
  return p > 0 ? p : null;
}

export function cleanOpts(x: unknown): Opts | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const rounding = (["none", "int", "90", "99"] as const).find((v) => v === o.rounding);
  const m = o.minMarginPct;
  return rounding && typeof m === "number" && Number.isFinite(m) && m >= 0 && m <= 500 ? { rounding, minMarginPct: m } : null;
}

export const SKIP: Record<Skip, { label: string; hint: string }> = {
  promo: { label: "Σε προσφορά", hint: "Η τιμή του ορίζεται από την προσφορά. Άλλαξέ το από τις Προσφορές." },
  "no-cost": { label: "Χωρίς κόστος αγοράς", hint: "Το SoftOne δεν έχει αξιόπιστο κόστος για το είδος, άρα δεν βγαίνει τιμή από markup." },
  "no-markup": { label: "Βάλε markup", hint: "Δεν υπάρχουν πωλήσεις για πρόταση. Γράψε εσύ το ποσοστό." },
  "low-margin": { label: "Κέρδος κάτω από το όριο", hint: "Το markup είναι μικρότερο από το ελάχιστο κέρδος. Ανέβασέ το ή χαμήλωσε το όριο." },
  same: { label: "Ίδια τιμή", hint: "Με αυτό το markup η τιμή δεν αλλάζει." },
};
