/**
 * Σκετς Ερμή — προετοιμασία (την προηγούμενη μέρα και ξανά πριν μπει ο κόσμος):
 *   1. διαλέγει από τη βάση πραγματικά προϊόντα (ενεργά, δημοσιευμένα — χωρίς φίλτρο αποθέματος) και τις απορρίψεις της σκηνής
 *   2. βρίσκει τα κοντινότερα καταστήματα στο «νέο σπίτι» (lib/skets/config.ts)
 *   3. ηχογραφεί όλες τις φράσεις του Ερμή με τη φωνή του (lib/voice/tts.ts, cache + Bunny)
 * και γράφει το lib/skets/snapshot.json. Η σκηνή δεν κάνει κανένα ερώτημα στη βάση.
 *   npx tsx --conditions=react-server scripts/skets/prep.ts [--no-voice]
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "../../lib/db";
import { speak } from "../../lib/voice/tts";
import { getSetting } from "../../lib/settings/store";
import { SKETS } from "../../lib/skets/config";
import { allPhrases } from "../../lib/skets/script";
import type { CatKey, Room, SkCategory, SkProduct, SkReject, SkStore, Snapshot } from "../../lib/skets/types";

interface Row { id: string; title: string; model: string | null; slug: string; price: number; brand: string; image: string; photos: number; energy: string | null; text: string; facets: Record<string, { value: string; num: number | null }> }

async function pool(catSlug: string): Promise<Row[]> {
  const rows = await db.product.findMany({
    where: { category: { slug: catSlug }, active: true, publishReady: true, soldAlone: true, price: { gt: 0 }, source: { in: ["softone", "import", "softone-set"] }, NOT: { title: { contains: "ΔΩΡΟ", mode: "insensitive" } }, media: { some: { kind: "image", hidden: false } } },
    select: { id: true, title: true, summary: true, slug: true, price: true, modelCode: true, brand: { select: { name: true } }, energy: { select: { class: true } }, _count: { select: { media: { where: { kind: "image", hidden: false } } } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } }, facetValues: { select: { value: true, num: true, facet: { select: { param: true } } } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, price: r.price!, brand: r.brand.name, model: r.modelCode ?? r.title.match(/\b(?=[A-Z0-9./-]*\d)(?=[A-Z0-9./-]*[A-Z])[A-Z0-9][A-Z0-9./-]{5,}\b/)?.[0] ?? null, image: r.media[0]!.url, photos: r._count.media, energy: r.energy?.class ?? null, text: `${r.title} ${r.summary ?? ""}`, facets: Object.fromEntries(r.facetValues.map((f) => [f.facet.param, { value: f.value, num: f.num }])) }));
}

/** Ενεργειακή κλάση → βαθμός (μικρότερο = καλύτερο): A+++ < A++ < A < B … */
const energyRank = (v?: string) => { const m = v?.match(/^([A-G])(\+*)/); return m ? (m[1].charCodeAt(0) - 65) * 10 - m[2].length : 99; };
const energyOf = (r: Row) => r.energy ?? r.facets.energy?.value ?? r.facets["energeiaki-klasi-psyxis"]?.value;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const median = <T,>(xs: T[], by: (x: T) => number) => [...xs].sort((a, b) => by(a) - by(b))[Math.floor(xs.length / 2)];

/** Μάρκες κορυφαίας ποιότητας (2) και καλές μεγάλες μάρκες (1) — το σκετς δείχνει μόνο προϊόντα που τιμούν τη βιτρίνα. */
const PREMIUM = /^(MIELE|BOSCH|SIEMENS|NEFF|AEG|LIEBHERR|SONY|DAIKIN|MITSUBISHI|FUJITSU|TOSHIBA|PANASONIC)/i;
const GOOD = /^(SAMSUNG|LG|ELECTROLUX|PHILIPS|GORENJE|WHIRLPOOL|HITACHI|GREE|LOEWE)/i;
const quality = (r: Row) => (PREMIUM.test(r.brand) ? 20 : GOOD.test(r.brand) ? 10 : 0) + Math.max(0, 7 - energyRank(r.energy ?? undefined) / 10) + Math.min(r.photos, 8) * 0.5;

/** Ένα ανά ομάδα: το καλύτερο σε ποιότητα (μάρκα, κλάση, φωτογραφίες), με διαφορετικές μάρκες όπου γίνεται. */
function spread(groups: Row[][]): Row[] {
  const used = new Set<string>(), out: Row[] = [];
  for (const g of groups) {
    if (!g.length) throw new Error("άδεια ομάδα υποψηφίων");
    const fresh = g.filter((r) => !used.has(r.brand));
    const r = [...(fresh.length ? fresh : g)].sort((a, b) => quality(b) - quality(a) || b.photos - a.photos)[0];
    used.add(r.brand); out.push(r);
  }
  return out;
}

