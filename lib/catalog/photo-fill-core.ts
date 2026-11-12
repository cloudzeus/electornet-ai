/**
 * Μαζική συμπλήρωση φωτογραφιών σε προϊόντα που δεν έχουν καμία — η καθαρή λογική (χωρίς βάση και χωρίς δίκτυο):
 * ποια πηγή προηγείται, ποια εικόνα είναι όντως φωτογραφία προϊόντος και πόσες παίρνει κάθε προϊόν.
 *
 * Γιατί μετράει: η βιτρίνα απαιτεί ρητά τουλάχιστον μία ορατή φωτογραφία (`LISTED` στο lib/data/db-catalog.ts), άρα
 * ένα προϊόν χωρίς φωτογραφία δεν φαίνεται καθόλου — το πέρασμα αυτό ξεκλειδώνει προϊόντα, δεν τα ομορφαίνει.
 *
 * Σειρά πηγών: Icecat (επίσημη γκαλερί) → σελίδα κατασκευαστή → Channel3 → άλλα καταστήματα. Τα καταστήματα
 * τελευταία: οι φωτογραφίες τους έχουν συχνά υδατογραφήματα και δικαιώματα τρίτων.
 *
 * Φραγμοί πριν αποθηκευτεί εικόνα:
 *  - (ΠΑΛΙΟ — από 10/11/2026 μετράει μόνο η μεγάλη πλευρά ≥ 600, βλ. checkImage) και οι δύο πλευρές ≥ 600 px — αυστηρότερο από το `LOW_RES_PX`, που κοιτάζει
 *    μόνο τη μεγάλη πλευρά. Δεν είναι ασυνέπεια και δεν «διορθώνεται»: ο έλεγχος πληρότητας κρίνει φωτογραφίες που
 *    ΗΔΗ μπήκαν (εκεί μια μέτρια εικόνα είναι καλύτερη από καμία), εδώ κρίνουμε τι ΑΞΙΖΕΙ να μπει αυτόματα, χωρίς να
 *    το δει άνθρωπος. Μια εικόνα 662 × 200 περνά το 600 στη μεγάλη πλευρά και θα καθόταν ως κύρια φωτογραφία
 *    προϊόντος· λίγες εικόνες παραπάνω δεν αξίζουν αυτό το ρίσκο. Πόσες χάνονται από την αυστηρότητα το λέει η
 *    σύνοψη του `scripts/fill-photos.ts` σε κάθε πέρασμα — εκεί φαίνεται αν αξίζει να ξανασυζητηθεί·
 *  - αναλογία ώς 3:1 — ό,τι πιο στενό είναι banner, κορδέλα ή κολλάζ·
 *  - όχι GIF / SVG (ούτε ό,τι δεν είναι εικόνα)·
 *  - όχι αρχεία κάτω από 10 KB: λογότυπα, εικονίδια, placeholders «δεν υπάρχει φωτογραφία»·
 *  - άγνωστες διαστάσεις (δεν διαβάστηκαν) σημαίνει ότι δεν ξέρουμε τι αποθηκεύουμε — δεν μπαίνει·
 *  - ώς 6 φωτογραφίες ανά προϊόν σε αυτό το πέρασμα· η ίδια διεύθυνση μετράει μία.
 * Ό,τι κόβεται πάει σε λίστα «θέλει μάτι» με τον λόγο — δεν αποθηκεύεται και δεν σβήνεται.
 */
export const MAX_PER_PRODUCT = 6;
export const MIN_SIDE_PX = 600;
export const MAX_ASPECT = 3;
export const MIN_BYTES = 10_240;

/** Σειρά προτίμησης πηγών για φωτογραφίες (οι τιμές `EnrichSuggestion.source`). */
export const PHOTO_SOURCES = ["icecat", "web", "channel3", "kotsovolos", "shop"] as const;
export const sourceRank = (source: string) => { const i = (PHOTO_SOURCES as readonly string[]).indexOf(source); return i < 0 ? PHOTO_SOURCES.length : i; };

/** Ό,τι μάθαμε για μια εικόνα κατεβάζοντάς την (null = δεν κατέβηκε, βλ. `error`). */
export interface PhotoProbe { bytes: number; width: number | null; height: number | null; mime: string; /** μερίδιο (0–1) των pixel της περιμέτρου που είναι λευκά / ανοιχτό γκρι / διάφανα — null αν δεν μετρήθηκε */ plainEdge?: number | null }
/** κάτω από αυτό το μερίδιο «καθαρής» περιμέτρου η εικόνα έχει χρωματιστό φόντο ή σκηνικό: banner / lifestyle, όχι φωτογραφία καταλόγου */
export const MIN_PLAIN_EDGE = 0.6;
/** Το pixel (RGBA) είναι «καθαρό φόντο»: διάφανο, ή ανοιχτό (≥ 200) και άχρωμο (διαφορά καναλιών ≤ 24). */
export const plainPixel = (r: number, g: number, b: number, a = 255) => a < 32 || (Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 24);
export interface PhotoCandidate {
  /** η γραμμή `EnrichSuggestion` */
  id: string;
  source: string;
  url: string;
  sourceName: string | null;
  probe: PhotoProbe | null;
  error?: string;
}
export interface PhotoPick { take: PhotoCandidate[]; review: { url: string; source: string; reason: string; probe: PhotoProbe | null }[]; over: number; duplicates: number }

