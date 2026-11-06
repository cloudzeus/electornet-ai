/**
 * Σκετς Ερμή — προετοιμασία (την προηγούμενη μέρα και ξανά πριν μπει ο κόσμος):
 *   1. διαλέγει από τη βάση πραγματικά προϊόντα (ενεργά, δημοσιευμένα — χωρίς φίλτρο αποθέματος) και τις απορρίψεις της σκηνής
 *   2. βρίσκει τα κοντινότερα καταστήματα στο «νέο σπίτι» (lib/skets/config.ts)
 *   3. ηχογραφεί όλες τις φράσεις του Ερμή με τη φωνή του (lib/voice/tts.ts, cache + Bunny)
 * και γράφει το lib/skets/snapshot.json. Η σκηνή δεν κάνει κανένα ερώτημα στη βάση.
 *   npx tsx --conditions=react-server scripts/skets/prep.ts [--no-voice]
 *   … --voice-only → κρατά προϊόντα/καταστήματα του υπάρχοντος snapshot, ξαναηχογραφεί μόνο τις φράσεις (π.χ. αλλαγή κειμένου ή ταχύτητας)
 *   … --force → ξαναηχογραφεί και όσες είναι ήδη στην cache (θέλει ffmpeg που δουλεύει: αλλιώς βγαίνει WAV χωρίς επιτάχυνση)
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../../lib/db";
import { speak } from "../../lib/voice/tts";
import { getSetting } from "../../lib/settings/store";
import { SKETS } from "../../lib/skets/config";
import { allPhrases, forVoice, LIVE_BACK, LIVE_FILLERS, SKETS_VOICE, TURN_FILLERS } from "../../lib/skets/script";
import { attachSpecs } from "./specs";
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

/** «μικρό κάδο» με όσους τρόπους το λέει κανείς (και το «όχι» στα παπλώματα) */
export const SMALL_DRUM = "μικρ|για εναν|μονος μου|μονη μου|λιγα ρουχα|δεν χρειαζομαι μεγαλ|οχι τοσο μεγαλ|δεν θα πλενω|δεν πλενω|οχι παπλωμ|επτα κιλ|εφτα κιλ|οκτω κιλ|οχτω κιλ|7 κιλ|8 κιλ|καθαριστηρ|^οχι(?!.*μεγαλ)";
async function washer(): Promise<SkCategory> {
  const all = (await pool("plyntiria-roychon")).filter((r) => r.facets["choritikotita-plysis-kg"]?.num);
  const kg = (r: Row) => r.facets["choritikotita-plysis-kg"]!.num!;
  const by = (lo: number, hi: number) => all.filter((r) => kg(r) >= lo && kg(r) < hi);
  const small = spread([by(6, 8), by(8, 9)]), big = spread([by(9, 10), by(10, 13)]);
  const [keep, other] = [...big].sort((a, b) => energyRank(energyOf(a)) - energyRank(energyOf(b)) || quality(b) - quality(a));
  const why2 = energyRank(energyOf(keep)) < energyRank(energyOf(other))
    ? { reason: `Κλάση ${energyOf(other)} — καίει περισσότερο`, say: `Από τα δύο, το ${keep.brand} είναι κλάσης ${energyOf(keep)} — θα το νιώσετε στον λογαριασμό. Αυτό θα σας πρότεινα.` }
    : keep.price < other.price
      ? { reason: `${eur(other.price - keep.price)} ακριβότερο, χωρίς λόγο`, say: `Από τα δύο, το ${keep.brand} κάνει την ίδια δουλειά και κοστίζει λιγότερο. Αυτό θα σας πρότεινα.` }
      : { reason: `${kg(other)} kg, αλλά λιγότερο αθόρυβο και αξιόπιστο`, say: `Από τα δύο, το ${keep.brand} είναι το πιο αξιόπιστο — θα σας κρατήσει χρόνια. Αυτό θα σας πρότεινα.` };
  // «μικρό κάδο» / «όχι, δεν πλένω παπλώματα»: ο Ερμής ακολουθεί — αλλά αν το μεγάλο κοστίζει λιγότερο από τα μικρά, το λέει και το κρατά
  const KG = ["", "ένα", "δύο", "τριών", "τεσσάρων", "πέντε", "έξι", "επτά", "οκτώ", "εννιά", "δέκα", "έντεκα", "δώδεκα"];
  const [cheapSmall] = [...small].sort((a, b) => a.price - b.price);
  const smallAlt = { key: "small", words: SMALL_DRUM, known: "Ξεκινάμε με το πλυντήριο. Σας ξεχώρισα τέσσερα. Μου είπατε ήδη ότι σας αρκεί μικρός κάδος.",
    ...(keep.price <= cheapSmall.price
      ? { verdict: `Ακόμα κι αν σας αρκεί μικρότερος κάδος, το ${keep.brand} των ${KG[kg(keep)] ?? kg(keep)} κιλών κοστίζει λιγότερο από τα μικρότερα. Δεν έχει νόημα να πάρετε μικρότερο.`,
          reject: [...small.map((r) => ({ id: r.id, reason: `${kg(r)} kg — μικρότερο και ακριβότερο` })), { id: other.id, reason: why2.reason }], pick: keep.id, pickLine: "Το μεγάλο, στην τιμή του μικρού. Πάει στο μπάνιο." }
      : { verdict: "Αφού σας αρκεί μικρότερος κάδος, κρατάμε τα μικρά: κοστίζουν λιγότερο.",
          reject: [...big, ...small.filter((r) => r !== cheapSmall)].map((r) => ({ id: r.id, reason: `${kg(r)} kg — ${big.includes(r) ? "μεγαλύτερο απ' όσο χρειάζεστε" : "ακριβότερο"}` })), pick: cheapSmall.id, pickLine: "Αυτό λοιπόν. Πάει στο μπάνιο." }) };
  const c = cat("washer", "bath", "Πλυντήριο ρούχων", [...small, ...big].sort((a, b) => kg(a) - kg(b)), (r) => `${kg(r)} kg`,
    small.map((r) => ({ id: r.id, reason: `${kg(r)} kg — μικρό για διπλό πάπλωμα` })),
    [{ id: other.id, reason: why2.reason }], keep.id,
    { known: "Ξεκινάμε με το πλυντήριο. Σας ξεχώρισα τέσσερα. Μου είπατε ήδη ότι θέλετε μεγάλο κάδο.", ask: "Ξεκινάμε με το πλυντήριο. Σας ξεχώρισα τέσσερα. Πόσο μεγάλο κάδο θα χρειαστείτε;", answer: "Τι εννοείς;", follow: { ask: "Θα πλένετε, για παράδειγμα, και τα παπλώματά σας στο σπίτι;", answer: "Ναι, φυσικά." }, verdict: "Τότε χρειάζεστε τουλάχιστον εννιά κιλά. Τα μικρότερα φεύγουν.", verdict2: why2.say, pick: "Αυτό λοιπόν. Πάει στο μπάνιο." });
  return { ...c, alts: [smallAlt] };
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
    { known: "Πάμε στην κουζίνα. Για το ψυγείο, μου είπατε ήδη: όσο γίνεται λιγότερο ρεύμα.", ask: "Πάμε στην κουζίνα. Το ψυγείο δουλεύει μέρα νύχτα, όλο τον χρόνο. Σας ενδιαφέρει να καίει όσο γίνεται λιγότερο ρεύμα;", answer: "Ναι, σίγουρα.", verdict: "Τότε κρατάμε μόνο την καλύτερη ενεργειακή κλάση.", verdict2: null, pick: "Αυτό. Μπαίνει στην κουζίνα." });
}