const card = (r: Row, key: string): SkProduct => {
  const e = energyOf(r);
  return { id: r.id, title: r.title, brand: r.brand, model: r.model, price: r.price, image: r.image, slug: r.slug, key, chips: [...new Set([key, ...(e ? [`Κλάση ${e}`] : []), eur(r.price)])] };
};
const cat = (key: CatKey, room: Room, label: string, rows: Row[], keyOf: (r: Row) => string, reject: SkReject[], reject2: SkReject[], pick: string, lines: SkCategory["lines"]): SkCategory =>
  ({ key, room, label, candidates: rows.map((r) => card(r, keyOf(r))), reject, reject2, pick, lines });

async function washer(): Promise<SkCategory> {
  const all = (await pool("plyntiria-roychon")).filter((r) => r.facets["choritikotita-plysis-kg"]?.num);
  const kg = (r: Row) => r.facets["choritikotita-plysis-kg"]!.num!;
  const by = (lo: number, hi: number) => all.filter((r) => kg(r) >= lo && kg(r) < hi);
  const small = spread([by(6, 8), by(8, 9)]), big = spread([by(9, 10), by(10, 13)]);
  const [keep, other] = [...big].sort((a, b) => energyRank(energyOf(a)) - energyRank(energyOf(b)) || quality(b) - quality(a));
  const why2 = energyRank(energyOf(keep)) < energyRank(energyOf(other))
    ? { reason: `Κλάση ${energyOf(other)} — καίει περισσότερο`, say: `Από τα δύο, το ${keep.brand} είναι κλάσης ${energyOf(keep)} — θα το νιώσεις στον λογαριασμό. Αυτό σου προτείνω.` }
    : keep.price < other.price
      ? { reason: `${eur(other.price - keep.price)} ακριβότερο, χωρίς λόγο`, say: `Από τα δύο, το ${keep.brand} κάνει την ίδια δουλειά και κοστίζει λιγότερο. Αυτό σου προτείνω.` }
      : { reason: `${kg(other)} kg, αλλά λιγότερο αθόρυβο και αξιόπιστο`, say: `Από τα δύο, το ${keep.brand} είναι το πιο αξιόπιστο — θα σε κρατήσει χρόνια. Αυτό σου προτείνω.` };
  return cat("washer", "bath", "Πλυντήριο ρούχων", [...small, ...big].sort((a, b) => kg(a) - kg(b)), (r) => `${kg(r)} kg`,
    small.map((r) => ({ id: r.id, reason: `${kg(r)} kg — μικρό για διπλό πάπλωμα` })),
    [{ id: other.id, reason: why2.reason }], keep.id,
    { ask: "Πρώτα πρώτα, πλυντήριο. Σου διάλεξα τέσσερα. Πες μου — θα πλένεις και παπλώματα στο σπίτι;", answer: "Ναι, φυσικά!", verdict: "Τότε θέλουμε τουλάχιστον εννιά κιλά. Αυτά φεύγουν.", verdict2: why2.say, pick: "Αυτό είναι. Πάει στο μπάνιο." });
}

async function fridge(): Promise<SkCategory> {
  const all = (await pool("psygeiokatapsyktes")).filter((r) => energyRank(energyOf(r)) < 99);
  const ranked = [...all].sort((a, b) => energyRank(energyOf(a)) - energyRank(energyOf(b)) || a.price - b.price);
  const best = energyRank(energyOf(ranked[0]));
  if (!ranked.some((r) => energyRank(energyOf(r)) > best)) throw new Error(`ψυγεία: όλα κλάσης ${energyOf(ranked[0])}`);
  const [keep] = spread([ranked.filter((r) => energyRank(energyOf(r)) === best)]);
  // οι απορριπτόμενες: κι αυτές καλές μάρκες, απλώς σε χειρότερη κλάση (C και κάτω, να φαίνεται η διαφορά)
  const worse = ranked.filter((r) => energyRank(energyOf(r)) >= Math.max(best + 1, 20) && r.brand !== keep.brand).sort((a, b) => quality(b) - quality(a));
  const w2 = worse.find((r) => r.brand !== worse[0].brand) ?? worse[1];
  const rows = [worse[0], keep, ...(w2 ? [w2] : [])];
  return cat("fridge", "kitchen", "Ψυγειοκαταψύκτης", rows, (r) => `Κλάση ${energyOf(r)}`,
    rows.filter((r) => r !== keep).map((r) => ({ id: r.id, reason: `Κλάση ${energyOf(r)} — καίει περισσότερο` })), [], keep.id,
    { ask: "Πάμε κουζίνα. Ψυγείο — θα δουλεύει μέρα νύχτα, δώδεκα μήνες τον χρόνο. Θέλεις να καίει όσο γίνεται λιγότερο ρεύμα;", answer: "Ναι, σίγουρα.", verdict: "Τότε κρατάμε μόνο την καλύτερη ενεργειακή κλάση.", verdict2: null, pick: "Αυτό. Μπαίνει στην κουζίνα." });
}

