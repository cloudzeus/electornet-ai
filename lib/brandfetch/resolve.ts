import "server-only";

/**
 * Brandfetch: αντιστοίχιση ονόματος μάρκας → domain, και σύνδεσμος λογοτύπου.
 *
 * ⚠️ Οι όροι του Brandfetch ΑΠΑΓΟΡΕΥΟΥΝ τη λήψη και επαναφιλοξενία των εικόνων
 * («Programmatic access to logo images is not permitted… Scraping logos will
 * also lead to a block»). Γι' αυτό αποθηκεύουμε ΜΟΝΟ τον σύνδεσμο CDN και τον
 * χρησιμοποιούμε ως hotlink, όπως απαιτούν. Όπου θέλουμε δικό μας αρχείο (π.χ.
 * επίσημο SVG από τον κατασκευαστή), το ανεβάζουμε στη Media library — αυτό
 * υπερισχύει του hotlink.
 *
 * Η αναζήτηση είναι ασαφής: «AEG» γυρίζει πρώτο το «Aegon». Γι' αυτό κάθε
 * υποψήφιο βαθμολογείται και κάτω από το κατώφλι μένει για χειροκίνητη
 * επιβεβαίωση αντί να μπει λάθος λογότυπο.
 */
export interface BfHit { brandId: string; name: string; domain: string; icon?: string; verified?: boolean; claimed?: boolean; qualityScore?: number; _score?: number }
export interface Resolved { domain: string; name: string; score: number; verified: boolean; logoCdn: string }

const clientId = () => process.env.LOGOS_API_KEY ?? "";
export const hasKey = () => !!clientId();

/** Κανονικοποίηση για σύγκριση: πεζά, χωρίς τόνους, μόνο γράμματα/ψηφία. */
export const fold = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** «samsung.com» → «samsung», «aeg.com.es» → «aeg» */
export const domainRoot = (d: string) => fold((d ?? "").replace(/^www\./, "").split(".")[0] ?? "");

/** Σύνδεσμος λογοτύπου (hotlink). type: logo = πλήρες, symbol = σήμα, icon = τετράγωνο. */
export function logoUrl(domain: string, opts: { type?: "logo" | "symbol" | "icon"; w?: number; h?: number; format?: "webp" | "png" | "svg"; theme?: "light" | "dark" } = {}) {
  const { type = "logo", w = 256, h = 128, format = "webp", theme } = opts;
  const parts = [`https://cdn.brandfetch.io/${encodeURIComponent(domain)}`];
  if (theme) parts.push(`theme/${theme}`);
  // Το fallback είναι **τμήμα διαδρομής**, όχι query parameter — ως `?fallback=`
  // αγνοείται σιωπηλά. Χωρίς αυτό, όταν το Brandfetch δεν έχει λογότυπο για το
  // domain σερβίρει το ΔΙΚΟ ΤΟΥ σήμα με HTTP 200 και εμφανίζεται σαν να είναι
  // η μάρκα. Με `fallback/404` η εικόνα σπάει καθαρά και την κρύβουμε.
  parts.push("fallback/404", `w/${w}`, `h/${h}`, `${type}.${format}`);
  return `${parts.join("/")}?c=${clientId()}`;
}

/**
 * Προτίμηση καταλήξεων: το `.com` είναι ο διεθνής εταιρικός κόμβος, το `.gr`
 * η αγορά μας. Οι ξένες εθνικές καταλήξεις (aeg.it, pitsoskitchen.co.za)
 * είναι τοπικά παραρτήματα και οι «μοδάτες» (.gg, .chat, .xyz) σχεδόν πάντα
 * άσχετο site με το ίδιο όνομα.
 */