/** Είναι αποθηκεύσιμη φωτογραφία προϊόντος; Επιστρέφει τον λόγο απόρριψης, ή null. */
export function checkImage(p: PhotoProbe): string | null {
  const mime = p.mime.toLowerCase();
  if (!mime.startsWith("image/")) return `δεν είναι εικόνα (${mime || "άγνωστος τύπος"})`;
  if (mime.includes("gif")) return "GIF: δεν γίνεται φωτογραφία προϊόντος";
  if (mime.includes("svg")) return "SVG: δεν γίνεται φωτογραφία προϊόντος";
  if (p.bytes < MIN_BYTES) return `${Math.round(p.bytes / 1024)} KB — κάτω από ${MIN_BYTES / 1024} KB είναι λογότυπο ή placeholder`;
  if (p.width == null || p.height == null) return "δεν διαβάστηκαν οι διαστάσεις της εικόνας";
  const small = Math.min(p.width, p.height), big = Math.max(p.width, p.height);
  // μόνο η μεγάλη πλευρά, όπως ο έλεγχος πληρότητας (απόφαση χρήστη 10/11/2026: οι φωτογραφίες κατασκευαστών 952×535 είναι
  // μια χαρά, ενώ ο αυστηρός πήχης άφηνε να περάσουν μόνο τα banners 1920×1080)· τις λωρίδες τις κόβει η αναλογία
  if (big < MIN_SIDE_PX) return `${p.width} × ${p.height} px — η μεγάλη πλευρά θέλει ${MIN_SIDE_PX} px`;
  if (p.plainEdge != null && p.plainEdge < MIN_PLAIN_EDGE) return `χρωματιστό φόντο (${Math.round(p.plainEdge * 100)}% λευκή περίμετρος) — μάλλον banner ή σκηνικό, όχι φωτογραφία καταλόγου`;
  if (big / small > MAX_ASPECT) return `${p.width} × ${p.height} px — αναλογία ${(big / small).toFixed(1)}:1, είναι λωρίδα και όχι φωτογραφία προϊόντος`;
  return null;
}

/**
 * Το όνομα του αρχείου λέει ότι ΔΕΝ είναι φωτογραφία προϊόντος (σχέδιο διαστάσεων, ενεργειακή ετικέτα, λογότυπο…).
 * Οι σελίδες κατασκευαστών τα δίνουν σε υψηλή ανάλυση, άρα περνούν όλους τους άλλους ελέγχους — και ένα σχέδιο
 * διαστάσεων έγινε κύρια φωτογραφία (TEKA TBC 64010, 10/11/2026). Επιστρέφει τον λόγο, ή null.
 */
const NON_PHOTO = /(?:^|[^a-z])(drawings?|dimensions?|dims?|technical|tech|schemas?|schematics?|sketch|line-?art|outline|cut-?out-?size|installation|energy|eprel|label|fiche|logos?|icons?|badge)(?:[^a-z]|$)/i;
export function nonPhotoName(url: string): string | null {
  let name: string;
  try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? ""); } catch { return null; }
  const m = NON_PHOTO.exec(name.replace(/\.\w{3,4}$/, ""));
  return m ? `το όνομα «${name.slice(0, 60)}» δείχνει ${m[1].toLowerCase()}, όχι φωτογραφία προϊόντος` : null;
}

/** Ποιες φωτογραφίες παίρνει ένα προϊόν, με τη σειρά που θα μπουν στη γκαλερί. */
export function pickPhotos(cands: PhotoCandidate[]): PhotoPick {
  const sorted = [...cands].sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
  const take: PhotoCandidate[] = [], review: PhotoPick["review"] = [];
  const seen = new Set<string>();
  let over = 0, duplicates = 0;
  for (const c of sorted) {
    const key = c.url.trim().toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    const reason = nonPhotoName(c.url) ?? (c.probe ? checkImage(c.probe) : c.error ?? "δεν κατέβηκε");
    if (reason) { review.push({ url: c.url, source: c.source, reason, probe: c.probe }); continue; }
    if (take.length >= MAX_PER_PRODUCT) { over++; continue; }
    take.push(c);
  }
  return { take, review, over, duplicates };
}
