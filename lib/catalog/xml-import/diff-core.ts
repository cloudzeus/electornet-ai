/**
 * Επανάληψη τρεξίματος του feed — καθαρή λογική (χωρίς βάση, δίκτυο ή server-only).
 *
 * Δύο κανόνες που κρατούν τη δουλειά του χρήστη ασφαλή:
 * - **Τίποτα δεν χάνεται σιωπηλά.** Προϊόν χωρίς SKU ή με SKU που ξαναήρθε δεν πετιέται: επιστρέφεται με `problem` και
 *   τη θέση του στο feed, ώστε να φαίνεται στη λίστα και να διορθώνεται.
 * - **Οι διορθώσεις του χρήστη κερδίζουν.** Σε σύγκρουση με το feed υπερισχύει η δική του τιμή και επιστρέφεται
 *   `conflict`, ώστε το modal να δείξει και τις δύο και να μπορεί να το ξανακρίνει.
 */

export type Diff = "new" | "changed" | "same" | "gone";

export interface DiffRow {
  sku: string;
  /** θέση στο feed (1-based) — `null` για τα `gone`, που δεν ήρθαν καθόλου */
  pos: number | null;
  diff: Diff;
  /** εμποδίζει την εισαγωγή: χωρίς SKU, ή διπλό SKU */
  problem?: string;
}

/** Ίδιο περιεχόμενο: ίδια κλειδιά με ίδιες τιμές (η σειρά δεν μετράει). */
function samePayload(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}

/**
 * Τι άλλαξε από το προηγούμενο τρέξιμο. Μία εγγραφή ανά εισερχόμενο προϊόν (ακόμη και προβληματικό) συν μία ανά
 * υπάρχον που δεν ήρθε (`gone`). Το `gone` είναι **μόνο ένδειξη** — ο καλών δεν αποκρύπτει και δεν απενεργοποιεί τίποτα.
 */
export function diffItems(
  incoming: { sku: string; payload: Record<string, string>; pos: number }[],
  existing: { sku: string; payload: Record<string, string> }[],
): DiffRow[] {
  const was = new Map(existing.map((e) => [e.sku, e.payload]));
  const seenAt = new Map<string, number>();
  const rows: DiffRow[] = [];

  for (const it of incoming) {
    const sku = it.sku.trim();
    if (!sku) {
      // Η θέση δεν είναι σταθερό κλειδί ανάμεσα σε τρεξίματα — σκόπιμα: η γραμμή είναι πρόβλημα προς διόρθωση, όχι προϊόν.
      rows.push({ sku: `#${it.pos}`, pos: it.pos, diff: "new", problem: `Το προϊόν στη θέση ${it.pos} δεν έχει SKU — χωρίς αυτό δεν μπορεί να εισαχθεί ούτε να ξαναβρεθεί.` });
      continue;
    }
    const first = seenAt.get(sku);
    if (first != null) {
      rows.push({ sku, pos: it.pos, diff: "new", problem: `Το SKU «${sku}» υπάρχει και στη θέση ${first} του feed — κρατήθηκε το πρώτο.` });
      continue;
    }
    seenAt.set(sku, it.pos);
    const before = was.get(sku);
    rows.push({ sku, pos: it.pos, diff: before === undefined ? "new" : samePayload(before, it.payload) ? "same" : "changed" });
  }

  for (const e of existing) if (!seenAt.has(e.sku)) rows.push({ sku: e.sku, pos: null, diff: "gone" });
  return rows;
}

export interface MergeResult {
  merged: Record<string, string>;
  /** πεδία όπου η διόρθωση του χρήστη διαφέρει από το feed — το modal δείχνει και τα δύο */
  conflicts: { key: string; mine: string; feed: string }[];
}

/**
 * Το payload του feed με τις διορθώσεις του χρήστη από πάνω. Σε διαφορά κερδίζει η διόρθωση, αλλά η διαφορά
 * επιστρέφεται ως `conflict`: ο χρήστης βλέπει ότι ο προμηθευτής άλλαξε κάτι που είχε πειράξει.
 */
export function mergeEdits(payload: Record<string, string>, edits: Record<string, string> | null): MergeResult {
  if (!edits) return { merged: { ...payload }, conflicts: [] };
  const merged = { ...payload, ...edits };
  const conflicts: { key: string; mine: string; feed: string }[] = [];
  for (const [key, mine] of Object.entries(edits)) {
    const feed = payload[key];
    if (feed !== undefined && feed !== mine) conflicts.push({ key, mine, feed });
  }
  return { merged, conflicts };
}
