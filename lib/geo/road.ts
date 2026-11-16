import { distanceKm } from "./distance";

/**
 * Οδική απόσταση (πραγματική διαδρομή με αυτοκίνητο, όχι ευθεία) από ένα σημείο προς πολλά, με ΕΝΑ αίτημα στο OSRM
 * (υπηρεσία «table»). Προεπιλογή ο δημόσιος server του OSRM· `OSRM_URL` για δικό μας.
 * shortcut: ο δημόσιος server είναι χωρίς εγγύηση διαθεσιμότητας/ορίων — για πολλή κίνηση θέλει δικό OSRM ή Google Routes.
 */
export type Point = { lat: number; lng: number };
const BASE = () => (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");

/** km ανά προορισμό (1 δεκαδικό)· null όπου δεν υπάρχει διαδρομή. Ολόκληρο null = η υπηρεσία δεν απάντησε. */
export async function roadKm(from: Point, to: Point[], f: typeof fetch = fetch): Promise<(number | null)[] | null> {
  if (!to.length) return [];
  const pts = [from, ...to].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  try {
    const r = await f(`${BASE()}/table/v1/driving/${pts}?sources=0&annotations=distance`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { code?: string; distances?: (number | null)[][] };
    if (j.code !== "Ok" || !j.distances?.[0]) return null;
    return j.distances[0].slice(1).map((m) => (m == null ? null : Math.round(m / 100) / 10));
  } catch { return null; }
}

/**
 * Τα κοντινά σημεία ταξινομημένα με οδική απόσταση. Πρώτα κόβουμε με ευθεία (η οδική είναι πάντα ≥ της ευθείας), ώστε το
 * OSRM να ρωτηθεί μόνο για τα λίγα κοντινά. null = το OSRM δεν απάντησε: η απόσταση είναι άγνωστη (ΟΧΙ ευθεία).
 */
export async function rankByRoad<T extends Point>(from: Point, list: T[], opts: { withinKm?: number; take?: number; fetch?: typeof fetch } = {}): Promise<{ item: T; km: number }[] | null> {
  const near = list.map((item) => ({ item, air: distanceKm(from, item) })).filter((x) => x.air <= (opts.withinKm ?? 60)).sort((a, b) => a.air - b.air).slice(0, opts.take ?? 8);
  if (!near.length) return [];
  const km = await roadKm(from, near.map((x) => x.item), opts.fetch);
  if (!km) return null;
  return near.map((x, i) => ({ item: x.item, km: km[i] })).filter((x): x is { item: T; km: number } => x.km != null).sort((a, b) => a.km - b.km);
}
