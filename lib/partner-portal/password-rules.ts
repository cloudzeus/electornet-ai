/** Κανόνες κωδικού για το UI — ίδιοι με τον server (auth.ts PASSWORD_RULES). */
export const RULES: { key: string; label: string; test: (p: string, email: string) => boolean }[] = [
  { key: "len", label: "Τουλάχιστον 10 χαρακτήρες", test: (p) => p.length >= 10 },
  { key: "case", label: "Κεφαλαία και πεζά", test: (p) => /\p{Lu}/u.test(p) && /\p{Ll}/u.test(p) },
  { key: "digit", label: "Τουλάχιστον ένας αριθμός", test: (p) => /\d/.test(p) },
  { key: "email", label: "Δεν περιέχει το email", test: (p, e) => !e || !p.toLowerCase().includes(e.split("@")[0].toLowerCase()) },
];
export function strength(p: string) {
  let s = 0;
  if (p.length >= 10) s++; if (p.length >= 14) s++;
  if (/\p{Lu}/u.test(p) && /\p{Ll}/u.test(p)) s++;
  if (/\d/.test(p)) s++; if (/[^\p{L}\d]/u.test(p)) s++;
  return Math.min(4, s);
}
