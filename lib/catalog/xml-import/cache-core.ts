/**
 * Πότε κατεβαίνει ξανά το feed και πότε αρκεί το αποθηκευμένο XML — καθαρή λογική (χωρίς βάση και δίκτυο).
 *
 * Οι προμηθευτές βάζουν όριο στις λήψεις: ο δοκιμασμένος (Estia) απαντά 429 μετά από δύο λήψεις την ώρα, και το όριο
 * κρατά αρκετά για να κολλήσει όλος ο οδηγός. Γι' αυτό κάθε λήψη αποθηκεύεται ακέραια (`FeedSnapshot`) και κάθε βήμα
 * που θέλει τα ίδια bytes τα παίρνει από εκεί. Το «πόσο συχνά» είναι ρύθμιση ανά feed, όχι σταθερά: ο επόμενος
 * προμηθευτής θα έχει άλλο όριο.
 */

export interface SnapshotInfo {
  fetchedAt: Date;
  bytes: number;
  products: number | null;
}

/** «reuse» = ό,τι έχουμε, χωρίς να αγγίξουμε τον προμηθευτή· «fresh» = νέα λήψη αν το όριο το επιτρέπει. */
export type FetchIntent = "reuse" | "fresh";

export interface FetchPlan {
  use: "snapshot" | "download";
  /** none = δεν υπάρχει αποθηκευμένο XML · reuse = ζητήθηκε ρητά · limit = το όριο δεν επιτρέπει λήψη · allowed = επιτρέπεται */
  reason: "none" | "reuse" | "limit" | "allowed";
  /** λεπτά μέχρι να επιτρέπεται νέα λήψη (0 = τώρα) */
  waitMin: number;
}

const DEFAULT_MIN = 30;
const MAX_MIN = 24 * 60;

/** Λεπτά που μένουν μέχρι να επιτρέπεται νέα λήψη. Στρογγυλοποίηση προς τα πάνω: «0 λεπτά» σημαίνει πάντα «τώρα». */
export function waitMinutes(now: Date, fetchedAt: Date | null, minFetchMin: number): number {
  if (!fetchedAt) return 0;
  const left = minFetchMin * 60_000 - (now.getTime() - fetchedAt.getTime());
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

/** Το όριο όπως το γράφει ο χρήστης, σε λογικά πλαίσια: 0 (χωρίς όριο) έως 24 ώρες. */
export function clampMinFetch(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_MIN;
  return Math.min(MAX_MIN, Math.max(0, Math.floor(n)));
}

export function planFetch(now: Date, snap: SnapshotInfo | null, opts: { minFetchMin: number; intent: FetchIntent }): FetchPlan {
  // Χωρίς αποθηκευμένο XML δεν υπάρχει εναλλακτική — και κανένα όριο δεν έχει χρησιμοποιηθεί ακόμη από εμάς.
  if (!snap) return { use: "download", reason: "none", waitMin: 0 };
  const waitMin = waitMinutes(now, snap.fetchedAt, opts.minFetchMin);
  if (opts.intent === "reuse") return { use: "snapshot", reason: "reuse", waitMin };
  return waitMin > 0 ? { use: "snapshot", reason: "limit", waitMin } : { use: "download", reason: "allowed", waitMin: 0 };
}