function tldBonus(domain: string): number {
  const d = domain.toLowerCase();
  if (/\.com$/.test(d)) return 0.1;
  if (/\.gr$/.test(d)) return 0.08;
  if (/\.(net|org|eu)$/.test(d)) return 0.02;
  if (/\.(com|co)\.[a-z]{2}$/.test(d)) return -0.2;              // aeg.com.es, pitsoskitchen.co.za
  if (/\.(gg|chat|xyz|io|ai|app|shop|store|online|site)$/.test(d)) return -0.2;
  if (/\.[a-z]{2}$/.test(d)) return -0.12;                        // ξένη εθνική: .it, .se, .fr
  return 0;
}

/**
 * Βαθμολογία υποψηφίου.
 *
 * Το ισχυρό σήμα είναι το **domain**, όχι το όνομα: το ευρετήριο του
 * Brandfetch έχει εγγραφές όπου το όνομα ταιριάζει αλλά το domain ανήκει σε
 * άλλη εταιρεία («3Com» → 3produccion.com, «A&U» → au-magazine.com). Όταν η
 * ρίζα του domain δεν σχετίζεται με το όνομα που ψάχνουμε, η βεβαιότητα
 * πέφτει κάτω από το κατώφλι και η μάρκα πάει για χειροκίνητο έλεγχο.
 */
export function scoreHit(query: string, hit: BfHit): number {
  const q = fold(query);
  const name = fold(hit.name);
  const root = domainRoot(hit.domain);
  if (!q || !hit.domain || q.length < 2) return 0;

  // πόσο σχετίζεται η ρίζα του domain με το ερώτημα
  const rootExact = root === q;
  const rootNear = !rootExact && root.length >= 3 && (root.startsWith(q) || q.startsWith(root));
  const nameExact = name === q;

  // Μόνο το ΑΚΡΙΒΕΣ domain είναι αρκετά ασφαλές για αυτόματη αποδοχή. Το
  // πρόθεμα («3com» ⊂ «3commarketing», «a4tech» ⊂ «a4technology») είναι στις
  // περισσότερες περιπτώσεις άλλη εταιρεία, οπότε μένει πρόταση προς έλεγχο.
  let s: number;
  if (rootExact) s = 0.95;
  else if (rootNear && nameExact) s = 0.6;
  else if (rootNear) s = 0.45;
  else if (nameExact) s = 0.35;
  else return 0;

  s += tldBonus(hit.domain);
  if (hit.verified) s += 0.04;
  if (hit.claimed) s += 0.03;
  s += Math.min(0.05, (hit.qualityScore ?? 0) * 0.05);
  if ((hit.qualityScore ?? 0) < 0.5 && !hit.verified) s -= 0.25;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

/** Αναζήτηση μάρκας. Επιστρέφει τον καλύτερο υποψήφιο πάνω από το κατώφλι, μαζί με τους υπόλοιπους. */
export async function resolveBrand(name: string, opts: { min?: number } = {}): Promise<{ best: Resolved | null; candidates: (BfHit & { score: number })[]; error?: string }> {
  const c = clientId();
  if (!c) return { best: null, candidates: [], error: "Λείπει το LOGOS_API_KEY." };
  const q = name.trim();
  if (q.length < 2) return { best: null, candidates: [] };
  let hits: BfHit[];
  try {
    const r = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(q)}?c=${c}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (r.status === 429) return { best: null, candidates: [], error: "rate" };
    if (!r.ok) return { best: null, candidates: [], error: `HTTP ${r.status}` };
    hits = (await r.json()) as BfHit[];
  } catch (e) { return { best: null, candidates: [], error: (e as Error).message }; }
  const scored = (Array.isArray(hits) ? hits : []).map((h) => ({ ...h, score: scoreHit(q, h) })).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const min = opts.min ?? 0.85; // πρακτικά: μόνο ακριβές domain
  if (!top || top.score < min) return { best: null, candidates: scored.slice(0, 5) };
  return { best: { domain: top.domain, name: top.name, score: top.score, verified: !!top.verified, logoCdn: logoUrl(top.domain) }, candidates: scored.slice(0, 5) };
}
