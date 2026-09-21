import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

/**
 * Store import from the live euronics.gr store locator (nopCommerce /
 * SevenSpikes). The page embeds `data-markersdata` with every shop: id,
 * name, lat/lng and a short HTML description with type, street,
 * «CITY, ZIP, PREFECTURE» and «T: phone, Φ: fax, M: mobile, email».
 * Used by prisma/seed-stores.ts and by the admin «Συγχρονισμός» button.
 */
export const SOURCE_URL = "https://www.euronics.gr/%CE%BA%CE%B1%CF%84%CE%B1%CF%83%CF%84%CE%B7%CE%BC%CE%B1%CF%84%CE%B1-euronics";

export interface ImportedStore {
  siteId: number;
  name: string;
  kind: string | null;
  address: string;
  city: string;
  zip: string;
  region: string;
  regionRaw: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
  slug: string;
}

/** prefectures as published (genitive, caps) → nominative with accents */
const REGIONS: Record<string, string> = {
  ΑΤΤΙΚΗΣ: "Αττική", ΑΤΤΙΚΗ: "Αττική", ΘΕΣΣΑΛΟΝΙΚΗΣ: "Θεσσαλονίκη", ΑΧΑΪΑΣ: "Αχαΐα", ΑΧΑΙΑΣ: "Αχαΐα", ΗΡΑΚΛΕΙΟΥ: "Ηράκλειο", ΛΑΡΙΣΑΣ: "Λάρισα", ΛΑΡΙΣΗΣ: "Λάρισα", ΜΑΓΝΗΣΙΑΣ: "Μαγνησία", ΙΩΑΝΝΙΝΩΝ: "Ιωάννινα", ΧΑΝΙΩΝ: "Χανιά", ΡΕΘΥΜΝΗΣ: "Ρέθυμνο", ΡΕΘΥΜΝΟΥ: "Ρέθυμνο", ΛΑΣΙΘΙΟΥ: "Λασίθι", ΔΩΔΕΚΑΝΗΣΟΥ: "Δωδεκάνησα", ΚΥΚΛΑΔΩΝ: "Κυκλάδες", ΛΕΣΒΟΥ: "Λέσβος", ΧΙΟΥ: "Χίος", ΣΑΜΟΥ: "Σάμος", ΚΕΡΚΥΡΑΣ: "Κέρκυρα", ΚΕΦΑΛΛΗΝΙΑΣ: "Κεφαλονιά", ΚΕΦΑΛΟΝΙΑΣ: "Κεφαλονιά", ΖΑΚΥΝΘΟΥ: "Ζάκυνθος", ΛΕΥΚΑΔΑΣ: "Λευκάδα", ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ: "Αιτωλοακαρνανία", ΗΛΕΙΑΣ: "Ηλεία", ΜΕΣΣΗΝΙΑΣ: "Μεσσηνία", ΛΑΚΩΝΙΑΣ: "Λακωνία", ΑΡΚΑΔΙΑΣ: "Αρκαδία", ΑΡΓΟΛΙΔΑΣ: "Αργολίδα", ΑΡΓΟΛΙΔΟΣ: "Αργολίδα", ΚΟΡΙΝΘΙΑΣ: "Κορινθία", ΒΟΙΩΤΙΑΣ: "Βοιωτία", ΕΥΒΟΙΑΣ: "Εύβοια", ΦΘΙΩΤΙΔΑΣ: "Φθιώτιδα", ΦΘΙΩΤΙΔΟΣ: "Φθιώτιδα", ΦΩΚΙΔΑΣ: "Φωκίδα", ΦΩΚΙΔΟΣ: "Φωκίδα", ΕΥΡΥΤΑΝΙΑΣ: "Ευρυτανία", ΤΡΙΚΑΛΩΝ: "Τρίκαλα", ΚΑΡΔΙΤΣΑΣ: "Καρδίτσα", ΠΙΕΡΙΑΣ: "Πιερία", ΗΜΑΘΙΑΣ: "Ημαθία", ΠΕΛΛΑΣ: "Πέλλα", ΠΕΛΛΗΣ: "Πέλλα", ΚΙΛΚΙΣ: "Κιλκίς", ΣΕΡΡΩΝ: "Σέρρες", ΔΡΑΜΑΣ: "Δράμα", ΚΑΒΑΛΑΣ: "Καβάλα", ΞΑΝΘΗΣ: "Ξάνθη", ΞΑΝΘΗ: "Ξάνθη", ΡΟΔΟΠΗΣ: "Ροδόπη", ΕΒΡΟΥ: "Έβρος", ΧΑΛΚΙΔΙΚΗΣ: "Χαλκιδική", ΚΟΖΑΝΗΣ: "Κοζάνη", ΓΡΕΒΕΝΩΝ: "Γρεβενά", ΚΑΣΤΟΡΙΑΣ: "Καστοριά", ΦΛΩΡΙΝΑΣ: "Φλώρινα", ΦΛΩΡΙΝΗΣ: "Φλώρινα", ΑΡΤΑΣ: "Άρτα", ΑΡΤΗΣ: "Άρτα", ΠΡΕΒΕΖΑΣ: "Πρέβεζα", ΘΕΣΠΡΩΤΙΑΣ: "Θεσπρωτία",
};
/** frequent cities, caps → accented */
const CITIES: Record<string, string> = {
  ΑΘΗΝΑ: "Αθήνα", ΘΕΣΣΑΛΟΝΙΚΗ: "Θεσσαλονίκη", ΠΑΤΡΑ: "Πάτρα", ΗΡΑΚΛΕΙΟ: "Ηράκλειο", ΛΑΡΙΣΑ: "Λάρισα", ΒΟΛΟΣ: "Βόλος", ΙΩΑΝΝΙΝΑ: "Ιωάννινα", ΧΑΝΙΑ: "Χανιά", ΡΕΘΥΜΝΟ: "Ρέθυμνο", ΠΕΙΡΑΙΑΣ: "Πειραιάς", ΡΟΔΟΣ: "Ρόδος", ΚΕΡΚΥΡΑ: "Κέρκυρα", ΚΑΒΑΛΑ: "Καβάλα", ΣΕΡΡΕΣ: "Σέρρες", ΞΑΝΘΗ: "Ξάνθη", ΚΟΜΟΤΗΝΗ: "Κομοτηνή", ΑΛΕΞΑΝΔΡΟΥΠΟΛΗ: "Αλεξανδρούπολη", ΔΡΑΜΑ: "Δράμα", ΚΑΤΕΡΙΝΗ: "Κατερίνη", ΒΕΡΟΙΑ: "Βέροια", ΚΟΖΑΝΗ: "Κοζάνη", ΚΑΣΤΟΡΙΑ: "Καστοριά", ΦΛΩΡΙΝΑ: "Φλώρινα", ΓΡΕΒΕΝΑ: "Γρεβενά", ΤΡΙΚΑΛΑ: "Τρίκαλα", ΚΑΡΔΙΤΣΑ: "Καρδίτσα", ΛΑΜΙΑ: "Λαμία", ΧΑΛΚΙΔΑ: "Χαλκίδα", ΘΗΒΑ: "Θήβα", ΛΙΒΑΔΕΙΑ: "Λιβαδειά", ΑΓΡΙΝΙΟ: "Αγρίνιο", ΜΕΣΟΛΟΓΓΙ: "Μεσολόγγι", ΑΡΤΑ: "Άρτα", ΠΡΕΒΕΖΑ: "Πρέβεζα", ΗΓΟΥΜΕΝΙΤΣΑ: "Ηγουμενίτσα", ΚΑΛΑΜΑΤΑ: "Καλαμάτα", ΣΠΑΡΤΗ: "Σπάρτη", ΤΡΙΠΟΛΗ: "Τρίπολη", ΝΑΥΠΛΙΟ: "Ναύπλιο", ΑΡΓΟΣ: "Άργος", ΚΟΡΙΝΘΟΣ: "Κόρινθος", ΠΥΡΓΟΣ: "Πύργος", ΑΜΑΛΙΑΔΑ: "Αμαλιάδα", ΑΙΓΙΟ: "Αίγιο", ΜΥΤΙΛΗΝΗ: "Μυτιλήνη", ΧΙΟΣ: "Χίος", ΣΑΜΟΣ: "Σάμος", ΣΥΡΟΣ: "Σύρος", ΕΡΜΟΥΠΟΛΗ: "Ερμούπολη", ΝΑΞΟΣ: "Νάξος", ΠΑΡΟΣ: "Πάρος", ΜΥΚΟΝΟΣ: "Μύκονος", ΣΑΝΤΟΡΙΝΗ: "Σαντορίνη", ΚΩΣ: "Κως", ΚΑΛΥΜΝΟΣ: "Κάλυμνος", ΖΑΚΥΝΘΟΣ: "Ζάκυνθος", ΛΕΥΚΑΔΑ: "Λευκάδα", ΑΡΓΟΣΤΟΛΙ: "Αργοστόλι", ΙΘΑΚΗ: "Ιθάκη", ΣΚΙΑΘΟΣ: "Σκιάθος", ΦΑΡΣΑΛΑ: "Φάρσαλα", ΛΑΓΚΑΔΑΣ: "Λαγκαδάς", ΠΟΛΥΓΥΡΟΣ: "Πολύγυρος", ΕΔΕΣΣΑ: "Έδεσσα", ΓΙΑΝΝΙΤΣΑ: "Γιαννιτσά", ΚΙΛΚΙΣ: "Κιλκίς", ΝΑΟΥΣΑ: "Νάουσα", ΟΡΕΣΤΙΑΔΑ: "Ορεστιάδα", ΔΙΔΥΜΟΤΕΙΧΟ: "Διδυμότειχο", ΠΤΟΛΕΜΑΪΔΑ: "Πτολεμαΐδα", ΑΓΙΟΣ_ΝΙΚΟΛΑΟΣ: "Άγιος Νικόλαος", ΙΕΡΑΠΕΤΡΑ: "Ιεράπετρα", ΣΗΤΕΙΑ: "Σητεία", ΜΕΤΣΟΒΟ: "Μέτσοβο", ΠΕΡΙΣΤΕΡΙ: "Περιστέρι", ΑΙΓΑΛΕΩ: "Αιγάλεω", ΓΛΥΦΑΔΑ: "Γλυφάδα", ΜΑΡΟΥΣΙ: "Μαρούσι", ΚΗΦΙΣΙΑ: "Κηφισιά", ΧΑΛΑΝΔΡΙ: "Χαλάνδρι", ΝΕΑ_ΣΜΥΡΝΗ: "Νέα Σμύρνη", ΚΑΛΛΙΘΕΑ: "Καλλιθέα", ΠΑΛΛΗΝΗ: "Παλλήνη", ΑΧΑΡΝΕΣ: "Αχαρνές", ΕΛΕΥΣΙΝΑ: "Ελευσίνα", ΜΕΓΑΡΑ: "Μέγαρα", ΛΑΥΡΙΟ: "Λαύριο", ΡΑΦΗΝΑ: "Ραφήνα", ΚΟΡΩΠΙ: "Κορωπί", ΔΡΑΠΕΤΣΩΝΑ: "Δραπετσώνα", ΑΓΙΟΣ_ΔΗΜΗΤΡΙΟΣ: "Άγιος Δημήτριος",
};

