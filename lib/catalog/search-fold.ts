/**
 * Ανοχή της αναζήτησης σε τόνους, greeklish και ορθογραφικά.
 * Η βάση ψάχνει με «περιέχει»· εδώ κάθε λέξη του πελάτη γίνεται οι πραγματικές λέξεις του καταλόγου που εννοεί
 * («plyntirio», «πληντυριο», «πλυντηριο» → «Πλυντήριο», «Πλυντήρια»…) και η βάση ψάχνει αυτές.
 */

/** Πεζά χωρίς τόνους. */
export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const GR: Record<string, string> = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "t", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "x", ψ: "ps", ω: "o" };

/** Φωνητικό κλειδί, ίδιο για ελληνικά, greeklish και ομόηχα λάθη: «πλυντήριο» = «πληντυριο» = «plyntirio» = «plintirio». */
export function phon(s: string): string {
  return fold(s).replace(/[α-ω]/g, (c) => GR[c] ?? c)
    .replace(/ph/g, "f").replace(/th/g, "t").replace(/ch|ks|h/g, "x")
    .replace(/o[uy]/g, "u").replace(/ai/g, "e").replace(/[eoy]i/g, "i").replace(/([ae])[uy]/g, "$1v").replace(/y/g, "i").replace(/w/g, "o")
    .replace(/f/g, "v").replace(/[cq]/g, "k")
    .replace(/m[pb]/g, "b").replace(/n[td]/g, "d").replace(/gk/g, "g") // «μπλέντερ» = «blender»
    .replace(/(.)\1+/g, "$1");
}

/** Απόσταση του q από το κοντινότερο πρόθεμα του t (αντιμετάθεση γειτονικών = 1 λάθος), ώστε να πιάνει και μισογραμμένες λέξεις. */
export function prefixDistance(q: string, t: string): number {
  let prev2: number[] = [], prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= q.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (q[i - 1] === t[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && q[i - 1] === t[j - 2] && q[i - 2] === t[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev; prev = cur;
  }
  return Math.min(...prev);
}

/** Πόσα λάθη συγχωρούνται: κανένα σε μικρές λέξεις, 1 από 4 γράμματα, 2 από 8. */
const allowed = (key: string) => (key.length >= 8 ? 2 : key.length >= 4 ? 1 : 0);
const near = (k: string, key: string) => (k[0] === key[0] ? prefixDistance(k, key) : 99);

export interface Vocab { form: string; plain: string; key: string; n: number }

/** Οι λέξεις του καταλόγου (μόνο γράμματα, από 3 και πάνω), με τη συχνότητά τους — οι συχνότερες πρώτες. */
export function buildVocab(texts: string[]): Vocab[] {
  const m = new Map<string, Vocab>();
  for (const t of texts) for (const w of t.split(/[^\p{L}\p{N}]+/u)) {
    if (!/^\p{L}{3,}$/u.test(w)) continue;
    const id = w.toLowerCase(), v = m.get(id);
    if (v) v.n++; else m.set(id, { form: w, plain: fold(w), key: phon(w), n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

/**
 * Οι λέξεις του καταλόγου που εννοεί ο πελάτης με το `w`, όπως ακριβώς είναι γραμμένες στους τίτλους.
 * Σειρά: ίδια γραφή χωρίς τόνους → ίδιος ήχος (greeklish, η/ι/υ, ο/ω) → μικρό λάθος. Το επόμενο σκαλί μόνο αν το προηγούμενο δεν βρει τίποτα,
 * για να μη φέρνει το «air» ό,τι αρχίζει από «ερ». Λέξεις με ψηφία (μοντέλα, χωρητικότητες) δεν πειράζονται.
 */
export function expandWord(w: string, vocab: Vocab[], max = 8): string[] {
  if (w.length < 3 || /\d/.test(w)) return [];
  const p = fold(w), k = phon(w);
  let hits = vocab.filter((v) => v.plain.startsWith(p));
  if (!hits.length && k.length >= 3) hits = vocab.filter((v) => v.key.startsWith(k));
  if (!hits.length && allowed(k)) {
    const scored = vocab.map((v) => ({ v, d: near(k, v.key) })).filter((x) => x.d <= allowed(k));
    const best = Math.min(...scored.map((x) => x.d));
    hits = scored.filter((x) => x.d === best).map((x) => x.v);
  }
  return hits.slice(0, max).map((v) => v.form);
}

/** Πόσο κοντά είναι η λέξη του πελάτη στο κείμενο (όνομα κατηγορίας, μάρκας): 0 ίδια γραφή, 1 ίδιος ήχος, 2 μικρό λάθος, 9 άσχετο. */
export function wordLevel(w: string, text: string): number {
  if (fold(text).includes(fold(w))) return 0;
  const k = phon(w);
  if (k.length < 3 || /\d/.test(w)) return 9;
  const keys = text.split(/[^\p{L}\p{N}]+/u).map(phon);
  return keys.some((key) => key.startsWith(k)) ? 1 : keys.some((key) => near(k, key) <= allowed(k)) ? 2 : 9;
}

/** Από τα ονόματα κρατά όσα ταιριάζουν με όλες τις λέξεις, και μόνο του καλύτερου σκαλιού — το «ixeia» φέρνει «Ηχεία», όχι και «Υγεία». */
export function bestMatches<T>(words: string[], items: T[], name: (x: T) => string): T[] {
  const scored = items.map((x) => ({ x, l: Math.max(...words.map((w) => wordLevel(w, name(x)))) })).filter((s) => s.l < 9);
  const best = Math.min(...scored.map((s) => s.l));
  return scored.filter((s) => s.l === best).map((s) => s.x);
}