async function tv(): Promise<SkCategory> {
  const all = (await pool("tileoraseis")).filter((r) => r.facets["eyros-othonis"]?.num);
  const inch = (r: Row) => r.facets["eyros-othonis"]!.num!;
  const [keep, small, huge] = spread([all.filter((r) => inch(r) === 55), all.filter((r) => inch(r) >= 40 && inch(r) <= 43), all.filter((r) => inch(r) >= 65 && inch(r) <= 75)]);
  const rows = [small, keep, huge];
  return cat("tv", "living", "Τηλεόραση", rows, (r) => `${inch(r)}″`,
    [{ id: rows[0].id, reason: `${inch(rows[0])}″ — μικρή για 2,5 m` }, { id: rows[2].id, reason: `${inch(rows[2])}″ — πολύ μεγάλη για 2,5 m` }], [], keep.id,
    { ask: "Σαλόνι. Τηλεόραση. Πόσο μακριά θα κάθεσαι — γύρω στα δυόμισι μέτρα;", answer: "Ναι, κάπου εκεί.", verdict: "Για δυόμισι μέτρα, οι πενήντα πέντε ίντσες είναι ό,τι πρέπει.", verdict2: null, pick: "Στο σαλόνι." });
}

async function ac(): Promise<SkCategory> {
  const all = (await pool("klimatistika-inverter")).filter((r) => r.facets["onomastiki-apodosi-btu-h"]?.num);
  const btu = (r: Row) => r.facets["onomastiki-apodosi-btu-h"]!.num!;
  const big = all.filter((r) => btu(r) >= 17000 && btu(r) <= 19000);
  const [mid, small, large] = spread([all.filter((r) => btu(r) >= 11500 && btu(r) <= 13000), all.filter((r) => btu(r) <= 9500), big.length ? big : all.filter((r) => btu(r) >= 17000)]);
  const rows = [small, mid, large];
  const fmt = (r: Row) => `${btu(r).toLocaleString("el-GR")} BTU`;
  return cat("ac", "living", "Κλιματιστικό", rows, fmt,
    [{ id: rows[0].id, reason: `${fmt(rows[0])} — λίγα για 25 m²` }, { id: rows[2].id, reason: `${fmt(rows[2])} — υπερβολικό, θα καίει άσκοπα` }], [], rows[1].id,
    { ask: "Και τώρα, το πιο σημαντικό για τη Λάρισα: κλιματιστικό. Τον Ιούλιο εκεί το θερμόμετρο περνάει τους σαράντα. Το σαλόνι είναι γύρω στα είκοσι πέντε τετραγωνικά;", answer: "Ναι, περίπου.", verdict: "Τότε θέλουμε δώδεκα χιλιάδες μονάδες. Ούτε λιγότερο, ούτε περισσότερο.", verdict2: null, pick: "Δροσιά εξασφαλισμένη." });
}

