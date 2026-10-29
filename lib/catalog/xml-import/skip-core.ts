/**
 * «Αυτή τη μάρκα δεν τη θέλουμε» — καθαρή λογική (χωρίς βάση).
 *
 * Κάθε μάρκα του feed πρέπει να δείχνει σε δική μας, αλλιώς ο οδηγός δεν προχωρά: χωρίς μάρκα ένα νέο είδος δεν
 * μπορεί να γεννηθεί. Ο προμηθευτής όμως φέρνει και μάρκες που απλώς **δεν πουλάμε** — και μέχρι τώρα ο μόνος τρόπος
 * να προχωρήσεις ήταν να φτιάξεις δική μας μάρκα για κάτι που δεν θα μπει ποτέ. Η παράλειψη είναι η τρίτη απάντηση:
 * απόφαση, όχι εκκρεμότητα, και τα προϊόντα της δεν φτάνουν ποτέ στην ουρά.
 */

/** Η επιλογή «παράλειψη» όπως ταξιδεύει από το UI. Δεν αποθηκεύεται ποτέ ως τιμή του χάρτη μαρκών. */
export const SKIP = "__skip__";

/**
 * Ο χάρτης του UI σε αυτό που αποθηκεύεται: οι παραλειπόμενες μάρκες γίνονται δική τους λίστα και στον χάρτη μένουν
 * ως `null`. Το `null` είναι σημαντικό — σημαίνει «την είδα και αποφάσισα», άρα η μάρκα δεν ξαναβγαίνει ως καινούργια.
 */
export function splitBrandMap(map: Record<string, string | null>): { brandMap: Record<string, string | null>; skipBrands: string[] } {
  const brandMap: Record<string, string | null> = {};
  const skipBrands: string[] = [];
  for (const [value, id] of Object.entries(map ?? {})) {
    if (id !== SKIP) { brandMap[value] = id ?? null; continue; }
    brandMap[value] = null;
    if (value.trim()) skipBrands.push(value);
  }
  return { brandMap, skipBrands };
}

/** Το αντίστροφο, για να ξαναδεί ο χρήστης την απόφασή του όταν ανοίξει το πρότυπο. */
export function mergeBrandMap(brandMap: Record<string, string | null>, skipBrands: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = { ...(brandMap ?? {}) };
  for (const v of skipBrands ?? []) out[v] = SKIP;
  return out;
}

/** Καταστάσεις που ανήκουν στην ουρά ή στο αποτέλεσμά της: η παράλειψη δεν τις αγγίζει. */
const LOCKED = new Set(["queued", "importing", "done", "error"]);

/**
 * Η νέα κατάσταση μιας γραμμής, ή `null` όταν δεν χρειάζεται αλλαγή (ώστε να μη γράφουμε άσκοπα 2.500 γραμμές).
 * `current === null` σημαίνει καινούργια γραμμή.
 */
export function statusFor(current: string | null, opts: { problem: boolean; skip: boolean }): string | null {
  if (current === null) return opts.problem ? "error" : opts.skip ? "skipped" : "review";
  if (LOCKED.has(current)) return null;
  if (opts.skip) return current === "skipped" ? null : "skipped";
  return current === "skipped" ? "review" : null;
}
