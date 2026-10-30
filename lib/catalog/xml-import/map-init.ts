import { clampMinFetch } from "@/lib/catalog/xml-import/cache-core";
import { transformValue, type MappingDraft, type SuggestDTO, type TemplateSettings } from "@/lib/catalog/xml-import/ui-core";

/**
 * Από πού ξεκινούν οι επιλογές του βήματος της αντιστοίχισης — καθαρές συναρτήσεις, έξω από το React.
 *
 * Υπάρχουν χωριστά για δύο λόγους. Πρώτον, οι ίδιες τιμές χρειάζονται **δύο φορές**: στην αρχική κατάσταση και όταν
 * φτάσει νέα πρόταση (ο χρήστης πάτησε «Αλλαγή αντιστοίχισης» ή γύρισε στον έλεγχο του feed) — και η δεύτερη φορά
 * είναι αυτή που λείπε: οι επιλογές έμεναν κολλημένες στην άδεια πρόταση της πρώτης απόδοσης και **καμία στήλη δεν
 * είχε στόχο**. Δεύτερον, είναι το σημείο όπου μπαίνει το αποθηκευμένο πρότυπο του προμηθευτή — και το **πρόχειρο**:
 * ό,τι είχε διαλέξει ο χρήστης στα ενδιάμεσα βήματα πριν φύγει από τη σελίδα κερδίζει την πρόταση, ανά στήλη και ανά
 * τιμή. Στήλη του προχείρου που δεν υπάρχει πια στο feed αγνοείται — ο προμηθευτής μπορεί να την έβγαλε στο μεταξύ.
 */

export type ValueKind = "brand" | "category" | "unit" | "mark";

type Draft = Partial<MappingDraft> | null | undefined;

/** Από το πρόχειρο μένουν μόνο οι στήλες που υπάρχουν ακόμη στο feed. */
const forCols = (s: SuggestDTO, d: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(d ?? {}).filter(([h]) => s.cols.some((c) => c.header === h)));

export const initTargets = (s: SuggestDTO, d?: Draft): Record<string, string> =>
  ({ ...Object.fromEntries(s.cols.map((c) => [c.header, c.target])), ...forCols(s, d?.targets) });

/** Η ετικέτα του χαρακτηριστικού: η δική μας ονομασία αν προτάθηκε, αλλιώς αυτή του feed. */
export const initLabels = (s: SuggestDTO, d?: Draft): Record<string, string> =>
  ({ ...Object.fromEntries(s.cols.map((c) => [c.header, (s.specs.find((x) => x.label === c.label)?.to ?? "") || c.label])), ...forCols(s, d?.labels) });

export const initTransforms = (s: SuggestDTO, d?: Draft): Record<string, string> =>
  ({ ...Object.fromEntries(s.cols.map((c) => [c.header, transformValue(c.transform)])), ...forCols(s, d?.transforms) });

export const initPicks = (s: SuggestDTO, d?: Draft): Record<ValueKind, Record<string, string | null>> => ({
  brand: { ...(s.maps?.brand ?? {}), ...(d?.brandMap ?? {}) },
  unit: { ...(s.maps?.unit ?? {}), ...(d?.unitMap ?? {}) },
  mark: { ...(s.maps?.mark ?? {}), ...(d?.markMap ?? {}) },
  category: { ...Object.fromEntries(s.cats.map((c) => [c.value, c.categoryId])), ...(d?.categoryMap ?? {}) },
});

/**
 * Η συμμετοχή των μαρκών από το πρόχειρο. Ό,τι δεν αναφέρεται εδώ αποφασίζεται όπως πάντα από την αντιστοίχισή του
 * (έχει δική μας μάρκα → μέσα, παράλειψη ή κενό → έξω), άρα ο χάρτης κρατά μόνο τις ρητές επιλογές του χρήστη.
 */
export const initBrandsOn = (d?: Draft): Record<string, boolean> =>
  Object.fromEntries((d?.brandsOn ?? []).map((v) => [v, true]));

export const initSettings = (s: SuggestDTO, d?: Draft): TemplateSettings => {
  const from = { ...(s.settings ?? {}), ...(d ?? {}) } as Partial<TemplateSettings>;
  return {
    priceMode: from.priceMode === "retail" ? "retail" : "cost",
    toSoftone: from.toSoftone ?? false,
    minFetchMin: clampMinFetch(from.minFetchMin ?? 30),
    unitId: from.unitId ?? null,
    markId: from.markId ?? null,
  };
};
