/** Ελληνικά → λατινικό slug (ίδιο παντού: καταστήματα, κατηγορίες, προϊόντα). */
export const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[άα]/g, "a").replace(/[έε]/g, "e").replace(/[ήη]/g, "i").replace(/[ίϊΐι]/g, "i").replace(/[όο]/g, "o").replace(/[ύϋΰυ]/g, "y").replace(/[ώω]/g, "o").replace(/β/g, "v").replace(/γ/g, "g").replace(/δ/g, "d").replace(/ζ/g, "z").replace(/θ/g, "th").replace(/κ/g, "k").replace(/λ/g, "l").replace(/μ/g, "m").replace(/ν/g, "n").replace(/ξ/g, "x").replace(/π/g, "p").replace(/ρ/g, "r").replace(/[σς]/g, "s").replace(/τ/g, "t").replace(/φ/g, "f").replace(/χ/g, "ch").replace(/ψ/g, "ps").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Slug από δυναμική διαδρομή. Ελληνικά slug (π.χ. «δαμκαλιδης», από ονόματα του ERP) φτάνουν σε κάποιες διαδρομές
 * κωδικοποιημένα (%CE%B4…) και η αναζήτηση στη βάση δεν τα βρίσκει → 404. Αποκωδικοποιούμε μία φορά, μόνο όταν
 * χρειάζεται· άκυρη κωδικοποίηση μένει ως έχει.
 */
export function decodeSlug(raw: string): string {
  if (!raw.includes("%")) return raw;
  try { return decodeURIComponent(raw); } catch { return raw; }
}
