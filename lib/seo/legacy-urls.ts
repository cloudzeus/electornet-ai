import map from "./legacy-urls.json";

/**
 * Διευθύνσεις του παλιού euronics.gr (nopCommerce, π.χ. /aeg-ccb6446cbm-κουζίνα-ελεύθερη) που έχει ακόμη η Google.
 * Ο χάρτης είναι παγωμένος (crawl 21/11/2026 + παλιό sitemap): κλειδί = το τμήμα του URL κανονικοποιημένο,
 * τιμή = κωδικός είδους SoftOne (το slug του προϊόντος αλλάζει, ο κωδικός όχι) ή έτοιμη διαδρομή («/k/…», «/brands/…»).
 */
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ").replace(/[^a-z0-9α-ω]/g, "");

export function legacyTarget(segment: string): { erpCode: string } | { path: string } | null {
  let s = segment;
  try { s = decodeURIComponent(segment); } catch { /* ήδη αποκωδικοποιημένο με σκέτο «%» */ }
  const key = norm(s);
  const hit = Object.hasOwn(map, key) ? (map as Record<string, string>)[key] : null; // όχι «constructor» κ.λπ. από το prototype
  return !hit ? null : hit.startsWith("/") ? { path: hit } : { erpCode: hit };
}
