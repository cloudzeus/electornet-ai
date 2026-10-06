import "server-only";
import { db } from "@/lib/db";
import { geocodeAddress, distanceKm, type GeoResult } from "@/lib/stores/geocode";

/**
 * Κοντινότερα καταστήματα για τη διεύθυνση / περιοχή / Τ.Κ. που δίνει ο πελάτης στον Ερμή: geocoding (Nominatim) και
 * απόσταση σε ευθεία από τις συντεταγμένες των καταστημάτων. Ο Nominatim θέλει ≤ 1 αίτημα/δευτερόλεπτο και cache:
 * τα αιτήματα μπαίνουν σε σειρά και κάθε αποτέλεσμα κρατιέται μία μέρα. Χωρίς geocoding: ταίριασμα πόλης / Τ.Κ. στα καταστήματα.
 */
export interface NearStore { name: string; address: string; city: string; zip: string; phone: string | null; km: number; today: string; openNow: boolean; services: string[]; slug: string; lat: number; lng: number }
export interface NearResult { searched: string; found: boolean; located: string | null; /** το σημείο της διεύθυνσης του πελάτη (ή της περιοχής του) */ origin: { lat: number; lng: number } | null; stores: NearStore[] }

const DAY = 864e5;
const geoCache = new Map<string, { at: number; r: GeoResult | null }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** Ένα αίτημα τη φορά, με 1,1 s απόσταση από το προηγούμενο. */
function geocodeQueued(q: string): Promise<GeoResult | null> {
  const key = q.toLowerCase().replace(/\s+/g, " ").trim();
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.at < DAY) return Promise.resolve(hit.r);
  const run = queue.then(async () => {
    const wait = lastCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const r = await geocodeAddress(q, { timeoutMs: 6000, preferPlace: true }).catch(() => null);
    if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value!);
    geoCache.set(key, { at: Date.now(), r });
    return r;
  });
  queue = run.catch(() => null);
  return run;
}

const SERVICES: Record<string, string> = { "click-collect": "παραλαβή παραγγελιών e-shop", installation: "εγκατάσταση", "service-point": "σημείο service" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ");

/** Σημερινή μέρα και ώρα στην Ελλάδα (ο server μπορεί να τρέχει σε UTC). */
function athensNow() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), hm: `${get("hour")}:${get("minute")}` };
}

export async function nearestStores(place: string, take = 3): Promise<NearResult> {
  const searched = place.trim().slice(0, 160);
  const zip = searched.match(/\b(\d{3})\s?(\d{2})\b/);
  // πρώτα ολόκληρη η διεύθυνση, μετά ο Τ.Κ., μετά η περιοχή (το τελευταίο κομμάτι μετά το κόμμα)
  const tries = [...new Set([`${searched}, Ελλάδα`, ...(zip ? [`${zip[1]} ${zip[2]}, Ελλάδα`] : []), ...(searched.includes(",") ? [`${searched.split(",").slice(-1)[0].trim()}, Ελλάδα`] : []),
    // «Ηράκλειο Κρήτης» → «Ηράκλειο»: η τελευταία λέξη είναι συχνά ο νομός στη γενική
    ...(!searched.includes(",") && /\s/.test(searched) ? [`${searched.split(/\s+/).slice(0, -1).join(" ")}, Ελλάδα`] : [])])].slice(0, 3);
  let geo: GeoResult | null = null;
  for (const q of tries) { geo = await geocodeQueued(q); if (geo) break; }

  const rows = await db.store.findMany({ where: { active: true, NOT: { lat: 0, lng: 0 } }, select: { name: true, address: true, city: true, zip: true, region: true, phone: true, mobile: true, lat: true, lng: true, hours: true, services: true, slug: true } });
  let origin = geo ? { lat: geo.lat, lng: geo.lng } : null;
  if (!origin) {
    // χωρίς geocoding: Τ.Κ. ή όνομα πόλης που ταιριάζει σε κατάστημα
    const n = norm(searched);
    const m = rows.find((s) => zip && s.zip.replace(/\s/g, "") === zip[1] + zip[2]) ?? rows.find((s) => s.city.length > 3 && n.includes(norm(s.city)));
    if (m) origin = { lat: m.lat, lng: m.lng };
  }
  if (!origin) return { searched, found: false, located: null, origin: null, stores: [] };

  const now = athensNow();
  const stores = rows
    .map((s) => ({ s, km: distanceKm(origin!, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, take)
    .map(({ s, km }) => {
      const h = (Array.isArray(s.hours) ? (s.hours as { day: number; open: string; close: string }[]) : []).find((x) => x.day === now.day);
      const open = !!h && h.open !== "—" && h.close !== "—";
      return {
        name: s.name, address: s.address, city: s.city, zip: s.zip, phone: s.phone ?? s.mobile ?? null, km: Math.round(km * 10) / 10,
        today: open ? `σήμερα ${h!.open}–${h!.close}` : "σήμερα κλειστό", openNow: open && now.hm >= h!.open && now.hm < h!.close,
        services: (Array.isArray(s.services) ? (s.services as string[]) : []).map((x) => SERVICES[x] ?? x), slug: s.slug, lat: s.lat, lng: s.lng,
      };
    });
  return { searched, found: true, located: geo?.label.split(",").slice(0, 3).join(",").trim() ?? null, origin, stores };
}
