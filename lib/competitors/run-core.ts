// Καθαρές αποφάσεις της νυχτερινής εργασίας: τι γίνεται με ένα ζευγάρι δεδομένου του αποτελέσματος του API. Χωρίς DB/δίκτυο.
import { athensAt } from "@/lib/scheduler/due";
import { diffPct, matchByModel, matchPhone, modelTokens, sameEan, type KotItem, type parseProduct } from "./kotsovolos/core";

type Parsed = ReturnType<typeof parseProduct>;
export type Match = "auto" | "suggested" | "manual" | "rejected" | "lost" | "variant";

/** Δική μας τελική τιμή επισκέπτη: προσφορά αν υπάρχει, αλλιώς τιμή eshop. */
export function ourPrice(p: { price: number | null; offer: { price: { toString(): string } } | null }): number | null {
  return p.offer ? Number(p.offer.price.toString()) : p.price;
}

/** Παράθυρο εργασίας σε ώρα Αθήνας (ο server τρέχει UTC). idle = λόγος που δεν ξεκινά· until = τέλος (06:00 Αθήνας).
 *  first = δεν έχει γίνει ακόμα το πρώτο πλήρες scanning (Ruling 10): τρέχει αμέσως μετά το deploy, για έως 6 ώρες. */
export function runWindow(trigger: "cron" | "manual", now: Date, first = false): { idle: string | null; until: Date } {
  const six = athensAt(now, 6, 0), one = athensAt(now, 1, 0);
  if (trigger === "cron" && first) return { idle: null, until: new Date(now.getTime() + 6 * 3600_000) };
  if (trigger === "manual") return { idle: null, until: new Date(Math.max(six.getTime(), now.getTime() + 2 * 3600_000)) };
  if (now < one) return { idle: "Πριν από τις 01:00", until: six };
  if (now >= six) return { idle: "Εκτός παραθύρου 01:00–06:00", until: six };
  return { idle: null, until: six };
}

/** Μόνο αυτές οι αποτυχίες μετρούν για το «blocked» (Ruling 9): όχι δίκτυο/5xx (τα πιάνει ο pacer) και όχι 404. */
export const isOddResponse = (e: string) => e === "η απάντηση δεν ήταν JSON" || e === "redirect" || e === "άδεια απάντηση";

export const isGoneError = (e: string) => e === "δεν βρέθηκε (404)" || e === "redirect" || e === "άδεια απάντηση";

export type Prev = { match: Match | null; extUrl: string | null; missCount: number; their: number | null; ourPrice: number | null };
export type Decision = {
  match: Match; lastError: string | null; missCount: number;
  available?: boolean; clearPair?: boolean;
  prices?: { list: number | null; offer: number | null; their: number; ourPrice: number | null; diff: number | null };
  /** Χωρίς τιμή για σύγκριση: σβήνει την παλιά αποθηκευμένη, για να μη φαίνεται φρέσκια (το checkedAt ανανεώνεται). */
  clearPrices?: true;
  history?: boolean;
};

/** Η κατάσταση που κουβαλά ένα νέο ψάξιμο: lost/rejected ξεκινούν από την αρχή (το απορριφθέν extId το βγάζει ήδη η λίστα υποψηφίων). */
export const searchPrev = (m: string | null | undefined): Match | null => (!m || m === "lost" || m === "rejected" || m === "variant" ? null : (m as Match));

/** Το extId λείπει από το sitemap ή το API δεν έχει πια προϊόν. */
export function decideGone(prev: Prev): Decision {
  const missCount = prev.missCount + 1;
  if (missCount >= 2) return { match: "lost", lastError: `χάθηκε: ${prev.extUrl ?? ""}`, missCount, available: false, clearPair: true };
  return { match: prev.match ?? "auto", lastError: "δεν υπάρχει πια στον Κωτσόβολο", missCount, available: false };
}

/** Χωρίς ζευγάρι μετά από πλήρες ψάξιμο (μοντέλο + AI): γραμμή με extId=null και αυτό το lastError, ξαναψάχνεται μετά από 7 ημέρες. */
export const NOT_FOUND = "δεν βρέθηκε στον Κωτσόβολο";
/** auto με |διαφορά| πάνω από τόσο % πάει για έλεγχο (σετ; άλλη συσκευασία;). Το manual δεν αλλάζει ποτέ. */
export const SANITY_PCT = 40;
export const TAKEN = "το ίδιο είδος του Κωτσόβολου είναι ήδη ζευγάρι με άλλο προϊόν μας";

