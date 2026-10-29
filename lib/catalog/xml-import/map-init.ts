import { clampMinFetch } from "@/lib/catalog/xml-import/cache-core";
import { transformValue, type SuggestDTO, type TemplateSettings } from "@/lib/catalog/xml-import/ui-core";

/**
 * Από πού ξεκινούν οι επιλογές του βήματος της αντιστοίχισης — καθαρές συναρτήσεις, έξω από το React.
 *
 * Υπάρχουν χωριστά για δύο λόγους. Πρώτον, οι ίδιες τιμές χρειάζονται **δύο φορές**: στην αρχική κατάσταση και όταν
 * φτάσει νέα πρόταση (ο χρήστης πάτησε «Αλλαγή αντιστοίχισης» ή γύρισε στον έλεγχο του feed) — και η δεύτερη φορά
 * είναι αυτή που λείπε: οι επιλογές έμεναν κολλημένες στην άδεια πρόταση της πρώτης απόδοσης και **καμία στήλη δεν
 * είχε στόχο**. Δεύτερον, είναι το σημείο όπου μπαίνει το αποθηκευμένο πρότυπο του προμηθευτή.
 */

export type ValueKind = "brand" | "category" | "unit" | "mark";

export const initTargets = (s: SuggestDTO): Record<string, string> => Object.fromEntries(s.cols.map((c) => [c.header, c.target]));

/** Η ετικέτα του χαρακτηριστικού: η δική μας ονομασία αν προτάθηκε, αλλιώς αυτή του feed. */
export const initLabels = (s: SuggestDTO): Record<string, string> =>
  Object.fromEntries(s.cols.map((c) => [c.header, (s.specs.find((x) => x.label === c.label)?.to ?? "") || c.label]));

export const initTransforms = (s: SuggestDTO): Record<string, string> =>
  Object.fromEntries(s.cols.map((c) => [c.header, transformValue(c.transform)]));

export const initPicks = (s: SuggestDTO): Record<ValueKind, Record<string, string | null>> => ({
  brand: { ...(s.maps?.brand ?? {}) },
  unit: { ...(s.maps?.unit ?? {}) },
  mark: { ...(s.maps?.mark ?? {}) },
  category: Object.fromEntries(s.cats.map((c) => [c.value, c.categoryId])),
});

export const initSettings = (s: SuggestDTO): TemplateSettings => ({
  priceMode: s.settings?.priceMode === "retail" ? "retail" : "cost",
  toSoftone: s.settings?.toSoftone ?? false,
  minFetchMin: clampMinFetch(s.settings?.minFetchMin ?? 30),
  unitId: s.settings?.unitId ?? null,
  markId: s.settings?.markId ?? null,
});