/** Greek postal code (first two digits) → prefecture; the most reliable region signal in the published data */
const ZIP_REGION: Record<string, string> = { "10": "Αττική", "11": "Αττική", "12": "Αττική", "13": "Αττική", "14": "Αττική", "15": "Αττική", "16": "Αττική", "17": "Αττική", "18": "Αττική", "19": "Αττική", "20": "Κορινθία", "21": "Αργολίδα", "22": "Αρκαδία", "23": "Λακωνία", "24": "Μεσσηνία", "25": "Αχαΐα", "26": "Αχαΐα", "27": "Ηλεία", "28": "Κεφαλονιά", "29": "Ζάκυνθος", "30": "Αιτωλοακαρνανία", "31": "Λευκάδα", "32": "Βοιωτία", "33": "Φωκίδα", "34": "Εύβοια", "35": "Φθιώτιδα", "36": "Ευρυτανία", "37": "Μαγνησία", "38": "Μαγνησία", "40": "Λάρισα", "41": "Λάρισα", "42": "Τρίκαλα", "43": "Καρδίτσα", "44": "Ιωάννινα", "45": "Ιωάννινα", "46": "Θεσπρωτία", "47": "Άρτα", "48": "Πρέβεζα", "49": "Κέρκυρα", "50": "Κοζάνη", "51": "Γρεβενά", "52": "Καστοριά", "53": "Φλώρινα", "54": "Θεσσαλονίκη", "55": "Θεσσαλονίκη", "56": "Θεσσαλονίκη", "57": "Θεσσαλονίκη", "58": "Πέλλα", "59": "Ημαθία", "60": "Πιερία", "61": "Κιλκίς", "62": "Σέρρες", "63": "Χαλκιδική", "64": "Καβάλα", "65": "Καβάλα", "66": "Δράμα", "67": "Ξάνθη", "68": "Έβρος", "69": "Ροδόπη", "70": "Ηράκλειο", "71": "Ηράκλειο", "72": "Λασίθι", "73": "Χανιά", "74": "Ρέθυμνο", "81": "Λέσβος", "82": "Χίος", "83": "Σάμος", "84": "Κυκλάδες", "85": "Δωδεκάνησα" };
export const regionFromZip = (zip: string) => ZIP_REGION[zip.replace(/\s/g, "").slice(0, 2)] ?? null;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-.(/])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
export const niceCity = (raw: string) => { const k = raw.trim().toUpperCase().replace(/\s+/g, "_"); return CITIES[k] ?? titleCase(raw.trim()); };
export const niceRegion = (raw: string) => { const k = raw.trim().toUpperCase(); return REGIONS[k] ?? titleCase(raw.trim()); };
export { slugify };

