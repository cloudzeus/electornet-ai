/**
 * Ποιο στοιχείο του μενού αντιστοιχεί στη διαδρομή: το **πιο ειδικό**.
 *
 * Με σκέτο `startsWith` το «/admin/softone/brand/logos» ενεργοποιούσε και τους
 * «Βασικούς πίνακες» (/admin/softone), οπότε φωτίζονταν δύο γραμμές και ο
 * τίτλος της σελίδας έβγαινε λάθος. Ταιριάζουμε σε όριο διαδρομής και κρατάμε
 * τον μακρύτερο σύνδεσμο.
 */
export const matchesPath = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

export function bestMatch<T extends { href: string }>(path: string, items: T[]): T | undefined {
  return items.filter((i) => matchesPath(path, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
}
