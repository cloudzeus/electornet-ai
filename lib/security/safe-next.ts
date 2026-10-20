/**
 * Ασφαλής προορισμός επιστροφής (`?next=`, `returnTo` κ.λπ.) — ΜΙΑ συνάρτηση για όλο το site, για να μη γίνεται
 * open redirect. Δεκτή μόνο σχετική διαδρομή του ίδιου site: αρχίζει με ΕΝΑ «/» και ο δεύτερος χαρακτήρας δεν είναι
 * «/» ή «\» (ο browser διαβάζει το «/\evil.com» σαν «//evil.com»). Η διαδρομή κανονικοποιείται (new URL): dot-segments
 * όπως «/x/..//evil.com» ή «/%2e//evil.com» καταλήγουν σε «//evil.com» και απορρίπτονται· επιστρέφεται η ΚΑΝΟΝΙΚΗ
 * μορφή (pathname + search + hash), όχι το raw. Το pathname ελέγχεται και αποκωδικοποιημένο (%2F%2F, %5C, διπλή
 * κωδικοποίηση)· απορρίπτονται χαρακτήρες ελέγχου (ο browser πετάει tab/newline: «/\t/evil.com» → «//evil.com»),
 * backslash και διαδρομές /api/. Το query/hash δεν αποκωδικοποιείται («?q=100%» είναι νόμιμο). Καθαρή συνάρτηση.
 */
const MAX = 1000;
const ORIGIN = "https://same-origin.invalid";
const CTRL = /[\u0000-\u001F\u007F]/;

/** Επικίνδυνο pathname (ήδη κανονικοποιημένο ή αποκωδικοποιημένο). */
function badPath(p: string) {
  if (!p.startsWith("/") || p[1] === "/" || p.includes("\\") || CTRL.test(p) || /^\/api(?:\/|$)/i.test(p)) return true;
  let n: string;
  try { n = new URL(p, ORIGIN).pathname; } catch { return true; }
  return n.startsWith("//") || /^\/api(?:\/|$)/i.test(n); // dot-segments: «/x/..//evil.com» → «//evil.com»
}

export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw || raw.length > MAX) return fallback;
  if (!raw.startsWith("/") || raw[1] === "/" || raw.includes("\\") || CTRL.test(raw)) return fallback;
  let u: URL;
  try { u = new URL(raw, ORIGIN); } catch { return fallback; }
  if (u.origin !== ORIGIN || badPath(u.pathname)) return fallback;
  // κωδικοποιημένες παραλλαγές στη διαδρομή: αποκωδικοποίηση έως 4 επίπεδα· σταματά (χωρίς απόρριψη) σε άκυρο «%»
  let p = u.pathname;
  for (let i = 0; i < 4; i++) {
    let d: string;
    try { d = decodeURIComponent(p); } catch { break; }
    if (d === p) break;
    if (badPath(d)) return fallback;
    p = d;
  }
  return u.pathname + u.search + u.hash;
}
