import "server-only";
import { getSetting } from "@/lib/settings/store";

/**
 * Προτάσεις διεύθυνσης όσο γράφει ο πελάτης.
 *
 * Το Nominatim απαγορεύει ρητά τη χρήση για autocomplete, οπότε εδώ δεν το
 * χρησιμοποιούμε. Με Google Maps key (Ρυθμίσεις → AI & διασυνδέσεις) πάμε
 * στο Places Autocomplete (New)· χωρίς κλειδί στο Photon της komoot, που
 * είναι φτιαγμένο για autocomplete πάνω σε δεδομένα OpenStreetMap, χωρίς
 * κλειδί. Και στα δύο περιορίζουμε στην Ελλάδα. Μικρή cache 10 λεπτών ώστε
 * το ίδιο πληκτρολόγημα να μην ξαναρωτά.
 */
export interface AddressSuggestion { id: string; label: string; secondary?: string; lat?: number; lng?: number; city?: string; zip?: string; street?: string }

const cache = new Map<string, { at: number; items: AddressSuggestion[] }>();
const TTL = 10 * 60000;
const GR_BBOX = "19.3,34.7,29.7,41.8"; // δυτικά,νότια,ανατολικά,βόρεια

async function viaPhoton(q: string): Promise<AddressSuggestion[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&bbox=${GR_BBOX}&lat=38.0&lon=23.7`;
  const r = await fetch(url, { headers: { "User-Agent": "euronics-redesign/1.0 (address autocomplete; admin@euronics.gr)" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const j = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: { osm_id: number; name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; district?: string; county?: string; state?: string; country?: string; type?: string } }[] };
  const seen = new Set<string>();
  const out: AddressSuggestion[] = [];
  for (const f of j.features ?? []) {
    const p = f.properties;
    const street = p.street ?? (p.type === "street" ? p.name : undefined);
    const main = [street ?? p.name, p.housenumber].filter(Boolean).join(" ");
    const city = p.city ?? p.district ?? p.county ?? p.state;
    const label = [main, city !== main ? city : null].filter(Boolean).join(", ");
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ id: `osm-${p.osm_id}`, label, secondary: [p.postcode, p.county && p.county !== city ? p.county : null].filter(Boolean).join(" · ") || undefined, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], city, zip: p.postcode, street });
  }
  return out;
}

async function viaGoogle(q: string, key: string): Promise<AddressSuggestion[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({ input: q, languageCode: "el", regionCode: "GR", includedRegionCodes: ["gr"] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[] };
  return (j.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [{ id: `g-${p.placeId}`, label: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text }];
  });
}

export async function suggestAddresses(q: string): Promise<AddressSuggestion[]> {
  const k = q.trim().toLowerCase();
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  const { secrets } = await getSetting("ai").catch(() => ({ secrets: {} as Record<string, string> }));
  const items = await (secrets.mapsApiKey ? viaGoogle(q, secrets.mapsApiKey) : viaPhoton(q)).catch(() => [] as AddressSuggestion[]);
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  cache.set(k, { at: Date.now(), items });
  return items;
}
