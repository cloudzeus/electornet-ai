import type { Product } from "@/lib/data/types";

const flat = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Είδος συσκευής (κλειδιά του πίνακα κατανάλωσης: psygeia, plyntiria, …) από τις κατηγορίες του προϊόντος — null όταν
 * η «αντικατάσταση παλιάς συσκευής» δεν έχει νόημα (π.χ. αξεσουάρ, μικροσυσκευές).
 */
export function kindOfProduct(p: Pick<Product, "path">): string | null {
  const t = flat((p.path ?? []).map((x) => x.name).join(" / "));
  if (/αξεσουαρ|ανταλλακτικ|βαση |βασεις|καλωδι/.test(t)) return null;
  if (/πλυντηρια πιατων|πλυντηριο πιατων/.test(t)) return "plyntiria-piaton";
  if (/στεγνωτ/.test(t)) return "stegnotiria";
  if (/πλυντηρι/.test(t)) return "plyntiria";
  if (/ψυγει|καταψυκτ/.test(t)) return "psygeia";
  if (/κλιματιστ/.test(t)) return "air-condition";
  if (/τηλεορασ/.test(t)) return "tileoraseis";
  if (/κουζιν|φουρν/.test(t)) return "koyzines";
  return null;
}