const decode = (s: string) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

function parseDescription(html: string) {
  const text = decode(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "");
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ").trim().replace(/^,|,$/g, "").trim()).filter(Boolean);
  const contactIdx = lines.findIndex((l) => /(^|[\s,])[TΤ]\s*[:.]|@/.test(l));
  const contact = contactIdx >= 0 ? lines[contactIdx] : "";
  const email = contact.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? null;
  const phone = contact.match(/[TΤ]\s*[:.]?\s*(\+?[\d ]{7,})/)?.[1]?.replace(/\s+/g, "") ?? null;
  const fax = contact.match(/Φ\s*[:.]?\s*(\+?[\d ]{7,})/)?.[1]?.replace(/\s+/g, "") ?? null;
  const mobile = contact.match(/[MΜ]\s*[:.]?\s*(\+?[\d ]{7,})/)?.[1]?.replace(/\s+/g, "") ?? null;
  const zipIdx = lines.findIndex((l, i) => i !== contactIdx && /\b\d{3}\s?\d{2}\b/.test(l));
  const zipLine = zipIdx >= 0 ? lines[zipIdx] : "";
  const zip = zipLine.match(/\b(\d{3})\s?(\d{2})\b/);
  const parts = zipLine.split(",").map((p) => p.trim()).filter(Boolean);
  const zipPos = parts.findIndex((p) => /\d{3}\s?\d{2}/.test(p));
  let cityRaw = parts[zipPos - 1] ?? parts[0] ?? "";
  let regionRaw: string | null = parts[zipPos + 1] ?? null;
  let address = lines.slice(0, zipIdx).filter((_, i) => i !== 0 || !/ΚΑΤΑΣΤΗΜΑ|Κατάστημα/i.test(lines[0])).join(", ");
  if (zipPos > 1) { address = [address, parts.slice(0, zipPos - 1).join(", ")].filter(Boolean).join(", "); }
  if (!address && zipPos === 1 && parts.length >= 3) { address = parts[0]; cityRaw = parts[2]; regionRaw = null; }
  const kind = /ΚΑΤΑΣΤΗΜΑ|Κατάστημα/i.test(lines[0] ?? "") ? lines[0] : null;
  const zip5 = zip ? `${zip[1]}${zip[2]}` : "";
  const cleanCity = cityRaw.replace(/\d{3}\s?\d{2}/g, "").replace(/[-–]\s*$/, "").trim();
  const region = regionFromZip(zip5) ?? (regionRaw ? niceRegion(regionRaw) : niceCity(cleanCity));
  return { kind, address: titleCase(address) || "—", city: niceCity(cleanCity), zip: zip5, region, regionRaw, phone, mobile, fax, email };
}

