import { safeNext } from "./safe-next";

/**
 * Έλεγχοι διευθύνσεων με ανάλυση (new URL), ΟΧΙ με startsWith: το «https://euronics.b-cdn.net@άλλο-host/» και το
 * «https://euronics.b-cdn.net.evil.com/» αρχίζουν με τη διεύθυνση του CDN αλλά πάνε αλλού. Καθαρές συναρτήσεις.
 */

/** Τα hostnames των ρυθμισμένων διευθύνσεων CDN (άκυρες / κενές αγνοούνται). */
export function cdnHosts(...urls: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const u of urls) { try { if (u) out.add(new URL(u).hostname); } catch { /* άκυρη ρύθμιση */ } }
  return [...out];
}

/** URL αρχείου του CDN μας: μόνο https, χωρίς κωδικούς, προεπιλεγμένη θύρα, hostname ακριβώς ένα από τα `hosts`. */
export function allowedCdnUrl(raw: string, hosts: readonly string[]): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  return hosts.some((h) => h.toLowerCase() === u.hostname) ? u : null;
}

/**
 * Σύνδεσμος διαφημιστικής θέσης (τον ορίζει ο διαχειριστής): εσωτερική διαδρομή (κοινός έλεγχος safeNext) ή απόλυτο
 * http(s) χωρίς κωδικούς. Ποτέ javascript:/data:/vbscript: ή «//άλλο-site». null → ο καλών βάζει τη δική του προεπιλογή.
 */
export function safeAdHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const h = href.trim();
  if (!h) return null;
  if (h.startsWith("/")) { const s = safeNext(h, ""); return s || null; }
  if (/[\u0000-\u001F\u007F\\]/.test(h)) return null;
  let u: URL;
  try { u = new URL(h); } catch { return null; }
  if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !u.hostname) return null;
  return u.href; // κανονική μορφή («https:evil.com» → «https://evil.com/»)
}