const code = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
// «Α+++» του Κωτσόβολου μπορεί να είναι με ελληνικό άλφα
const cls = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/Α/g, "A").replace(/\s/g, "") || null;
export type Ours = { model: string | null; title: string; energyClass: string | null };
type Codes = { supplierCodes?: string[]; energyClass?: string | null };

/** Σίγουρο ζευγάρι χωρίς ίδιο EAN: κωδικός προμηθευτή του Κωτσόβολου ΙΣΟΣ (όχι πρόθεμα) με το modelCode μας ή με κωδικό του τίτλου μας,
 *  και ίδια ενεργειακή κλάση όταν την ξέρουν και οι δύο. */
export function strongMatch(a: { ourModel: string | null; ourTitle: string; ourEnergyClass: string | null; parsed: Codes }): { ok: boolean; why: string } {
  const ours = new Set([a.ourModel ?? "", ...modelTokens(a.ourTitle)].map(code).filter((c) => c.length >= 5));
  const hit = (a.parsed.supplierCodes ?? []).find((c) => ours.has(code(c)));
  if (!hit) return { ok: false, why: "ο κωδικός προμηθευτή του Κωτσόβολου δεν είναι ο δικός μας" };
  const x = cls(a.ourEnergyClass), y = cls(a.parsed.energyClass);
  if (x && y && x !== y) return { ok: false, why: `διαφορετική ενεργειακή κλάση (δική μας ${x}, Κωτσόβολου ${y})` };
  return { ok: true, why: `ίδιος κωδικός προμηθευτή (${hit})` };
}

const pct = (d: number) => `${d > 0 ? "+" : ""}${String(d).replace(".", ",")}%`;
export const sanityMsg = (d: number) => `μεγάλη διαφορά τιμής (${pct(d)}) — έλεγξε (σετ; άλλη συσκευασία;)`;
/** Κανόνας 2: auto με |diff| > SANITY_PCT → suggested· όλα τα άλλα όπως είναι. */
export const insane = (match: Match, diff: number | null | undefined) => match === "auto" && diff != null && Math.abs(diff) > SANITY_PCT;

/**
 * Αποτέλεσμα ανάγνωσης τιμής. `base` = τι λέει ο κανόνας μοντέλου (auto = matched, suggested = πρόταση)·
 * `note` = το lastError του κανόνα (π.χ. «διαφέρει κατάληξη»). Διαφορετικό EAN δεν απορρίπτει ποτέ ζευγάρι:
 * το κατεβάζει σε suggested (το manual μένει). Δεν αγγίζει ποτέ τα rejectedExtIds.
 * `ours`: με αυτό, το strongMatch (κωδικός προμηθευτή) δίνει auto και χωρίς ίδιο EAN. `taken`: το extId είναι ήδη ζευγάρι
 * άλλου προϊόντος μας → ποτέ auto. Τέλος, auto με μεγάλη διαφορά τιμής → suggested.
 */
export function decidePrice(a: { prev: Prev; base: "auto" | "suggested"; note: string | null; parsed: Parsed; ourEan: string | null; ourPrice: number | null; ours?: Ours; taken?: boolean }): Decision {
  const { prev, parsed } = a;
  if ("error" in parsed) return { match: prev.match ?? a.base, lastError: parsed.error, missCount: prev.missCount };
  const their = parsed.offer ?? parsed.list;
  if (their == null) return { match: prev.match ?? a.base, clearPrices: true, lastError: parsed.symbolic ? "η μονάδα πωλείται ως σετ στον Κωτσόβολο και το σετ δεν βρέθηκε — χωρίς τιμή για σύγκριση" : "χωρίς τιμή", missCount: prev.missCount };
  const ean = sameEan(parsed.ean, a.ourEan);
  const eanMsg = `διαφορετικό EAN (δικό μας ${a.ourEan}, Κωτσόβολου ${parsed.ean}) — έλεγξε`;
  const strong = ean !== true && a.ours ? strongMatch({ ourModel: a.ours.model, ourTitle: a.ours.title, ourEnergyClass: a.ours.energyClass, parsed }).ok : false;
  const diff = a.ourPrice != null ? diffPct(a.ourPrice, their) : null;
  let match: Match = prev.match === "manual" ? "manual" : ean === true || strong ? "auto" : ean === false ? "suggested" : a.base;
  let lastError = match === "auto" || match === "manual" ? (ean === false && !strong ? eanMsg : null) : ean === false ? eanMsg : a.note;
  if (match === "auto" && a.taken) { match = "suggested"; lastError = TAKEN; }
  else if (insane(match, diff)) { match = "suggested"; lastError = sanityMsg(diff!); }
  const history = prev.their == null || prev.their !== their || prev.ourPrice !== a.ourPrice;
  return { match, lastError, missCount: 0, available: parsed.buyable, history, prices: { list: parsed.list, offer: parsed.offer, their, ourPrice: a.ourPrice, diff } };
}

