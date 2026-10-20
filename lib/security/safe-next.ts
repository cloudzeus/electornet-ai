/**
 * Ασφαλής προορισμός επιστροφής (`?next=`, `returnTo` κ.λπ.) — ΜΙΑ συνάρτηση για όλο το site, για να μη γίνεται
 * open redirect. Δεκτή μόνο σχετική διαδρομή του ίδιου site: αρχίζει με ΕΝΑ «/» και ο δεύτερος χαρακτήρας δεν είναι
 * «/» ή «\» (ο browser διαβάζει το «/\evil.com» σαν «//evil.com»). Ο έλεγχος γίνεται και στην αποκωδικοποιημένη μορφή
 * (%2F%2F, %5C, διπλή κωδικοποίηση), απορρίπτονται χαρακτήρες ελέγχου (ο browser πετάει tab/newline: «/\t/evil.com» →
 * «//evil.com»), backslash, `javascript:` και διαδρομές /api/. Καθαρή συνάρτηση — τρέχει σε server και browser.
 */
const MAX = 1000;
const ORIGIN = "https://same-origin.invalid";

function bad(s: string) {
  return !s.startsWith("/") || s[1] === "/" || s.includes("\\") || /[\u0000-\u001F\u007F]/.test(s) || /\b(?:javascript|vbscript):/i.test(s) || /^\/api(?:\/|$)/i.test(s);
}

export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw || raw.length > MAX) return fallback;
  let s = raw;
  for (let i = 0; i < 4; i++) {
    if (bad(s)) return fallback;
    try { if (new URL(s, ORIGIN).origin !== ORIGIN) return fallback; } catch { return fallback; }
    let d: string;
    try { d = decodeURIComponent(s); } catch { return fallback; }
    if (d === s) return raw;
    s = d;
  }
  return fallback; // υπερβολικά πολλά επίπεδα κωδικοποίησης
}
