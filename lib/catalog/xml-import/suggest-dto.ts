import "server-only";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { encodeTarget } from "@/lib/catalog/foreign-import/ui-core";
import { parseFeed, CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";
import { suggestMapping, type SavedMapping } from "@/lib/catalog/xml-import/suggest";
import { MAX_VALUES, SAMPLES_SHOWN, type SuggestDTO, type TemplateMaps, type TemplateSettings } from "@/lib/catalog/xml-import/ui-core";

/** Οι διακριτές τιμές μιας στήλης — `null` όταν είναι πάρα πολλές για αντιστοίχιση τιμή-προς-τιμή. */
function valuesOf(matrix: string[][], i: number): string[] | null {
  const set = new Set<string>();
  for (let r = 1; r < matrix.length; r++) {
    const v = matrix[r][i];
    if (v) set.add(v);
    if (set.size > MAX_VALUES) return null;
  }
  return [...set].sort((a, b) => a.localeCompare(b, "el"));
}

/** Στήλες ταξινόμησης: μόνο αυτές παίρνουν πλήθος και παραδείγματα ανά τιμή (οι 74 στήλες του δείγματος δεν χωρούν). */
const CLASSIFY = new Set(["brand", "category", "unit", "mark"]);

/** Ανά τιμή της στήλης: πόσα προϊόντα την έχουν και έως τρία ονόματα προϊόντων, για να ξέρει ο χρήστης τι αντιστοιχίζει. */
function valueInfo(matrix: string[][], i: number, values: string[], productAt: (r: number) => string): Record<string, { n: number; ex: string[] }> {
  const out: Record<string, { n: number; ex: string[] }> = Object.fromEntries(values.map((v) => [v, { n: 0, ex: [] as string[] }]));
  for (let r = 1; r < matrix.length; r++) {
    const v = matrix[r][i];
    const slot = v ? out[v] : undefined;
    if (!slot) continue;
    slot.n++;
    const p = productAt(r);
    if (p && slot.ex.length < SAMPLES_SHOWN && !slot.ex.includes(p)) slot.ex.push(p);
  }
  return out;
}

/**
 * Το DTO του βήματος της αντιστοίχισης, από τα bytes του feed: κανόνες + AI μόνο για τα αβέβαια, και — για τις στήλες
 * ταξινόμησης — πόσα προϊόντα έχει κάθε τιμή και **ονόματα προϊόντων για παράδειγμα**.
 *
 * Ζει έξω από το server action ώστε να μπορεί να τρέξει και από script με τοπικό αντίγραφο του feed: ο server του
 * προμηθευτή απαντά 429 μετά από λίγες λήψεις.
 */
/** Το αποθηκευμένο πρότυπο του προμηθευτή, όταν ξανανοίγει η αντιστοίχιση ενός feed που έχει ήδη τρέξει. */
export interface TemplateInput {
  saved: SavedMapping;
  maps: TemplateMaps;
  settings: TemplateSettings;
}

export async function buildSuggestDTO(bytes: Buffer, tpl?: TemplateInput): Promise<SuggestDTO> {
  const parsed = parseFeed(bytes);
  if (!parsed.counts.products) throw new UserError("Το feed δεν έχει προϊόντα.");
  const { headers, matrix } = parsed;
  const s = await suggestMapping({ headers, matrix }, tpl?.saved);
  const catIdx = headers.indexOf(CATEGORY_PAIR);
  // Η στήλη με το όνομα (ή, αν δεν προτάθηκε, τον κωδικό): δίνει «από ποιο προϊόν» σε κάθε παράδειγμα.
  const isKind = (i: number, key: string) => { const t = s.columns[i]?.target; return t?.kind === "field" && t.key === key; };
  let nameIdx = headers.findIndex((_, i) => isKind(i, "name"));
  if (nameIdx < 0) nameIdx = headers.findIndex((_, i) => isKind(i, "code"));
  const productAt = (r: number) => (nameIdx >= 0 ? matrix[r][nameIdx] ?? "" : "");
  const catN = new Map<string, number>();
  if (catIdx >= 0) for (let r = 1; r < matrix.length; r++) { const v = matrix[r][catIdx]; if (v) catN.set(v, (catN.get(v) ?? 0) + 1); }
  return {
    cols: headers.map((header, i) => {
      const c = s.columns[i];
      const values = valuesOf(matrix, i);
      const samples: string[] = [], examples: string[] = [];
      for (let r = 1; r < matrix.length && samples.length < SAMPLES_SHOWN; r++) {
        const v = matrix[r][i];
        if (!v || samples.includes(v)) continue;
        samples.push(v); examples.push(productAt(r));
      }
      return {
        header,
        target: encodeTarget(c.target),
        label: c.target.kind === "spec" ? c.target.label : "",
        transform: c.transform,
        confidence: c.confidence,
        ...(c.why ? { why: c.why } : {}),
        samples, examples,
        values,
        ...(values && CLASSIFY.has(encodeTarget(c.target)) ? { valueInfo: valueInfo(matrix, i, values, productAt) } : {}),
      };
    }),
    cats: Object.entries(s.categories)
      .map(([value, c]) => ({ value, n: catN.get(value) ?? 0, categoryId: c.categoryId, confidence: c.confidence }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, "el")),
    specs: Object.entries(s.specs).map(([label, v]) => ({ label, to: v.label, confidence: v.confidence })).sort((a, b) => a.label.localeCompare(b.label, "el")),
    duplicates: s.duplicates,
    aiUsed: s.aiUsed,
    ...(tpl ? { fromTemplate: true, maps: tpl.maps, settings: tpl.settings } : {}),
  };
}