export function parseMarkers(html: string): ImportedStore[] {
  const m = html.match(/data-markersdata="([^"]*)"/);
  if (!m) throw new Error("markersdata not found — page layout changed?");
  const list = JSON.parse(decode(m[1])) as { Id: number; Name: string; Latitude: string | null; Longitude: string | null; ShortDescription: string }[];
  const seen = new Set<string>();
  return list.map((o) => {
    const d = parseDescription(o.ShortDescription ?? "");
    const name = decode(o.Name).trim();
    let slug = slugify(`${d.city} ${name}`) || `store-${o.Id}`;
    if (seen.has(slug)) slug = `${slug}-${o.Id}`;
    seen.add(slug);
    return { siteId: o.Id, name, ...d, lat: o.Latitude ? Number(o.Latitude) : null, lng: o.Longitude ? Number(o.Longitude) : null, slug };
  });
}

export async function fetchLiveStores(): Promise<ImportedStore[]> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "Mozilla/5.0 (euronics-redesign importer)" }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`euronics.gr ${res.status}`);
  return parseMarkers(await res.text());
}

const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "21:00" })).concat([{ day: 6, open: "09:00", close: "18:00" }]);

/** Upsert by siteId. Never overwrites manual coordinates / hours / services / photo; fills coordinates when missing. */
export async function upsertStores(list: ImportedStore[], opts: { overwriteContact?: boolean } = {}) {
  let created = 0, updated = 0, noCoords = 0;
  for (const s of list) {
    if (s.lat == null || s.lng == null) noCoords++;
    const existing = await db.store.findUnique({ where: { siteId: s.siteId } });
    const contact = { name: s.name, member: s.name, kind: s.kind, address: s.address, city: s.city, zip: s.zip, region: s.region, regionRaw: s.regionRaw, phone: s.phone, mobile: s.mobile, fax: s.fax, email: s.email };
    if (existing) {
      const coords = existing.geocoded === "manual" || s.lat == null ? {} : { lat: s.lat, lng: s.lng!, geocoded: "site" };
      await db.store.update({ where: { id: existing.id }, data: { ...(opts.overwriteContact ? contact : {}), ...coords } });
      updated++;
    } else {
      const slugTaken = await db.store.findUnique({ where: { slug: s.slug } });
      await db.store.create({ data: { siteId: s.siteId, slug: slugTaken ? `${s.slug}-${s.siteId}` : s.slug, ...contact, lat: s.lat ?? 0, lng: s.lng ?? 0, geocoded: s.lat != null ? "site" : null, hours: DEFAULT_HOURS, services: ["click-collect"], active: s.lat != null } });
      created++;
    }
  }
  return { created, updated, noCoords, total: list.length };
}
