import { slugify } from "@/lib/slug";

/**
 * Ονοματοδοσία των φωτογραφιών του παλιού site (μετρημένη σε 33.702 αρχεία):
 *
 *   <κλειδί>_<μοντέλο>-<NNN>_EURONICS.<jpg|jpeg|png>
 *   0074108020680_WW11DB8B95GHU4-001_EURONICS.jpg
 *
 * - κλειδί: το barcode του είδους (EAN-13 στο 92 %· ενίοτε 8–14 ψηφία με μηδενικά μπροστά) ή, σπάνια, ο κωδικός είδους
 * - μοντέλο: ελεύθερο κείμενο, με κενά και ελληνικά («Tab E7 Μάυρο»)
 * - NNN: αύξων αριθμός· 001 είναι η κύρια φωτογραφία. 121 αρχεία έχουν «_NNN» αντί για «-NNN».
 *   Λίγα (~30) έχουν «-001 new» / «νεο» = νεότερη λήψη του ίδιου προϊόντος, ή ορθογραφικά («EURONCS», «__EURONICS»).
 */
export interface ParsedImageName { sourceFile: string; key: string; model: string; seq: number; ext: string; isNew: boolean }

const NAME = /^([^_]+)_(.+?)\s*[-_](\d{3})(\s*(?:new|νεο|νέο))?\s*_+EURON?I?CS\s*\.(jpe?g|png|webp)$/i;

export function parseImageName(sourceFile: string): ParsedImageName | null {
  const m = NAME.exec(sourceFile.normalize("NFC"));
  return m ? { sourceFile, key: m[1].trim(), model: m[2].trim(), seq: Number(m[3]), isNew: !!m[4], ext: m[5].toLowerCase() } : null;
}

/** Όπου ένα προϊόν έχει και «new» λήψη, κρατάμε μόνο αυτήν — αλλιώς θα εμφανίζονταν διπλές φωτογραφίες, παλιές και νέες μαζί. */
export function preferNew(list: ParsedImageName[]): ParsedImageName[] {
  const withNew = new Set(list.filter((p) => p.isNew).map((p) => p.key));
  return list.filter((p) => p.isNew || !withNew.has(p.key));
}

/** Διαδρομή στο Bunny: ανά κλειδί (ένα barcode που το μοιράζονται δύο είδη ανεβαίνει μία φορά), με το μοντέλο στο όνομα αρχείου για την αναζήτηση εικόνων. */
export function bunnyPaths(p: ParsedImageName) {
  const dir = `products/${slugify(p.key) || "x"}`;
  const base = `${slugify(p.model).slice(0, 60).replace(/-+$/, "") || "image"}-${String(p.seq).padStart(2, "0")}`;
  return { main: `${dir}/${base}.webp`, thumb: `${dir}/${base}-480.webp` };
}

/** Τα barcodes συγκρίνονται χωρίς τα μηδενικά μπροστά: ο φάκελος έχει «0074108020680», το ERP «74108020680». */
export const bareKey = (s: string) => s.trim().replace(/^0+/, "");
export const modelKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
