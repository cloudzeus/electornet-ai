/**
 * Το πλέγμα κατηγοριών της αρχικής: κελιά που δείχνουν σε ΠΡΑΓΜΑΤΙΚΕΣ κατηγορίες του καταλόγου (id ή slug), με σειρά,
 * ορατότητα, προαιρετικό δικό μας τίτλο / μικρό κείμενο και ένα τονισμένο («focus»). Πλήθος προϊόντων και σύνδεσμος
 * από τον κατάλογο. Καθαρές συναρτήσεις (editor + βιτρίνα).
 */
export interface CategoryCell { ref: string; title?: string; meta?: string; hidden?: boolean }
export interface CatInfo { id: string; slug: string; name: string; count: number; path: string }
export interface GridCategory { id: string; no: string; slug: string; title: string; titleBreak?: [string, string]; count: number; meta?: string; featured?: boolean; children: never[] }

/** Τα εννέα κελιά του σχεδίου, πάνω σε πραγματικές κατηγορίες (τίτλοι όπως ήταν). */
export const DEFAULT_CELLS: CategoryCell[] = [
  { ref: "eikona-kai-ichos", title: "Τηλεοράσεις & Ήχος" },
  { ref: "klimatismos-thermansi", title: "Κλιματισμός & Θέρμανση", meta: "εποχική αιχμή" },
  { ref: "plyntiria-stegnotiria", title: "Πλυντήρια & Στεγνωτήρια", meta: "με εγκατάσταση" },
  { ref: "psygeia", title: "Ψυγεία & Καταψύκτες", meta: "A έως G" },
  { ref: "tilefonia", title: "Κινητά & Wearables" },
  { ref: "computing", title: "Laptops & Computing" },
  { ref: "oikiakos-exoplismos", title: "Καφές & Μαγειρική" },
  { ref: "skoypes", title: "Σκούπες & Καθαριότητα" },
  { ref: "prosopiki-frontida", title: "Προσωπική Φροντίδα" },
];
export const DEFAULT_FOCUS = "klimatismos-thermansi";
/** οι παλιοί κωδικοί του πεδίου «Τονισμένη κατηγορία» → κελί */
const OLD_FOCUS: Record<string, string> = { tv: "eikona-kai-ichos", clima: "klimatismos-thermansi", wash: "plyntiria-stegnotiria", fridge: "psygeia", mobile: "tilefonia", computing: "computing", coffee: "oikiakos-exoplismos", vacuum: "skoypes", care: "prosopiki-frontida" };

export function cellsOf(props: Record<string, unknown> | undefined): { cells: CategoryCell[]; focus: string } {
  const raw = Array.isArray(props?.cells) ? (props!.cells as CategoryCell[]) : null;
  const seen = new Set<string>();
  const cells = (raw ?? DEFAULT_CELLS).filter((c) => c && typeof c.ref === "string" && c.ref && !seen.has(c.ref) && seen.add(c.ref));
  // «focus» ορισμένο (ακόμη και κενό = χωρίς τονισμένο) υπερισχύει· αλλιώς το παλιό «featured» ή η προεπιλογή
  if (props && "focus" in props) { const f = String(props.focus ?? ""); return { cells, focus: OLD_FOCUS[f] ?? f }; }
  const f = String(props?.featured ?? "");
  return { cells, focus: OLD_FOCUS[f] ?? (f || DEFAULT_FOCUS) };
}

const NUM = ["μηδέν", "μία", "δύο", "τρεις", "τέσσερις", "πέντε", "έξι", "επτά", "οκτώ", "εννέα", "δέκα", "έντεκα", "δώδεκα"];
/** Ο τίτλος της ενότητας: δικός μας ή «…, σε εννέα κατηγορίες.» με τον αριθμό των ορατών κελιών. */
export function gridTitle(custom: unknown, n: number): string | [string, string] {
  const t = String(custom ?? "").trim();
  if (t) return t;
  return ["Ό,τι χρειάζεται το σπίτι σου,", `σε ${n === 1 ? "μία κατηγορία" : `${NUM[n] ?? n} κατηγορίες`}.`];
}

/** Κελιά → κατηγορίες του πλέγματος (μόνο ορατά και υπαρκτά, αρίθμηση 01, 02… με τη σειρά). */
export function gridCategories(cells: CategoryCell[], focus: string, find: (ref: string) => CatInfo | undefined): GridCategory[] {
  const out: GridCategory[] = [];
  for (const c of cells) {
    if (c.hidden) continue;
    const cat = find(c.ref);
    if (!cat || cat.count <= 0) continue;
    const title = c.title?.trim() || cat.name;
    const amp = title.indexOf(" & ");
    out.push({
      id: c.ref, no: String(out.length + 1).padStart(2, "0"), slug: cat.path, title,
      titleBreak: amp > 0 ? [title.slice(0, amp), title.slice(amp + 1)] : undefined,
      count: cat.count, meta: c.meta?.trim() || undefined, featured: c.ref === focus || cat.id === focus || cat.slug === focus, children: [],
    });
  }
  return out;
}
