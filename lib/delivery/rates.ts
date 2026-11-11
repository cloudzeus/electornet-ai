/**
 * Τιμοκατάλογοι μεταφορικών: ζώνη (από τον Τ.Κ.) × κλίμακα βάρους → τιμή για τον πελάτη (και κόστος για εμάς).
 * Καθαρές συναρτήσεις, ίδιες στον server, στον επεξεργαστή τιμοκαταλόγου και στον «δοκιμαστικό υπολογισμό». Ποσά σε λεπτά.
 */
export interface RateZone { id: string; name: string; /** προθέματα Τ.Κ. — κενό = «όλα τα υπόλοιπα» */ prefixes: string[] }
export interface RateData {
  zones: RateZone[];
  /** ανώτατα κιλά κάθε κλίμακας, αύξουσα σειρά */
  brackets: number[];
  /** τιμή πελάτη ανά ζώνη και κλίμακα */
  prices: Record<string, number[]>;
  /** κόστος για εμάς ανά ζώνη και κλίμακα (προαιρετικό) */
  costs?: Record<string, number[]>;
  /** πάνω από την τελευταία κλίμακα: ανά επιπλέον κιλό */
  extraPerKg: number;
  /** δυσπρόσιτες περιοχές: προθέματα Τ.Κ. και επιβάρυνση */
  remote: { prefixes: string[]; surcharge: number };
  /** δωρεάν από (αξία καλαθιού)· null = ποτέ */
  freeFrom: number | null;
  /** το «δωρεάν από» δεν ισχύει για ογκώδη (μεταφορική) */
  freeExcludesBulky: boolean;
  /** ογκομετρικό βάρος = μ × π × υ (εκ.) / divisor */
  divisor: number;
  /** ελάχιστο κόστος αποστολής */
  floor: number;
}

export const ISLAND_PREFIXES = ["70", "71", "72", "73", "74", "81", "82", "83", "84", "85", "28", "29", "49"];
export const DEFAULT_RATES: RateData = {
  zones: [
    { id: "attica", name: "Αττική", prefixes: ["1"] },
    { id: "islands", name: "Νησιά και Κρήτη", prefixes: ISLAND_PREFIXES },
    { id: "mainland", name: "Υπόλοιπη ηπειρωτική", prefixes: [] },
  ],
  brackets: [2, 5, 10, 20, 30],
  prices: { attica: [390, 490, 690, 990, 1490], mainland: [490, 590, 790, 1190, 1690], islands: [590, 790, 990, 1490, 2190] },
  extraPerKg: 50,
  remote: { prefixes: [], surcharge: 300 },
  freeFrom: 10000,
  freeExcludesBulky: true,
  divisor: 5000,
  floor: 0,
};

const zipOk = (zip: string | null | undefined) => /^\d{5}$/.test(zip ?? "");

/** Η ζώνη του Τ.Κ.: το μακρύτερο πρόθεμα που ταιριάζει, αλλιώς η ζώνη «όλα τα υπόλοιπα». Άγνωστος Τ.Κ. → null. */
export function zoneFor(data: RateData, zip: string | null | undefined): RateZone | null {
  if (!zipOk(zip)) return null;
  let best: RateZone | null = null, len = -1;
  for (const z of data.zones) for (const p of z.prefixes) if (zip!.startsWith(p) && p.length > len) { best = z; len = p.length; }
  return best ?? data.zones.find((z) => !z.prefixes.length) ?? null;
}

/** Χρεώσιμο βάρος: το μεγαλύτερο από το πραγματικό και το ογκομετρικό, για κάθε τεμάχιο. Άγνωστο βάρος μετρά 1 κιλό. */
export function chargeableKg(items: { qty: number; weightKg: number | null; dimsCm: [number, number, number] | null }[], divisor: number): number {
  return items.reduce((s, i) => {
    const vol = i.dimsCm && divisor > 0 ? (i.dimsCm[0] * i.dimsCm[1] * i.dimsCm[2]) / divisor : 0;
    return s + Math.max(i.weightKg ?? 1, vol) * Math.max(1, i.qty);
  }, 0);
}

