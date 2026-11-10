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
  /** FINDOC.SUMAMNT (σύνολο με ΦΠΑ) */
  total: number | null;
  /** από πού προήλθε (MTRLINES.FINDOCS ή, αν λείπει, CCCFINDOCS) */
  parents: number[];
  /** ο γονιός ήρθε μόνο από CCCFINDOCS (καμία γραμμή δεν δείχνει προέλευση) */
  viaRoot: boolean;
  /** έχει και γραμμές άλλων παραγγελιών (π.χ. PES-APL) */
  shared: boolean;
  /** αξία μόνο των δικών μας γραμμών (LINEVAL, χωρίς ΦΠΑ) — για τα κοινά */
  ownNet: number | null;
}

const BATCH = 500;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const int = (v: string | undefined) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) ? n : null; };

/**
 * Η αρχική παραγγελία ενός παραστατικού (π.χ. απόδειξη → 7005), ώστε η πορεία να δείχνει και ό,τι έγινε ΠΡΙΝ από αυτό.
 * Πρώτα `CCCFINDOCS` (δείχνει κατευθείαν τη ρίζα)· αν λείπει (παλιά παραστατικά), ανεβαίνει από τις γραμμές όσο η
 * προέλευση είναι μία. Σε συγχώνευση (γραμμές από πολλά παραστατικά) σταματά εκεί.
 */
export async function findRoot(f: number, getTable: GetTable, maxUp = 20) {
  let cur = f;
  const seen = new Set([f]);
  for (let i = 0; i < maxUp; i++) {
    const c = int((await getTable("FINDOC", ["FINDOC", "CCCFINDOCS"], `FINDOC IN (${cur})`))[0]?.[1]);
    if (c === cur) break; // η ρίζα δείχνει τον εαυτό της
    if (c && !seen.has(c)) { seen.add(c); cur = c; continue; }
    const src = [...new Set((await getTable("MTRLINES", ["FINDOC", "MTRLINES", "FINDOCS"], `FINDOC IN (${cur})`)).map((r) => int(r[2])).filter((x): x is number => !!x))];
    if (src.length !== 1 || seen.has(src[0])) break;
    seen.add(src[0]); cur = src[0];
  }
  return cur;
}

export async function walkChain(start: number, getTable: GetTable, opts: { maxDepth?: number; maxDocs?: number } = {}) {
  const maxDepth = opts.maxDepth ?? 20, maxDocs = opts.maxDocs ?? 5000;
  const parents = new Map<number, Set<number>>([[start, new Set()]]);
  const fromRoot = new Set<number>(); // γονιός μόνο από CCCFINDOCS (ρίζα) — τον αντικαθιστά ο γονιός από τις γραμμές
  const link = (child: number, parent: number) => {
    if (child === parent) return;
    if (fromRoot.delete(child)) parents.get(child)!.clear();
    (parents.get(child) ?? parents.set(child, new Set()).get(child)!).add(parent);
  };
  // Ανά γραμμή: ακολουθούμε μόνο γραμμές που προέρχονται από γραμμές ΑΥΤΗΣ της παραγγελίας. Ένα κοινό παραστατικό
  // (π.χ. PES-APL με πολλές παραγγελίες) δεν μας φέρνει όσα έγιναν από τις γραμμές των άλλων.
  const ours = new Set<string>(); // "FINDOC:MTRLINES"
  /** all: όλες οι γραμμές (ρίζα) · αλλιώς μόνο όσες δεν έχουν προέλευση — όσες έχουν, τις κρίνει το περπάτημα ανά γραμμή */
  const addLines = async (docs: number[], all: boolean) => {
    for (const part of chunk(docs, BATCH)) for (const [f, l, src] of await getTable("MTRLINES", ["FINDOC", "MTRLINES", "FINDOCS"], `FINDOC IN (${part.join(",")})`)) if (all || !int(src)) ours.add(`${f}:${l}`);
  };
  await addLines([start], true);
  // CCCFINDOCS δείχνει τη ρίζα: όλα αυτά τα παραστατικά είναι της παραγγελίας (μαζί με όλες τους τις γραμμές)
  const own: number[] = [];
  for (const [c] of await getTable("FINDOC", ["FINDOC", "CCCFINDOCS"], `CCCFINDOCS IN (${start})`)) {
    const child = int(c);
    if (!child || child === start || parents.has(child)) continue;
    parents.set(child, new Set([start])); fromRoot.add(child); own.push(child);
  }
  await addLines(own, false);
  let frontier = [start, ...own], depth = 0, truncated = false;
  while (frontier.length) {
    if (depth >= maxDepth || parents.size >= maxDocs) { truncated = true; break; }
    const next = new Set<number>();
    for (const part of chunk(frontier, BATCH)) {
      for (const [c, cl, p, pl] of await getTable("MTRLINES", ["FINDOC", "MTRLINES", "FINDOCS", "MTRLINESS"], `FINDOCS IN (${part.join(",")})`)) {
        const child = int(c), parent = int(p);
        if (!child || !parent || !ours.has(`${parent}:${pl}`)) continue;
        if (!ours.has(`${child}:${cl}`)) { ours.add(`${child}:${cl}`); next.add(child); }
        link(child, parent);
      }
    }
    frontier = [...next]; depth++;
  }
  // κοινά παραστατικά: γραμμές που δεν είναι δικές μας + η αξία των δικών μας
  const foreign = new Set<number>(), net = new Map<number, number>();
  for (const part of chunk([...parents.keys()], BATCH)) {
    for (const [f, l, v] of await getTable("MTRLINES", ["FINDOC", "MTRLINES", "LINEVAL"], `FINDOC IN (${part.join(",")})`)) {
      const d = int(f)!;
      if (ours.has(`${f}:${l}`)) net.set(d, (net.get(d) ?? 0) + (parseFloat(v) || 0)); else foreign.add(d);
    }
  }
  const docs: ChainDoc[] = [];
  for (const part of chunk([...parents.keys()], BATCH)) {
    for (const r of await getTable("FINDOC", ["FINDOC", "SERIES", "FINCODE", "TRNDATE", "FULLYTRANSF", "SUMAMNT"], `FINDOC IN (${part.join(",")})`)) {
      const f = int(r[0])!;
      docs.push({ findoc: f, series: int(r[1]) ?? 0, fincode: r[2] ?? "", date: (r[3] ?? "").slice(0, 10), fullyTransf: int(r[4]), total: Number.isFinite(parseFloat(r[5])) ? parseFloat(r[5]) : null, parents: [...(parents.get(f) ?? [])], viaRoot: fromRoot.has(f), shared: foreign.has(f), ownNet: foreign.has(f) ? Math.round((net.get(f) ?? 0) * 100) / 100 : null });
    }
  }
  docs.sort((a, b) => a.date.localeCompare(b.date) || a.findoc - b.findoc);
  return { start, depth, truncated, docs };
}