type Search = { items: KotItem[]; base: "auto" | "suggested"; note: string | null };
/** Κωδικός μοντέλου (modelCode, μετά κωδικοί από τον τίτλο) σε κάθε δεξαμενή με τη σειρά: πρώτα η αντιστοιχισμένη κατηγορία, μετά όλη η μάρκα.
 *  Ταίριασμα από κωδικό του τίτλου είναι πάντα πρόταση (auto μόνο με ίδιο EAN, μέσα στο decidePrice), όπως του AI. */
export function search(brand: string, alias: string | null, model: string | null, title: string, phone: boolean, pools: KotItem[][]): Search | null {
  const models = [...new Set([model, ...modelTokens(title)].filter((m): m is string => !!m))];
  for (const pool of pools) for (const mc of models) {
    const m = matchByModel({ brand, alias, model: mc }, pool);
    const fromTitle = mc !== model;
    if (m.kind === "matched") return fromTitle ? { items: [m.item], base: "suggested", note: `κωδικός από τον τίτλο (${mc}) — έλεγξε` } : { items: [m.item], base: "auto", note: null };
    if (m.kind === "suggested") return { items: [m.item], base: "suggested", note: m.reason };
    if (m.kind === "ambiguous") return { items: m.items.slice(0, 3), base: "suggested", note: `πολλά υποψήφια (${m.items.length})` };
  }
  if (phone) for (const pool of pools) { const p = matchPhone({ brand, alias, title }, pool); if (p) return { items: [p], base: "suggested", note: null }; }
  return null;
}

/** Ενδεικτικό «ίδιο μοντέλο, άλλο χρώμα» (Ruling 15): τιμή όπως στα ζευγάρια, χωρίς σημείωση για διαφορετικό EAN (αναμενόμενο).
 *  Ίδιο EAN = είναι το ίδιο προϊόν → auto. */
export function decideVariant(a: { prev: Prev; parsed: Parsed; ourEan: string | null; ourPrice: number | null }): Decision {
  const d = decidePrice({ prev: { ...a.prev, match: null }, base: "suggested", note: null, parsed: a.parsed, ourEan: a.ourEan, ourPrice: a.ourPrice });
  if (d.match === "auto") return d;
  return { ...d, match: "variant", lastError: d.lastError?.startsWith("διαφορετικό EAN") ? null : d.lastError };
}

/** Τα ενδεικτικά ξαναψάχνονται για ακριβές ζευγάρι μία φορά την εβδομάδα: μέρα ανά προϊόν από το id, ώστε να μοιράζονται στις 7 νύχτες. */
export function researchDue(productId: string, now: Date): boolean {
  let h = 0;
  for (const ch of productId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (Math.floor(now.getTime() / 86400_000) + h) % 7 === 0;
}

/** Νεκρή ομάδα μάρκα×κατηγορία: ≥ 5 «δεν βρέθηκε» και κανένα ζευγάρι/πρόταση/ενδεικτικό. Εκεί το AI δεν βοηθά (η μάρκα λείπει από την κατηγορία). */
export function deadGroups(rows: { brandId: string; categoryId: string; match: string | null; extId: string | null; lastError: string | null }[]): Set<string> {
  const t = new Map<string, { miss: number; hit: number }>();
  for (const r of rows) {
    const k = `${r.brandId}|${r.categoryId}`, x = t.get(k) ?? { miss: 0, hit: 0 };
    if (!r.extId && r.lastError === NOT_FOUND) x.miss++;
    else if (r.match === "auto" || r.match === "manual" || r.match === "suggested" || r.match === "variant") x.hit++;
    t.set(k, x);
  }
  return new Set([...t].filter(([, x]) => x.miss >= 5 && x.hit === 0).map(([k]) => k));
}

/** Λόγος πρότασης για το φίλτρο της οθόνης «Προτάσεις προς έλεγχο». */
export type Reason = "ean" | "ai" | "many" | "price" | "taken" | "other";
export function reasonOf(lastError: string | null): Reason {
  const e = lastError ?? "";
  if (e.startsWith("διαφορετικό EAN")) return "ean";
  if (e.startsWith("AI:")) return "ai";
  if (e.startsWith("πολλά υποψήφια")) return "many";
  if (e.startsWith("μεγάλη διαφορά τιμής")) return "price";
  if (e === TAKEN) return "taken";
  return "other";
}
