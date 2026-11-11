// Καθαρές αποφάσεις της νυχτερινής εργασίας: τι γίνεται με ένα ζευγάρι δεδομένου του αποτελέσματος του API. Χωρίς DB/δίκτυο.
import { diffPct, sameEan, type parseProduct } from "./kotsovolos/core";

type Parsed = ReturnType<typeof parseProduct>;
export type Match = "auto" | "suggested" | "manual" | "rejected" | "lost";

/** Δική μας τελική τιμή επισκέπτη: προσφορά αν υπάρχει, αλλιώς τιμή eshop. */
export function ourPrice(p: { price: number | null; offer: { price: { toString(): string } } | null }): number | null {
  return p.offer ? Number(p.offer.price.toString()) : p.price;
}

export const isGoneError = (e: string) => e === "δεν βρέθηκε (404)" || e === "redirect" || e === "άδεια απάντηση";

export type Prev = { match: Match | null; extUrl: string | null; missCount: number; their: number | null; ourPrice: number | null };
export type Decision = {
  match: Match; lastError: string | null; missCount: number;
  available?: boolean; clearPair?: boolean;
  prices?: { list: number | null; offer: number | null; their: number; ourPrice: number | null; diff: number | null };
  history?: boolean;
};

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
  if (prev.match === "manual" && ean === false) return { match: "manual", lastError: eanMsg, missCount: prev.missCount };
  const match: Match = prev.match === "manual" ? "manual" : ean === true ? "auto" : ean === false ? "suggested" : a.base;
  const lastError = ean === false ? eanMsg : match === "suggested" ? a.note : null;
  const diff = a.ourPrice != null ? diffPct(a.ourPrice, their) : null;
  const history = prev.their == null || prev.their !== their || prev.ourPrice !== a.ourPrice;
  return { match, lastError, missCount: 0, available: true, history, prices: { list: parsed.list, offer: parsed.offer, their, ourPrice: a.ourPrice, diff } };
}
