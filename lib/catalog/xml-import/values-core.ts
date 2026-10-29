/**
 * Οι τιμές μιας στήλης του feed απέναντι στον αποθηκευμένο χάρτη — καθαρή λογική (χωρίς βάση).
 *
 * Το νόημα είναι η διάκριση ανάμεσα σε **καινούργια** τιμή και σε τιμή που ο χρήστης **είδε και άφησε κενή**: η πρώτη
 * είναι απόφαση που εκκρεμεί, η δεύτερη είναι απόφαση που πάρθηκε. Χωρίς αυτή τη διάκριση ο χρήστης θα έβλεπε για
 * πάντα τις ίδιες «αναντιστοίχιστες» κατηγορίες που επίτηδες δεν αντιστοίχισε.
 */

export interface ValueUse {
  value: string;
  /** πόσα προϊόντα του feed έχουν αυτή την τιμή */
  items: number;
}

/** mapped = δείχνει σε δική μας εγγραφή · ignored = ο χρήστης την άφησε ρητά κενή · new = δεν την έχει δει ποτέ */
export type ValueState = "mapped" | "ignored" | "new";

export interface ValueRow {
  value: string;
  items: number;
  state: ValueState;
  targetId: string | null;
}

const ORDER: Record<ValueState, number> = { new: 0, ignored: 1, mapped: 2 };

/**
 * Οι τιμές ταξινομημένες ώστε πρώτα να φαίνεται ό,τι περιμένει απόφαση, και μέσα σε αυτό ό,τι αφορά τα περισσότερα
 * προϊόντα. Η τιμή συγκρίνεται trimmed, όπως τη διαβάζει το `toRows`.
 */
export function classifyValues(uses: ValueUse[], map: Record<string, string | null>): ValueRow[] {
  const sum = new Map<string, number>();
  for (const u of uses) {
    const v = (u.value ?? "").trim();
    if (!v) continue;
    sum.set(v, (sum.get(v) ?? 0) + (u.items || 0));
  }
  return [...sum]
    .map(([value, items]): ValueRow => {
      // Object.hasOwn: τιμή «constructor» / «toString» δεν είναι ιδιότητα του prototype
      const has = Object.hasOwn(map, value);
      const id = has ? map[value] ?? null : null;
      return { value, items, state: has ? (id ? "mapped" : "ignored") : "new", targetId: id };
    })
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.items - a.items || a.value.localeCompare(b.value, "el"));
}

/** Πόσες τιμές και πόσα προϊόντα περιμένουν απόφαση του χρήστη. */
export function unmapped(rows: ValueRow[]): { values: number; items: number } {
  const neu = rows.filter((r) => r.state === "new");
  return { values: neu.length, items: neu.reduce((a, r) => a + r.items, 0) };
}
