/**
 * Αττική: «Κανονική παράδοση euronics» (δωρεάν, από το δίκτυο καταστημάτων) ή «ASAP Express» (Next Day, πραγματική
 * τιμή από το συμβόλαιο ASAP). Καθαρές συναρτήσεις — κανόνες, επιλεξιμότητα, δέμα, ανάγνωση τιμής. Ποσά σε λεπτά.
 * Ρυθμίσεις: setting «shipping.asap» (Εμπόριο → Αποστολές → ASAP Express).
 */
export interface AsapRules {
  /** διακόπτης της ροής Αττικής (κλειστός = το checkout όπως πριν) */
  on: boolean;
  /** ΤΚ Αττικής, π.χ. «10000-19999» (ένα εύρος ή ΤΚ ανά γραμμή / κόμμα) */
  atticaZips: string;
  /** ζώνες της ASAP (area_groups.to.name) όπου προσφέρεται Express */
  zones: string[];
  /** έως τόσα τεμάχια στο καλάθι */
  maxItems: number;
  /** επιλεξιμότητα ανά κατηγορία (slug → ναι/όχι)· η πιο ειδική κατηγορία κερδίζει */
  categories: Record<string, boolean>;
  /** εξαιρέσεις ανά SKU (κερδίζουν την κατηγορία) */
  skus: Record<string, boolean>;
}

export const ASAP_DEFAULT: AsapRules = { on: false, atticaZips: "10000-19999", zones: ["Αθήνα εντός", "Αθήνα εκτός"], maxItems: 3, categories: {}, skus: {} };
export const EXPRESS_ETA = "1–2 ημέρες";
export const STANDARD_ETA = "1–3 ημέρες";
export const STANDARD_UNKNOWN = "Ο ακριβής χρόνος παράδοσης επιβεβαιώνεται μετά την καταχώριση της παραγγελίας.";

const bools = (v: unknown): Record<string, boolean> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => k.trim() && typeof x === "boolean").map(([k, x]) => [k.trim(), x as boolean]));
};

export function normalizeAsapRules(raw: unknown): AsapRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const zones = Array.isArray(r.zones) ? r.zones.map((z) => String(z).trim()).filter(Boolean) : ASAP_DEFAULT.zones;
  const max = Number(r.maxItems);
  return {
    on: r.on === true,
    atticaZips: typeof r.atticaZips === "string" && r.atticaZips.trim() ? r.atticaZips.trim() : ASAP_DEFAULT.atticaZips,
    zones,
    maxItems: Number.isInteger(max) && max >= 1 && max <= 20 ? max : ASAP_DEFAULT.maxItems,
    categories: bools(r.categories),
    skus: bools(r.skus),
  };
}

/** «10000-19999, 18900» → εύρη. Ό,τι δεν είναι 5ψήφιο αγνοείται. */
export function zipRanges(text: string): [number, number][] {
  return text.split(/[\n,;]+/).flatMap((part) => {
    const m = /^\s*(\d{5})\s*(?:[-–]\s*(\d{5}))?\s*$/.exec(part);
    if (!m) return [];
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    return [[Math.min(a, b), Math.max(a, b)] as [number, number]];
  });
}
export function inZips(zip: string | null | undefined, text: string): boolean {
  const z = (zip ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(z)) return false;
  const n = Number(z);
  return zipRanges(text).some(([a, b]) => n >= a && n <= b);
}

/** Επιλέξιμο για ASAP: εξαίρεση SKU, αλλιώς η πιο ειδική κατηγορία με τιμή (path: η ίδια πρώτη, μετά οι γονείς). */
export function asapEligible(path: string[], sku: string | null | undefined, rules: AsapRules): boolean {
  const s = (sku ?? "").trim();
  if (s && s in rules.skus) return rules.skus[s];
  for (const slug of path) if (slug in rules.categories) return rules.categories[slug];
  return false;
}

export interface ExpressLine { title: string; qty: number; eligible: boolean; inStock: boolean; weightKg: number | null; dimsCm: [number, number, number] | null }
export interface ExpressPkg { weightKg: number; dims: [number, number, number] }
export type ExpressCheck = { ok: true; pkg: ExpressPkg } | { ok: false; reason: string };

/**
 * Το καλάθι επιτρέπει Express; Όλα επιλέξιμα, όλα διαθέσιμα, έως maxItems τεμάχια, γνωστά βάρος και διαστάσεις.
 * Δέμα για την τιμή = το προϊόν με τον μεγαλύτερο όγκο (οδηγία πελάτη).
 */
export function expressCheck(lines: ExpressLine[], rules: AsapRules): ExpressCheck {
  if (!lines.length) return { ok: false, reason: "Άδειο καλάθι" };
  const qty = lines.reduce((a, l) => a + l.qty, 0);
  if (qty > rules.maxItems) return { ok: false, reason: `Έως ${rules.maxItems} τεμάχια` };
  const no = lines.find((l) => !l.eligible);
  if (no) return { ok: false, reason: `${no.title}: δεν αποστέλλεται με ASAP` };
  const out = lines.find((l) => !l.inStock);
  if (out) return { ok: false, reason: `${out.title}: δεν είναι άμεσα διαθέσιμο` };
  const unk = lines.find((l) => !l.weightKg || !l.dimsCm);
  if (unk) return { ok: false, reason: `${unk.title}: χωρίς βάρος ή διαστάσεις` };
  const vol = (d: [number, number, number]) => d[0] * d[1] * d[2];
  const big = [...lines].sort((a, b) => vol(b.dimsCm!) - vol(a.dimsCm!))[0];
  return { ok: true, pkg: { weightKg: big.weightKg!, dims: big.dimsCm! } };
}

/** Τιμή από το /voucher-price-calculator: μόνο τιμοκατάλογοι σε επιτρεπτή ζώνη, χωρίς «Επιστροφές» / συμβολικές τιμές. */
export function pickAsapPrice(json: unknown, zones: string[]): { fee: number; zone: string } | null {
  const lists = (json as { items?: { price_lists?: unknown[] } } | null)?.items?.price_lists;
  if (!Array.isArray(lists)) return null;
  const allowed = new Set(zones.map((z) => z.trim().toLowerCase()));
  const ok = lists.flatMap((raw) => {
    const pl = raw as { name?: string; area_groups?: { to?: { name?: string } }; charges?: { total?: number } };
    const total = Number(pl.charges?.total);
    const zone = String(pl.area_groups?.to?.name ?? "").trim();
    if (!Number.isFinite(total) || total < 0.5 || /επιστροφ/i.test(pl.name ?? "") || !allowed.has(zone.toLowerCase())) return [];
    return [{ fee: Math.round(total * 100), zone }];
  });
  return ok.sort((a, b) => a.fee - b.fee)[0] ?? null;
}