/** Η κλίμακα για τα κιλά (δείκτης) και τα επιπλέον κιλά πάνω από την τελευταία. */
export function bracketFor(data: RateData, kg: number): { index: number; extraKg: number } {
  const i = data.brackets.findIndex((b) => kg <= b);
  if (i >= 0) return { index: i, extraKg: 0 };
  const last = data.brackets.length - 1;
  return { index: last, extraKg: Math.ceil(kg - data.brackets[last]) };
}

export interface RateQuote { fee: number; baseFee: number; cost: number | null; zone: RateZone; remote: boolean; kg: number; free: boolean }

/** Η τιμή για ένα καλάθι. null = άγνωστος Τ.Κ. ή ζώνη χωρίς τιμές (τότε ισχύει η σταθερή τιμή των ρυθμίσεων). */
export function quoteRate(data: RateData, input: { zip: string | null | undefined; goods: number; kg: number; bulky?: boolean }): RateQuote | null {
  const zone = zoneFor(data, input.zip);
  const row = zone && data.prices[zone.id];
  if (!zone || !row?.length) return null;
  const { index, extraKg } = bracketFor(data, input.kg);
  const remote = data.remote.prefixes.some((p) => input.zip!.startsWith(p));
  const add = extraKg * data.extraPerKg + (remote ? data.remote.surcharge : 0);
  const baseFee = Math.max(data.floor, (row[index] ?? row[row.length - 1]) + add);
  const c = data.costs?.[zone.id];
  const cost = c?.length ? (c[index] ?? c[c.length - 1]) + extraKg * data.extraPerKg : null;
  const free = data.freeFrom != null && input.goods >= data.freeFrom && !(input.bulky && data.freeExcludesBulky);
  return { fee: free ? 0 : baseFee, baseFee, cost, zone, remote, kg: Math.round(input.kg * 10) / 10, free };
}

const ints = (v: unknown, n: number) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => Math.max(0, Math.round(Number(x) || 0)));
const strs = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter((x) => /^\d{1,5}$/.test(x));

/** Ό,τι έρχεται από τη φόρμα ή τη βάση γίνεται έγκυρος τιμοκατάλογος (τιμές ≥ 0, κλίμακες αύξουσες, Τ.Κ. μόνο ψηφία). */
export function normalizeRates(raw: unknown): RateData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const brackets = (Array.isArray(r.brackets) ? r.brackets : DEFAULT_RATES.brackets).map(Number).filter((n) => n > 0 && n <= 2000);
  const sorted = [...new Set(brackets)].sort((a, b) => a - b).slice(0, 12);
  const zonesIn = Array.isArray(r.zones) && r.zones.length ? r.zones : DEFAULT_RATES.zones;
  const zones: RateZone[] = (zonesIn as Record<string, unknown>[]).slice(0, 20).map((z, i) => ({ id: String(z.id ?? `z${i}`).replace(/[^\w-]/g, "").slice(0, 32) || `z${i}`, name: String(z.name ?? "").slice(0, 60) || `Ζώνη ${i + 1}`, prefixes: strs(z.prefixes) }));
  const table = (v: unknown) => Object.fromEntries(zones.map((z) => [z.id, ints((v as Record<string, unknown> | undefined)?.[z.id], sorted.length)]));
  const num = (v: unknown, d: number) => (v === "" || v == null || !Number.isFinite(Number(v)) ? d : Math.max(0, Math.round(Number(v))));
  const remote = (r.remote ?? {}) as Record<string, unknown>;
  return {
    zones, brackets: sorted.length ? sorted : DEFAULT_RATES.brackets,
    prices: table(r.prices), costs: r.costs ? table(r.costs) : undefined,
    extraPerKg: num(r.extraPerKg, DEFAULT_RATES.extraPerKg),
    remote: { prefixes: strs(remote.prefixes), surcharge: num(remote.surcharge, DEFAULT_RATES.remote.surcharge) },
    freeFrom: r.freeFrom === null || r.freeFrom === "" ? null : num(r.freeFrom, DEFAULT_RATES.freeFrom!),
    freeExcludesBulky: r.freeExcludesBulky !== false,
    divisor: num(r.divisor, DEFAULT_RATES.divisor) || DEFAULT_RATES.divisor,
    floor: num(r.floor, 0),
  };
}