async function cooker(): Promise<SkCategory> {
  const all = await pool("oles-oi-koyzines");
  const isCeramic = (r: Row) => /κεραμ/i.test(r.text);
  const KINDS = [{ re: /επαγω/i, kind: "Επαγωγικές", why: "θέλουν ειδικά σκεύη" }, { re: /αερ[ιί]ου/i, kind: "Αερίου", why: "θέλει σύνδεση αερίου" }, { re: /εμαγ/i, kind: "Εμαγιέ εστίες", why: "θέλουν τρίψιμο" }];
  const kindOf = (r: Row) => KINDS.find((k) => k.re.test(r.text) && !isCeramic(r));
  const kind = (r: Row) => kindOf(r)?.kind ?? "Κεραμικές εστίες";
  // απορρίπτονται μόνο όσες δηλώνουν ρητά άλλο τύπο εστιών
  const other = all.filter((r) => !isCeramic(r) && kindOf(r));
  if (other.length >= 2) {
    const [keep] = spread([all.filter(isCeramic)]);
    const [first] = spread([other]);
    const rest = [first, ...spread([other.filter((r) => r !== first)])];
    const rows = [rest[0], keep, ...rest.slice(1)];
    return cat("cooker", "kitchen", "Κουζίνα", rows, kind,
      rest.map((r) => ({ id: r.id, reason: `${kind(r)} — ${kindOf(r)!.why}` })), [], keep.id,
      { ask: "Τελευταία, κουζίνα. Κεραμικές εστίες — μαγειρεύεις με τα σκεύη που ήδη έχεις και καθαρίζονται με ένα πανί. Σε βολεύει;", answer: "Ναι, κεραμική.", verdict: "Ωραία — κρατάμε μόνο κεραμική.", verdict2: null, pick: "Και η κουζίνα, έτοιμη." });
  }
  // όλες κεραμικές: η ερώτηση γίνεται προϋπολογισμός
  const LIMIT = 600;
  const [keep] = spread([all.filter((r) => r.price < LIMIT)]);
  const over = all.filter((r) => r.price >= LIMIT);
  const rest = spread([over, over.filter((r) => r.brand !== keep.brand && r.price > median(over, (x) => x.price).price)].map((g) => (g.length ? g : over))).filter((r, i, a) => a.indexOf(r) === i);
  const rows = [rest[0], keep, ...rest.slice(1)];
  return cat("cooker", "kitchen", "Κουζίνα κεραμική", rows, (r) => eur(r.price),
    rest.map((r) => ({ id: r.id, reason: `${eur(r.price)} — πάνω από τον προϋπολογισμό` })), [], keep.id,
    { ask: "Τελευταία, κουζίνα. Σου έφερα κεραμικές, καθαρίζονται με ένα πανί. Να κρατήσουμε τον προϋπολογισμό κάτω από εξακόσια ευρώ;", answer: "Ναι, ας μην το παρακάνουμε.", verdict: "Σύμφωνοι. Ό,τι περνάει το όριο, φεύγει.", verdict2: null, pick: "Και η κουζίνα, έτοιμη." });
}

async function stores(): Promise<SkStore[]> {
  const all = await db.store.findMany({ where: { active: true }, select: { id: true, name: true, address: true, city: true, phone: true, lat: true, lng: true } });
  const km = (lat: number, lng: number) => { const R = 6371, r = Math.PI / 180, dLat = (lat - SKETS.home.lat) * r, dLng = (lng - SKETS.home.lng) * r; const a = Math.sin(dLat / 2) ** 2 + Math.cos(SKETS.home.lat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
  const near = all.map((s) => ({ ...s, km: Math.round(km(s.lat, s.lng) * 10) / 10 })).sort((a, b) => a.km - b.km);
  const inCity = near.filter((s) => s.km <= SKETS.radiusKm);
  return (inCity.length >= 2 ? inCity : near.slice(0, 5)).map((s) => {
    const raw = s.address.replace(/\s*\d.*$/, "").trim() || s.city;
    const street = SKETS.streets[raw] ?? raw;
    return { id: s.id, name: s.name, street, address: s.address.replace(raw, street), city: s.city, phone: s.phone, km: s.km, lat: s.lat, lng: s.lng, spoken: `το κατάστημα της ${street}` };
  });
}

(async () => {
  const cats = [await washer(), await fridge(), await tv(), await ac(), await cooker()];
  const total = Math.round(cats.reduce((t, c) => t + c.candidates.find((p) => p.id === c.pick)!.price, 0) * 100) / 100;
  const pay = await getSetting("payments").catch(() => null);
  const months = Math.max(0, Math.min(36, Number(pay?.data.maxInstalments) || 0));
  const snap: Snapshot = { at: new Date().toISOString(), presenter: SKETS.presenter, home: SKETS.home, cats, total, instalments: months > 1 ? { months, amount: Math.round((total / months) * 100) / 100 } : null, stores: await stores(), voice: {} };
  for (const c of cats) console.log(`${c.label}: ${c.candidates.map((p) => `${p.brand} ${p.key} ${eur(p.price)}${p.id === c.pick ? " ✓" : ""}`).join(" · ")}`);
  console.log("Σύνολο", eur(total), snap.instalments ? `· ${snap.instalments.months} δόσεις × ${snap.instalments.amount}` : "");
  console.log("Καταστήματα:", snap.stores.map((s) => `${s.street} (${s.km} km)`).join(" · "));
  if (!process.argv.includes("--no-voice")) {
    for (const text of allPhrases(snap)) {
      const r = await speak(text);
      if (r) snap.voice[text] = r.url; else console.warn("✗ χωρίς ηχογράφηση:", text);
      process.stdout.write(r ? (r.cached ? "·" : "♪") : "✗");
    }
    console.log();
  }
  writeFileSync("lib/skets/snapshot.json", JSON.stringify(snap, null, 1));
  console.log("→ lib/skets/snapshot.json", Object.keys(snap.voice).length, "φράσεις");
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
