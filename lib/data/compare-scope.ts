import type { Product } from "./types";

/**
 * Η σύγκριση έχει νόημα μόνο μέσα στον ίδιο τύπο προϊόντος. Η εμβέλεια είναι η διαδρομή της κατηγορίας
 * («leykes-syskeyes/plyntiria-stegnotiria/plyntiria-roychon»): προϊόν άλλης εμβέλειας ξεκινά νέα σύγκριση,
 * και όταν ο πελάτης ανοίξει άλλη κατηγορία η σύγκριση αδειάζει.
 */
export const compareScope = (p: Pick<Product, "path" | "category" | "subcategory">) => (p.path?.length ? p.path.map((c) => c.slug).join("/") : `${p.category}/${p.subcategory}`);

/** Είναι η σελίδα κατηγορίας `/k/...` μέσα στην εμβέλεια (η ίδια ή πρόγονός της); */
export const insideScope = (scope: string, kPath: string) => scope === kPath || scope.startsWith(`${kPath}/`);
