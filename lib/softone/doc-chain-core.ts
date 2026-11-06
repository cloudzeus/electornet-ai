/**
 * Αλυσίδα μετασχηματισμών ενός παραστατικού (παραγγελία → δελτίο → απόδειξη/τιμολόγιο …). ΜΟΝΟ αναγνώσεις.
 * Δύο σύνδεσμοι, και οι δύο δείχνουν προς τα πίσω:
 * - `MTRLINES.FINDOCS`: η γραμμή του νέου παραστατικού δείχνει το παραστατικό προέλευσης (μετασχηματισμός του SoftOne).
 * - `FINDOC.CCCFINDOCS`: δικό μας πεδίο, δείχνει κατευθείαν την αρχική παραγγελία (π.χ. 7315 e-ΑΛ → 7005).
 * Περπάτημα ανά επίπεδο με `IN (...)` σε πακέτα: οι κλήσεις μεγαλώνουν με το βάθος, όχι με το πλήθος.
 */
export type GetTable = (table: string, fields: string[], filter: string) => Promise<string[][]>;

export interface ChainDoc {
  findoc: number; series: number; fincode: string; date: string;
  /** FINDOC.FULLYTRANSF ($TransState): 0 = όχι, 1 = πλήρως, 2 = μερικώς */
  fullyTransf: number | null;
  /** από πού προήλθε (MTRLINES.FINDOCS ή, αν λείπει, CCCFINDOCS) */
  parents: number[];
}

const BATCH = 500;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const int = (v: string | undefined) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : null; };

export async function walkChain(start: number, getTable: GetTable, opts: { maxDepth?: number; maxDocs?: number } = {}) {
  const maxDepth = opts.maxDepth ?? 20, maxDocs = opts.maxDocs ?? 5000;
  const parents = new Map<number, Set<number>>([[start, new Set()]]);
  const fromRoot = new Set<number>(); // γονιός μόνο από CCCFINDOCS (ρίζα) — τον αντικαθιστά ο γονιός από τις γραμμές
  const link = (child: number, parent: number) => {
    if (child === parent) return;
    if (fromRoot.delete(child)) parents.get(child)!.clear();
    (parents.get(child) ?? parents.set(child, new Set()).get(child)!).add(parent);
  };
  let frontier = [start], depth = 0, truncated = false;
  while (frontier.length) {
    if (depth >= maxDepth || parents.size >= maxDocs) { truncated = true; break; }
    const next = new Set<number>();
    for (const part of chunk(frontier, BATCH)) {
      const ids = part.join(",");
      for (const [c, p] of await getTable("MTRLINES", ["FINDOC", "FINDOCS"], `FINDOCS IN (${ids})`)) {
        const child = int(c), parent = int(p);
        if (!child || !parent) continue;
        if (!parents.has(child)) next.add(child);
        link(child, parent);
      }
      for (const [c, p] of await getTable("FINDOC", ["FINDOC", "CCCFINDOCS"], `CCCFINDOCS IN (${ids})`)) {
        const child = int(c), parent = int(p);
        if (!child || !parent || child === parent) continue;
        if (!parents.has(child)) { next.add(child); parents.set(child, new Set()); }
        // CCCFINDOCS δείχνει τη ρίζα· κράτα το μόνο αν δεν έχουμε πιο ακριβή γονιό από τις γραμμές
        if (!parents.get(child)!.size) { parents.get(child)!.add(parent); fromRoot.add(child); }
      }
    }
    frontier = [...next]; depth++;
  }
  const docs: ChainDoc[] = [];
  for (const part of chunk([...parents.keys()], BATCH)) {
    for (const r of await getTable("FINDOC", ["FINDOC", "SERIES", "FINCODE", "TRNDATE", "FULLYTRANSF"], `FINDOC IN (${part.join(",")})`)) {
      const f = int(r[0])!;
      docs.push({ findoc: f, series: int(r[1]) ?? 0, fincode: r[2] ?? "", date: (r[3] ?? "").slice(0, 10), fullyTransf: int(r[4]), parents: [...(parents.get(f) ?? [])] });
    }
  }
  docs.sort((a, b) => a.date.localeCompare(b.date) || a.findoc - b.findoc);
  return { start, depth, truncated, docs };
}
