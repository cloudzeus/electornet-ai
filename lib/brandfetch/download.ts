import "server-only";
import { logoUrl } from "./resolve";

/**
 * Λήψη του λογοτύπου μιας μάρκας ώστε να φιλοξενηθεί **στο δικό μας** Bunny CDN.
 *
 * Γίνεται ΜΟΝΟ μετά από ρητή έγκριση του διαχειριστή για τη συγκεκριμένη
 * μάρκα: ο διαχειριστής βλέπει την εικόνα και το domain και επιβεβαιώνει ότι
 * είναι όντως η μάρκα μας. Έτσι δεν σαρώνουμε μαζικά το ευρετήριο και το
 * κατάστημα δεν εξαρτάται από ξένο CDN για κάτι που δείχνει σε κάθε σελίδα.
 *
 * Σημείωση για τον πελάτη: οι όροι του Brandfetch μιλούν για hotlink στο δικό
 * τους CDN· η αποθήκευση αντιγράφου είναι απόφαση του καταστήματος. Τα ίδια
 * τα λογότυπα ανήκουν στους κατασκευαστές, όχι στο Brandfetch.
 */
export interface LogoBytes { bytes: Buffer; mime: string; ext: string; from: string }

const TYPES = ["logo", "symbol", "icon"] as const;

/**
 * Το CDN του Brandfetch σερβίρει την εικόνα μόνο σε αίτημα που μοιάζει με
 * φυλλομετρητή· διαφορετικά γυρίζει τη σελίδα του με κωδικό 200. Στέλνουμε
 * λοιπόν τις ίδιες κεφαλίδες που θα έστελνε ο browser του πελάτη όταν
 * φορτώνει το ίδιο ακριβώς URL μέσα από τη σελίδα μας.
 */
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
} as const;
const FORMATS: { format: "svg" | "png"; mime: string; ext: string }[] = [
  { format: "svg", mime: "image/svg+xml", ext: "svg" }, // διανυσματικό: καθαρό σε κάθε μέγεθος
  { format: "png", mime: "image/png", ext: "png" }, // με διαφάνεια
];

/**
 * Τι είναι πραγματικά αυτά τα bytes.
 *
 * Το CDN του Brandfetch δεν απαντά πάντα με εικόνα: σε λάθος διαδρομή ή όταν
 * μπλοκάρει το αίτημα σερβίρει HTML (σελίδα όρων) με κωδικό 200 και
 * content-type εικόνας. Αν το δώσουμε στο sharp σκάει («corrupt header»), οπότε
 * ελέγχουμε την υπογραφή του αρχείου πριν το αποθηκεύσουμε.
 */
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.toString("latin1", 0, 6) === "GIF89a" || buf.toString("latin1", 0, 6) === "GIF87a") return { mime: "image/gif", ext: "gif" };
  const head = buf.toString("utf8", 0, 512).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return null; // σελίδα, όχι εικόνα
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && buf.toString("utf8", 0, 4096).toLowerCase().includes("<svg")) return { mime: "image/svg+xml", ext: "svg" };
  return null;
}

/**
 * Προτεραιότητα: πλήρες λογότυπο → σήμα → εικονίδιο, και για κάθε ένα πρώτα
 * διανυσματικό και μετά PNG. Το ολόκληρο λογότυπο σε PNG είναι πιο χρήσιμο
 * στη λίστα μαρκών από ένα τετράγωνο εικονίδιο σε SVG.
 */
export async function fetchLogoBytes(domain: string, opts: { w?: number; h?: number } = {}): Promise<LogoBytes | null> {
  const w = opts.w ?? 512, h = opts.h ?? 512;
  for (const type of TYPES) {
    for (const f of FORMATS) {
      const url = logoUrl(domain, { type, w, h, format: f.format });
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: BROWSER_HEADERS });
        if (!r.ok) continue; // «fallback/404»: το Brandfetch δεν έχει αυτόν τον τύπο
        const bytes = Buffer.from(await r.arrayBuffer());
        const kind = sniffImage(bytes);
        if (!kind) continue; // HTML ή σκουπίδια — δοκίμασε τον επόμενο συνδυασμό
        return { bytes, mime: kind.mime, ext: kind.ext, from: `${type}.${f.format}` };
      } catch { /* επόμενος συνδυασμός */ }
    }
  }
  return null;
}
