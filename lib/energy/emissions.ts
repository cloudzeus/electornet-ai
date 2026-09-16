import "server-only";
import { db } from "@/lib/db";

/**
 * Αποτύπωμα CO₂ της κατανάλωσης ρεύματος — emissions.dev.
 *
 * Το δωρεάν πλάνο έχει 500 κλήσεις τον μήνα, οπότε ΔΕΝ ρωτάμε ανά προϊόν.
 * Το μόνο που χρειαζόμαστε από το API είναι η ένταση άνθρακα του ελληνικού
 * δικτύου (g CO₂e ανά kWh)· τη ζητάμε μία φορά για 1000 kWh, την κρατάμε στη
 * βάση για 30 ημέρες και κάθε υπολογισμός γίνεται τοπικά, επί τόπου:
 * kg CO₂ = kWh × ένταση / 1000. Έτσι η σελίδα προϊόντος, η σύγκριση και το
 * Snap & Find δείχνουν CO₂ για κάθε συσκευή με ~1 κλήση τον μήνα.
 *
 * Κλειδί: EMITIONS_API_KEY (έτσι είναι γραμμένο στο .env). Αν λείπει ή το API
 * δεν απαντά, χρησιμοποιούμε την τελευταία αποθηκευμένη τιμή ή τη στατική
 * του Ember 2025 για την Ελλάδα, και το σημειώνουμε στην πηγή.
 */
export interface GridFactor {
  country: string;
  gPerKwh: number; // g CO₂e / kWh (location-based, χωρίς WTT)
  gPerKwhWtt: number; // με τις ανάντη εκπομπές (well-to-tank), όπως τις δίνει το API
  source: string; // «Ember Global Electricity Review 2025»
  year: number;
  fetchedAt: string; // ISO
  live: boolean; // false = στατική εφεδρική τιμή
}

const SECTION = "emissions";
const TTL_MS = 30 * 86400000;
const MONTHLY_BUDGET = 450; // κάτω από το όριο των 500, να μένει περιθώριο για δοκιμές
const FALLBACK: GridFactor = { country: "GR", gPerKwh: 316, gPerKwhWtt: 372.9, source: "Ember Global Electricity Review 2025 (στατική τιμή)", year: 2025, fetchedAt: "2026-02-09T00:00:00.000Z", live: false };

interface Stored { factors?: Record<string, GridFactor>; calls?: Record<string, number> }

const key = () => process.env.EMITIONS_API_KEY ?? process.env.EMISSIONS_API_KEY ?? "";
export const hasEmissionsKey = () => key().length > 0;
const month = () => new Date().toISOString().slice(0, 7);

async function readStore(): Promise<Stored> {
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  return ((row?.data as Stored) ?? {});
}
async function writeStore(s: Stored) {
  await db.setting.upsert({ where: { section: SECTION }, update: { data: s as object }, create: { section: SECTION, data: s as object } });
}

/** Μία κλήση στο API: ένταση δικτύου της χώρας. Μετρά στον μηνιαίο προϋπολογισμό. */
async function fetchFactor(country: string): Promise<GridFactor | null> {
  const r = await fetch(`https://api.emissions.dev/v1/electricity/emissions?kwh=1000&country=${encodeURIComponent(country)}`, {
    headers: { Authorization: `Bearer ${key()}`, accept: "application/json" }, signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: { attributes?: { emissions?: { co2e?: number; source_trail?: { data_category?: string; source?: string; year?: string }[] }; grid?: { carbon_intensity?: number } } }; meta?: { emission_factors_year?: number } };
  const g = j.data?.attributes?.grid?.carbon_intensity;
  const co2e = j.data?.attributes?.emissions?.co2e;
  if (typeof g !== "number" || !Number.isFinite(g)) return null;
  const trail = j.data?.attributes?.emissions?.source_trail?.find((t) => t.data_category === "grid_intensity");
  return { country, gPerKwh: g, gPerKwhWtt: typeof co2e === "number" ? Math.round(co2e * 10) / 10 : g, source: trail?.source ?? "emissions.dev", year: Number(trail?.year) || j.meta?.emission_factors_year || new Date().getFullYear(), fetchedAt: new Date().toISOString(), live: true };
}

/**
 * Ο συντελεστής για τη χώρα, από cache 30 ημερών. Ανανεώνεται μόνο αν έχει
 * λήξει, υπάρχει κλειδί και δεν έχει εξαντληθεί ο μηνιαίος προϋπολογισμός.
 */
export async function getGridFactor(country = "GR"): Promise<GridFactor> {
  const store = await readStore();
  const cached = store.factors?.[country];
  const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS;
  if (fresh) return cached;
  const used = store.calls?.[month()] ?? 0;
  if (hasEmissionsKey() && used < MONTHLY_BUDGET) {
    try {
      const f = await fetchFactor(country);
      const next: Stored = { factors: { ...(store.factors ?? {}), ...(f ? { [country]: f } : {}) }, calls: { [month()]: used + 1 } };
      await writeStore(next);
      if (f) return f;
    } catch { /* πέφτουμε στην εφεδρική */ }
  }
  return cached ?? { ...FALLBACK, country };
}

/** kg CO₂e για kWh — τοπικός υπολογισμός, καμία κλήση. */
export const co2Kg = (kwh: number, f: GridFactor, opts: { wtt?: boolean } = {}) => Math.round((kwh * (opts.wtt ? f.gPerKwhWtt : f.gPerKwh)) / 100) / 10;

/** Ισοδύναμα σε καθημερινή γλώσσα (μέσο ΙΧ βενζίνης ≈ 120 g CO₂/km· ένα ώριμο δέντρο ≈ 22 kg CO₂/έτος). */
export const co2Equivalents = (kg: number) => ({ carKm: Math.round(kg / 0.12), trees: Math.round((kg / 22) * 10) / 10 });

/** Πόσες κλήσεις έγιναν αυτόν τον μήνα (για τη διαχείριση). */
export async function emissionsUsage() {
  const s = await readStore();
  return { month: month(), calls: s.calls?.[month()] ?? 0, budget: MONTHLY_BUDGET, factors: s.factors ?? {} };
}
