/**
 * Καθαρή λογική του δέντρου κατηγοριών web του SoftOne — χωρίς δίκτυο, για tests.
 *   επίπεδο 1: CCCWEBCATEGORY1 (Master)           κλειδί «1:<κωδ>»
 *   επίπεδο 2: CCCWEBCATEGORY2 (Main), EditList   κλειδί «2:<γονέας>:<κωδ>» — ο ίδιος κωδικός υπάρχει κάτω από άλλους γονείς
 *   επίπεδο 3: CCCWEBGRSPECS (ομάδα χαρακτ.)      κλειδί «g:<id>»
 */
export type Row = Record<string, string>;

export type NodeKey = `1:${number}` | `2:${number}:${number}` | `g:${number}`;
export type ParsedKey = { level: 1; c1: number } | { level: 2; c1: number; c2: number } | { level: 3; g: number };

export function parseKey(k: string): ParsedKey | null {
  const p = k.split(":");
  if (p[0] === "1" && p.length === 2 && +p[1] > 0) return { level: 1, c1: +p[1] };
  if (p[0] === "2" && p.length === 3 && +p[1] > 0 && +p[2] > 0) return { level: 2, c1: +p[1], c2: +p[2] };
  if (p[0] === "g" && p.length === 2 && +p[1] > 0) return { level: 3, g: +p[1] };
  return null;
}

/** Επόμενος ελεύθερος κωδικός: πολλαπλάσιο του 10 πάνω από τον μεγαλύτερο (έτσι είναι αριθμημένα στο ERP). Smallint → έως 32767. */
export function nextCode(used: number[], keep?: number): number {
  if (keep && !used.includes(keep)) return keep;
  const max = used.length ? Math.max(...used) : 0;
  const n = (Math.floor(max / 10) + 1) * 10;
  if (n > 32767) throw new Error("Δεν υπάρχει ελεύθερος κωδικός (όριο 32767).");
  return n;
}

/** Για αποστολή: χωρίς UPDDATE (το βάζει το ERP) και «60|Όνομα» → «60». */
export const clean = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "UPDDATE").map(([k, v]) => [k, typeof v === "string" && /^-?\d+\|/.test(v) ? v.split("|")[0] : String(v ?? "")]));
export const sig = (r: Row) => JSON.stringify(Object.entries(clean(r)).sort(([a], [b]) => a.localeCompare(b)));

export type L2Change =
  | { kind: "add"; c1: number; name: string }
  | { kind: "set"; c1: number; c2: number; patch: { name?: string; active?: boolean } }
  /** μετακίνηση = νέα γραμμή στον νέο γονέα + η παλιά ανενεργή (ποτέ διαγραφή: πάνω της κρέμονται είδη μέχρι να μετακινηθούν) */
  | { kind: "copy"; from: { c1: number; c2: number }; toC1: number };

export const NAME_MAX = 64;

/** Εφαρμόζει μία αλλαγή στην ΠΛΗΡΗ λίστα του επιπέδου 2. Επιστρέφει όλες τις γραμμές (για setData) και τη γραμμή-στόχο. */
export function applyL2(rows: Row[], c: L2Change): { rows: Row[]; target: Row } {
  const all = rows.map(clean);
  const find = (c1: number, c2: number) => all.find((r) => +r.CCCWEBCATEGORY1 === c1 && +r.CCCWEBCATEGORY2 === c2);
  const company = all[0]?.COMPANY ?? "1";
  const codesIn = (c1: number) => all.filter((r) => +r.CCCWEBCATEGORY1 === c1).map((r) => +r.CCCWEBCATEGORY2);
  const name = (s: string) => {
    const v = s.trim();
    if (!v) throw new Error("Το όνομα δεν μπορεί να είναι κενό.");
    if (v.length > NAME_MAX) throw new Error(`Το όνομα έχει έως ${NAME_MAX} χαρακτήρες (τώρα ${v.length}).`);
    return v;
  };
  if (c.kind === "add") {
    const target = { COMPANY: company, CCCWEBCATEGORY1: String(c.c1), CCCWEBCATEGORY2: String(nextCode(codesIn(c.c1))), NAME: name(c.name), ISACTIVE: "1" };
    return { rows: [...all, target], target };
  }
  if (c.kind === "set") {
    const r = find(c.c1, c.c2);
    if (!r) throw new Error("Η κατηγορία δεν βρέθηκε στο SoftOne.");
    if (c.patch.name !== undefined) r.NAME = name(c.patch.name);
    if (c.patch.active !== undefined) r.ISACTIVE = c.patch.active ? "1" : "0";
    return { rows: all, target: r };
  }
  const src = find(c.from.c1, c.from.c2);
  if (!src) throw new Error("Η κατηγορία δεν βρέθηκε στο SoftOne.");
  if (c.toC1 === c.from.c1) throw new Error("Η κατηγορία είναι ήδη εκεί.");
  const target = { ...src, CCCWEBCATEGORY1: String(c.toC1), CCCWEBCATEGORY2: String(nextCode(codesIn(c.toC1), c.from.c2)), ISACTIVE: "1" };
  return { rows: [...all, target], target };
}

/** Μετά το setData: η γραμμή-στόχος υπάρχει όπως στάλθηκε και καμία άλλη γραμμή δεν άλλαξε ή χάθηκε. */
export function verifyList(sent: Row[], target: Row, after: Row[], keyOf: (r: Row) => string): string[] {
  const issues: string[] = [];
  const now = new Map(after.map((r) => [keyOf(clean(r)), clean(r)]));
  const got = now.get(keyOf(target));
  if (!got) issues.push("Η αλλαγή δεν βρέθηκε στη νέα ανάγνωση.");
  else for (const [k, v] of Object.entries(target)) if (k !== "UPDDATE" && got[k] !== v) issues.push(`${k}: γράφτηκε «${got[k]}» αντί για «${v}».`);
  const lost = sent.filter((r) => keyOf(r) !== keyOf(target) && sig(r) !== sig(now.get(keyOf(r)) ?? {}));
  if (lost.length) issues.push(`${lost.length} άλλες γραμμές άλλαξαν ή χάθηκαν.`);
  return issues;
}
export const l2Key = (r: Row) => `${+r.CCCWEBCATEGORY1}:${+r.CCCWEBCATEGORY2}`;

/** Ποιες μετακινήσεις επιτρέπονται: το επίπεδο 2 πάει κάτω από άλλο 1, το 3 κάτω από άλλο 2. Τα 1 δεν έχουν γονέα. */
export function moveAllowed(node: ParsedKey, parent: ParsedKey): string | null {
  if (node.level === 1) return "Οι κεντρικές κατηγορίες δεν μετακινούνται κάτω από άλλη — άλλαξε μόνο τη σειρά τους.";
  if (node.level === 2) {
    if (parent.level !== 1) return "Μια κατηγορία (επίπεδο 2) μπαίνει μόνο κάτω από κεντρική κατηγορία.";
    if (parent.c1 === node.c1) return "Η κατηγορία είναι ήδη εκεί.";
    return null;
  }
  if (parent.level !== 2) return "Ένας τύπος προϊόντος μπαίνει μόνο κάτω από κατηγορία (επίπεδο 2).";
  return null;
}