async function tv(): Promise<SkCategory> {
  const all = (await pool("tileoraseis")).filter((r) => r.facets["eyros-othonis"]?.num);
  const inch = (r: Row) => r.facets["eyros-othonis"]!.num!;
  const [keep, small, huge] = spread([all.filter((r) => inch(r) === 55), all.filter((r) => inch(r) >= 40 && inch(r) <= 43), all.filter((r) => inch(r) >= 65 && inch(r) <= 75)]);
  const rows = [small, keep, huge];
  const c = cat("tv", "living", "Τηλεόραση", rows, (r) => `${inch(r)}″`,
    [{ id: rows[0].id, reason: `${inch(rows[0])}″ — μικρή για 2,5 m` }, { id: rows[2].id, reason: `${inch(rows[2])}″ — πολύ μεγάλη για 2,5 m` }], [], keep.id,
    { known: "Στο σαλόνι, η τηλεόραση. Την απόσταση μου την είπατε ήδη.", ask: "Στο σαλόνι, η τηλεόραση. Από πόση απόσταση θα βλέπετε; Γύρω στα δυόμισι μέτρα;", answer: "Ναι, κάπου εκεί.", verdict: "Για δυόμισι μέτρα, οι πενήντα πέντε ίντσες είναι ό,τι πρέπει.", verdict2: null, pick: "Στο σαλόνι." });
  // αν ο παρουσιαστής πει άλλη απόσταση, ο Ερμής αλλάζει μέγεθος (το ποσό στο τέλος ακολουθεί)
  return { ...c, unit: "m", alts: [
    { key: "far", min: 3.2, words: "μακρια|μακρυτερα|μεγαλυτερη αποσταση|μεγαλη αποσταση|πιο μεγαλη|μεγαλυτερη τηλεορ|μεγαλυτερη οθον", verdict: "Από τόσο μακριά, οι πενήντα πέντε ίντσες θα φαίνονται μικρές. Πάμε στις εβδομήντα πέντε.", reject: [{ id: rows[0].id, reason: `${inch(rows[0])}″ — πολύ μικρή από μακριά` }, { id: keep.id, reason: `${inch(keep)}″ — μικρή για πάνω από 3 m` }], pick: rows[2].id, pickLine: "Στο σαλόνι. Σαν σινεμά." },
    { key: "near", max: 1.8, words: "πιο κοντα|κοντυτερα|πολυ κοντα|μικρη αποσταση|πιο μικρη|μικροτερη", verdict: "Αφού θα κάθεστε πιο κοντά, οι σαράντα τρεις ίντσες είναι ό,τι πρέπει. Οι μεγαλύτερες κουράζουν τα μάτια.", reject: [{ id: keep.id, reason: `${inch(keep)}″ — μεγάλη για τόσο κοντά` }, { id: rows[2].id, reason: `${inch(rows[2])}″ — πολύ μεγάλη για τόσο κοντά` }], pick: rows[0].id, pickLine: "Στο σαλόνι." },
  ] };
}

