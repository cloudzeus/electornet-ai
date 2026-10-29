import "server-only";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { UserError } from "@/lib/catalog/foreign-import/core";

/** Η λήψη του feed από τον προμηθευτή — χωριστά από το `feed.ts`, ώστε να τη χρησιμοποιεί και το `snapshot.ts`. */

/** Όριο λήψης feed. Το δείγμα της Estia είναι 6,8 MB· 40 MB καλύπτει πολύ μεγαλύτερους καταλόγους. */
export const MAX_FEED_BYTES = 40 * 1024 * 1024;
const FEED_TIMEOUT_MS = 120_000;

/** Ο προμηθευτής είπε «πάρα πολλά αιτήματα». Ξεχωριστή κλάση: ο καλών γυρίζει στο αποθηκευμένο XML αντί να αποτύχει. */
export class RateLimited extends UserError {
  constructor(message: string) { super(message); this.name = "RateLimited"; }
}

export async function downloadFeed(url: string): Promise<Buffer> {
  const { bytes } = await fetchPublicBytes(url, { max: MAX_FEED_BYTES, accept: "application/xml,text/xml,*/*", timeoutMs: FEED_TIMEOUT_MS }).catch((e) => {
    const msg = e instanceof Error ? e.message : "άγνωστο σφάλμα";
    // Δοκιμασμένο: δύο λήψεις στη σειρά από την Estia → 429, και κρατά. Να το καταλαβαίνει ο χρήστης ως «περίμενε».
    if (/\b429\b/.test(msg)) throw new RateLimited("Ο προμηθευτής απάντησε «πάρα πολλά αιτήματα» (429) — έχει όριο στις λήψεις.");
    throw new UserError(`Δεν κατέβηκε το feed: ${msg}`);
  });
  return bytes;
}
