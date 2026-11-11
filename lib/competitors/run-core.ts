// Καθαρές αποφάσεις της νυχτερινής εργασίας: τι γίνεται με ένα ζευγάρι δεδομένου του αποτελέσματος του API. Χωρίς DB/δίκτυο.
import { athensAt } from "@/lib/scheduler/due";
import { diffPct, matchByModel, matchPhone, modelTokens, sameEan, type KotItem, type parseProduct } from "./kotsovolos/core";

type Parsed = ReturnType<typeof parseProduct>;
export type Match = "auto" | "suggested" | "manual" | "rejected" | "lost";

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
  history?: boolean;
};

/** Η κατάσταση που κουβαλά ένα νέο ψάξιμο: lost/rejected ξεκινούν από την αρχή (το απορριφθέν extId το βγάζει ήδη η λίστα υποψηφίων). */
export const searchPrev = (m: string | null | undefined): Match | null => (!m || m === "lost" || m === "rejected" ? null : (m as Match));

/** Το extId λείπει από το sitemap ή το API δεν έχει πια προϊόν. */
export function decideGone(prev: Prev): Decision {
  const missCount = prev.missCount + 1;
  if (missCount >= 2) return { match: "lost", lastError: `χάθηκε: ${prev.extUrl ?? ""}`, missCount, available: false, clearPair: true };
  return { match: prev.match ?? "auto", lastError: "δεν υπάρχει πια στον Κωτσόβολο", missCount, available: false };
}

/**
 * Αποτέλεσμα ανάγνωσης τιμής. `base` = τι λέει ο κανόνας μοντέλου (auto = matched, suggested = πρόταση)·
 * `note` = το lastError του κανόνα (π.χ. «διαφέρει κατάληξη»). Διαφορετικό EAN δεν απορρίπτει ποτέ ζευγάρι:
 * το κατεβάζει σε suggested (το manual μένει). Δεν αγγίζει ποτέ τα rejectedExtIds.
 */
export function decidePrice(a: { prev: Prev; base: "auto" | "suggested"; note: string | null; parsed: Parsed; ourEan: string | null; ourPrice: number | null }): Decision {
  const { prev, parsed } = a;
  if ("error" in parsed) return { match: prev.match ?? a.base, lastError: parsed.error, missCount: prev.missCount };
  const their = parsed.offer ?? parsed.list;
  if (their == null) return { match: prev.match ?? a.base, lastError: "χωρίς τιμή", missCount: prev.missCount };
  const ean = sameEan(parsed.ean, a.ourEan);
  const eanMsg = `διαφορετικό EAN (δικό μας ${a.ourEan}, Κωτσόβολου ${parsed.ean}) — έλεγξε`;
  const match: Match = prev.match === "manual" ? "manual" : ean === true ? "auto" : ean === false ? "suggested" : a.base;
  const lastError = ean === false ? eanMsg : match === "suggested" ? a.note : null;
  const diff = a.ourPrice != null ? diffPct(a.ourPrice, their) : null;
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