async function ac(): Promise<SkCategory> {
  const all = (await pool("klimatistika-inverter")).filter((r) => r.facets["onomastiki-apodosi-btu-h"]?.num);
  const btu = (r: Row) => r.facets["onomastiki-apodosi-btu-h"]!.num!;
  const big = all.filter((r) => btu(r) >= 17000 && btu(r) <= 19000);
  const [mid, small, large] = spread([all.filter((r) => btu(r) >= 11500 && btu(r) <= 13000), all.filter((r) => btu(r) <= 9500), big.length ? big : all.filter((r) => btu(r) >= 17000)]);
  const rows = [small, mid, large];
  const fmt = (r: Row) => `${btu(r).toLocaleString("el-GR")} BTU`;
  const c = cat("ac", "living", "Κλιματιστικό", rows, fmt,
    [{ id: rows[0].id, reason: `${fmt(rows[0])} — λίγα για 25 m²` }, { id: rows[2].id, reason: `${fmt(rows[2])} — υπερβολικό, θα καίει άσκοπα` }], [], rows[1].id,
    { known: "Και το πιο σημαντικό: κλιματιστικό. Τα τετραγωνικά του σαλονιού τα ξέρω ήδη από εσάς.", ask: "Και το πιο σημαντικό για τη Λάρισα: κλιματιστικό. Τον Ιούλιο το θερμόμετρο εκεί περνάει τους σαράντα. Το σαλόνι σας είναι γύρω στα είκοσι πέντε τετραγωνικά;", answer: "Ναι, περίπου.", verdict: "Τότε χρειάζεστε δώδεκα χιλιάδες μονάδες. Ούτε λιγότερο, ούτε περισσότερο.", verdict2: null, pick: "Δροσιά εξασφαλισμένη." });
  // άλλο εμβαδόν → άλλη απόδοση (π.χ. «σαράντα τετραγωνικά» → 18.000 BTU)
  return { ...c, unit: "m2", alts: [
    { key: "big", min: 33, words: "μεγαλυτερ|πιο μεγαλ|ειναι μεγαλ|πολυ μεγαλ|τεραστι|ενιαι|πιο δυνατ|δυνατοτερ", verdict: "Αφού ο χώρος είναι μεγαλύτερος, οι δώδεκα χιλιάδες δεν φτάνουν. Χρειάζεστε δεκαοχτώ χιλιάδες μονάδες.", reject: [{ id: rows[0].id, reason: `${fmt(rows[0])} — πολύ λίγα για τέτοιο χώρο` }, { id: rows[1].id, reason: `${fmt(rows[1])} — δεν φτάνει για πάνω από 30 m²` }], pick: rows[2].id, pickLine: "Δροσιά εξασφαλισμένη, ακόμα και στους σαράντα βαθμούς." },
    { key: "small", max: 18, words: "μικροτερ|πιο μικρ|ειναι μικρ|πιο φθην|φθηνοτερ|πιο οικονομικο κλιματ", verdict: "Για μικρότερο χώρο, οι εννιά χιλιάδες μονάδες φτάνουν, και καίει λιγότερο ρεύμα.", reject: [{ id: rows[1].id, reason: `${fmt(rows[1])} — περισσότερα απ' όσα χρειάζεται` }, { id: rows[2].id, reason: `${fmt(rows[2])} — υπερβολικό, θα καίει άσκοπα` }], pick: rows[0].id, pickLine: "Δροσιά εξασφαλισμένη." },
  ] };
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
    const c = cat("cooker", "kitchen", "Κουζίνα", rows, kind,
      rest.map((r) => ({ id: r.id, reason: `${kind(r)} — ${kindOf(r)!.why}` })), [], keep.id,
      { known: "Τελευταία, η κουζίνα. Μου είπατε ήδη κεραμική.", ask: "Τελευταία, η κουζίνα. Με κεραμικές εστίες μαγειρεύετε με τα σκεύη που ήδη έχετε, και καθαρίζονται με ένα πανί. Σας βολεύει;", answer: "Ναι, κεραμική.", verdict: "Ωραία. Κρατάμε μόνο κεραμικές.", verdict2: null, pick: "Και η κουζίνα είναι έτοιμη." });
    // αν ο παρουσιαστής διαλέξει επαγωγική, ο Ερμής ακολουθεί: η φθηνότερη επαγωγική από όσες είναι στην οθόνη
    const ind = rest.filter((r) => /επαγω/i.test(r.text)).sort((a, b) => a.price - b.price);
    if (!ind.length) return c;
    return { ...c, alts: [{ key: "induction", words: "επαγωγ|οχι κεραμ|δεν θελω κεραμ|οχι με κεραμ", known: "Τελευταία, η κουζίνα. Μου είπατε ήδη ότι προτιμάτε επαγωγική.",
      verdict: "Κανένα πρόβλημα. Αφού προτιμάτε επαγωγική, κρατάμε τις επαγωγικές: ζεσταίνουν πιο γρήγορα. Θα χρειαστείτε μόνο σκεύη για επαγωγή.",
      reject: [{ id: keep.id, reason: "Κεραμικές εστίες — προτιμάτε επαγωγική" }, ...rest.filter((r) => !ind.slice(0, 1).includes(r)).map((r) => ({ id: r.id, reason: /επαγω/i.test(r.text) ? "Επαγωγική κι αυτή, αλλά ακριβότερη" : `${kind(r)} — ${kindOf(r)!.why}` }))],
      pick: ind[0].id, pickLine: "Επαγωγική, όπως τη θέλατε. Και η κουζίνα είναι έτοιμη." }] };
  }
  // όλες κεραμικές: η ερώτηση γίνεται προϋπολογισμός
  const LIMIT = 600;
  const [keep] = spread([all.filter((r) => r.price < LIMIT)]);
  const over = all.filter((r) => r.price >= LIMIT);
  const rest = spread([over, over.filter((r) => r.brand !== keep.brand && r.price > median(over, (x) => x.price).price)].map((g) => (g.length ? g : over))).filter((r, i, a) => a.indexOf(r) === i);
  const rows = [rest[0], keep, ...rest.slice(1)];
  return cat("cooker", "kitchen", "Κουζίνα κεραμική", rows, (r) => eur(r.price),
    rest.map((r) => ({ id: r.id, reason: `${eur(r.price)} — πάνω από τον προϋπολογισμό` })), [], keep.id,
    { known: "Τελευταία, η κουζίνα. Μου είπατε ήδη κεραμική.", ask: "Τελευταία, η κουζίνα. Σας έφερα κεραμικές, που καθαρίζονται με ένα πανί. Να κρατήσουμε τον προϋπολογισμό κάτω από εξακόσια ευρώ;", answer: "Ναι, ας μην το παρακάνουμε.", verdict: "Σύμφωνοι. Ό,τι περνάει το όριο, φεύγει.", verdict2: null, pick: "Και η κουζίνα είναι έτοιμη." });
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
  if (process.argv.includes("--voice-only")) {
    const snap = JSON.parse(readFileSync("lib/skets/snapshot.json", "utf8")) as Snapshot;
    snap.presenter = SKETS.presenter;
    await record(snap);
    return;
  }
  const cats = [await washer(), await fridge(), await tv(), await ac(), await cooker()];
  const total = Math.round(cats.reduce((t, c) => t + c.candidates.find((p) => p.id === c.pick)!.price, 0) * 100) / 100;
  const pay = await getSetting("payments").catch(() => null);
  const months = Math.max(0, Math.min(36, Number(pay?.data.maxInstalments) || 0));
  const snap: Snapshot = { at: new Date().toISOString(), presenter: SKETS.presenter, home: SKETS.home, cats, total, instalments: months > 1 ? { months, amount: Math.round((total / months) * 100) / 100 } : null, stores: await stores(), voice: {} };
  for (const c of cats) console.log(`${c.label}: ${c.candidates.map((p) => `${p.brand} ${p.key} ${eur(p.price)}${p.id === c.pick ? " ✓" : ""}`).join(" · ")}`);
  console.log("Σύνολο", eur(total), snap.instalments ? `· ${snap.instalments.months} δόσεις × ${snap.instalments.amount}` : "");
  console.log("Καταστήματα:", snap.stores.map((s) => `${s.street} (${s.km} km)`).join(" · "));
  await record(snap, process.argv.includes("--no-voice"));
})().catch((e) => { console.error(e); process.exit(1); });

/** Ηχογραφεί τις φράσεις του Ερμή (φωνή του σκετς) και γράφει το snapshot. */
async function record(snap: Snapshot, skipVoice = false) {
  if (!skipVoice) {
    snap.voice = {};
    const force = process.argv.includes("--force");
    // και οι φράσεις αναμονής των ζωντανών ερωτήσεων (/api/skets/ask), να είναι έτοιμες στην cache
    for (const text of [...LIVE_FILLERS, LIVE_BACK, ...TURN_FILLERS]) await speak(text, { ...SKETS_VOICE, force });
    for (const text of allPhrases(snap)) {
      const r = await speak(forVoice(text), { ...SKETS_VOICE, force });
      if (r) snap.voice[text] = r.url; else console.warn("✗ χωρίς ηχογράφηση:", text);
      process.stdout.write(r ? (r.cached ? "·" : "♪") : "✗");
    }
    console.log();
  }
  await attachSpecs(snap);
  writeFileSync("lib/skets/snapshot.json", JSON.stringify(snap, null, 1));
  console.log("→ lib/skets/snapshot.json", Object.keys(snap.voice).length, "φράσεις");
  await db.$disconnect();
}
