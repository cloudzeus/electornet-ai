/**
 * **Διαφορετικά προϊόντα με το ίδιο όνομα** — καθαρή λογική (χωρίς βάση ή δίκτυο).
 *
 * Γιατί υπάρχει: κάποιοι προμηθευτές δίνουν στο ίδιο εμπορικό όνομα περισσότερες από μία γραμμές, με δικό τους κωδικό
 * και barcode η καθεμία. Επαληθευμένο στο Keyvoto της Inventor: η **εσωτερική** και η **εξωτερική** μονάδα ενός split
 * λέγονται και οι δύο «Inventor Emperor EMPVI-12WFI/EMPVO-12 Κλιματιστικό 12.000 BTU/h» (9,5 kg και 30 kg).
 *
 * Δεν είναι λάθος — είναι δύο υπαρκτά είδη — γι' αυτό **δεν μπλοκάρει**: απλώς ειδοποιεί, ώστε να μη βρεθεί ο χρήστης
 * με δύο προϊόντα με πανομοιότυπο τίτλο στη βιτρίνα χωρίς να το περιμένει.
 */

export interface SameNameGroup {
  /** το όνομα όπως ήρθε (καθαρισμένο από περιττά διαστήματα) */
  name: string;
  /** τα κλειδιά των γραμμών που το μοιράζονται, με τη σειρά του feed */
  keys: string[];
}

const tidy = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
const key = (s: string) => tidy(s).toLocaleLowerCase("el-GR");

/**
 * Ομάδες γραμμών που μοιράζονται όνομα αλλά έχουν διαφορετικό κλειδί. Ίδιο όνομα **και** ίδιο κλειδί είναι η ίδια
 * γραμμή δύο φορές — άλλο πρόβλημα, το πιάνει το διπλό SKU. Επιστρέφονται από τη μεγαλύτερη ομάδα και προς τα κάτω.
 */
export function sameNameGroups(rows: { name: string; key: string }[], max = 5): SameNameGroup[] {
  const by = new Map<string, SameNameGroup>();
  for (const r of rows ?? []) {
    const k = key(r.name);
    if (!k) continue;
    const g = by.get(k) ?? { name: tidy(r.name), keys: [] };
    if (!g.keys.includes(r.key)) g.keys.push(r.key);
    by.set(k, g);
  }
  return [...by.values()].filter((g) => g.keys.length > 1).sort((a, b) => b.keys.length - a.keys.length).slice(0, Math.max(0, max));
}
