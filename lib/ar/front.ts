/**
 * Πώς μπαίνει η φωτογραφία στην πρόσοψη του στερεού AR, από τον λόγο πλευρών της (κομμένη στα όριά της):
 * - `face`: κατά μέτωπο (λόγος κοντά στο Π/Υ) — γεμίζει την έδρα
 * - `top`: από πάνω, για επίπεδες συσκευές (εστίες, σκούπες ρομπότ) — ταιριάζει με την πάνω έδρα Π×Β
 * - `billboard`: υπό γωνία, ή με σήμα/δώρο δίπλα της — μπαίνει ολόκληρη, χωρίς παραμόρφωση
 */
export type FrontMode = "face" | "billboard" | "top";
export function frontMode(aspect: number, faceAspect: number, forceFace = false, topAspect?: number): FrontMode {
  const errFace = Math.abs(Math.log(aspect / faceAspect));
  const errTop = topAspect && !forceFace ? Math.abs(Math.log(aspect / topAspect)) : Infinity;
  // Όταν τη διάλεξε ο διαχειριστής ως «όψη», γεμίζει πάντα την πρόσοψη
  return errTop < errFace && errTop <= 0.2 ? "top" : forceFace || errFace <= 0.12 ? "face" : "billboard";
}
