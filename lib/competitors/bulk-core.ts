// Καθαρές αποφάσεις της μαζικής αλλαγής τιμών (τιμή Κωτσόβολου − Χ): νέα τιμή ή λόγος αποκλεισμού. Χωρίς DB/δίκτυο.

/** Τα προϊόντα με ενεργή προσφορά δεν αλλάζουν ποτέ (Ruling 13) — γι' αυτό ο κανόνας δεν έχει διακόπτη για αυτά. */
export type Rule = { mode: "eur" | "pct"; amount: number; maxDropPct: number | null; minMarginPct: number | null; maxAgeH: number; raiseCheaper: boolean; maxRisePct: number | null };
/** now = τιμή επισκέπτη (σύγκριση/δικλείδες/εμφάνιση)· web = Product.price (NUM04, βάση για expect/oldPrice — Ruling 2)· cost με ΦΠΑ, ίδια βάση με τις τιμές */
export type Row = { productId: string; mtrl: number; now: number; web: number; theirs: number; checkedAt: Date; available: boolean; promo: boolean; cost: number | null; costAt: Date | null };
export type Skip = "stale" | "gone" | "promo" | "max-drop" | "max-rise" | "below-cost" | "no-cost" | "cheaper" | "same";
export type Plan = { newPrice: number; changeEur: number; changePct: number } | { skip: Skip };

export const DEFAULT_RULE: Rule = { mode: "eur", amount: 0.1, maxDropPct: 15, minMarginPct: 5, maxAgeH: 36, raiseCheaper: false, maxRisePct: 15 };
/** Η τιμή Κωτσόβολου δεν χρησιμοποιείται ποτέ παλαιότερη από τόσες ώρες (και ο server το κόβει εδώ). */
export const MAX_AGE_H = 36;
/** Το αποθηκευμένο κόστος (νυχτερινή εργασία) θεωρείται παλιό μετά από τόσες ώρες (Ruling 5). */
export const COST_MAX_H = 36;
/** Μέγιστο πλήθος προϊόντων σε μία εφαρμογή. */
export const MAX_BATCH = 50;

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const r1 = (x: number) => Math.round((x + Number.EPSILON) * 10) / 10;
const H = 3600_000;

export function planRow(r: Row, rule: Rule, at: Date): Plan {
  if (!r.available) return { skip: "gone" };
  if (at.getTime() - r.checkedAt.getTime() > rule.maxAgeH * H) return { skip: "stale" };
  if (r.promo) return { skip: "promo" };
  const newPrice = r2(rule.mode === "eur" ? r.theirs - rule.amount : r.theirs * (1 - rule.amount / 100));
  if (Math.abs(newPrice - r.now) < 0.005) return { skip: "same" };
  // ήδη φθηνότεροι από τον Κωτσόβολο: δεν αγγίζουμε, εκτός αν ζητήθηκε ρητά
  if (!rule.raiseCheaper && r.now < r.theirs) return { skip: "cheaper" };
  const changeEur = r2(newPrice - r.now), changePct = r1((changeEur / r.now) * 100);
  if (newPrice <= 0 || (rule.maxDropPct != null && changePct < -rule.maxDropPct)) return { skip: "max-drop" };
  if (rule.maxRisePct != null && changePct > rule.maxRisePct) return { skip: "max-rise" };
  if (rule.minMarginPct != null) {
    if (r.cost == null || r.cost <= 0 || !r.costAt || at.getTime() - r.costAt.getTime() > COST_MAX_H * H) return { skip: "no-cost" };
    if (newPrice < r2(r.cost * (1 + rule.minMarginPct / 100))) return { skip: "below-cost" };
  }
  return { newPrice, changeEur, changePct };
}

/** Κανόνας από τον client: όρια ώστε να μη φτάσει παράλογη τιμή στον server. null = μη έγκυρος. */
export function cleanRule(x: unknown): Rule | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
  const opt = (v: unknown, lo: number, hi: number) => (v === null ? null : num(v, lo, hi));
  const mode = o.mode === "eur" || o.mode === "pct" ? o.mode : undefined;
  const amount = mode === "pct" ? num(o.amount, 0, 50) : num(o.amount, 0, 10000);
  const maxDropPct = opt(o.maxDropPct, 0, 90), maxRisePct = opt(o.maxRisePct, 0, 100), minMarginPct = opt(o.minMarginPct, 0, 500), maxAgeH = num(o.maxAgeH, 1, MAX_AGE_H);
  if (!mode || amount === undefined || maxDropPct === undefined || maxRisePct === undefined || minMarginPct === undefined || maxAgeH === undefined) return null;
  if (typeof o.raiseCheaper !== "boolean") return null;
  return { mode, amount, maxDropPct, minMarginPct, maxAgeH, raiseCheaper: o.raiseCheaper, maxRisePct };
}

/** Λόγος αποκλεισμού: σύντομη ετικέτα + τι μπορεί να κάνει ο διαχειριστής. */
export const SKIP: Record<Skip, { label: string; hint: string }> = {
  "max-drop": { label: "Μείωση πάνω από το όριο", hint: "Μεγάλωσε το όριο μείωσης αν θέλεις να μπουν" },
  "below-cost": { label: "Κάτω από κόστος + περιθώριο", hint: "Δεν συμφέρει· μίκρυνε το περιθώριο μόνο αν το αποφάσισες" },
  "no-cost": { label: "Χωρίς πρόσφατο κόστος", hint: "Το κόστος διαβάζεται κάθε βράδυ· ή κλείσε τη δικλείδα κόστους" },
  "max-rise": { label: "Αύξηση πάνω από το όριο", hint: "Μεγάλωσε το όριο αύξησης αν θέλεις να μπουν" },
  promo: { label: "Έχει ενεργή προσφορά", hint: "Δεν αλλάζει ποτέ από εδώ — άλλαξέ το από τις προσφορές" },
  stale: { label: "Παλιά τιμή Κωτσόβολου", hint: "Ξαναελέγχεται το βράδυ· ή «Τρέξε τώρα» στη σύγκριση τιμών" },
  gone: { label: "Δεν διατίθεται πια στον Κωτσόβολο", hint: "Δεν υπάρχει τιμή για σύγκριση" },
  cheaper: { label: "Είμαστε ήδη φθηνότεροι", hint: "Άνοιξε «Ανέβασε και όσα είμαστε φθηνότεροι» για να ανέβουν" },
  same: { label: "Έχει ήδη αυτή την τιμή", hint: "Τίποτα να αλλάξει" },
};

/** Πόσο έχει προχωρήσει μια παρτίδα, από τις γραμμές της. Εκκρεμής γραμμή εφαρμογής = !ok χωρίς σφάλμα. */
export type LineState = { ok: boolean; error: string | null; undoOk: boolean | null };
export function batchProgress(lines: LineState[], lockUntil: Date | null, now: Date) {
  const locked = !!lockUntil && lockUntil > now;
  const ok = lines.filter((l) => l.ok), pending = lines.filter((l) => !l.ok && l.error == null).length;
  const phase: "applying" | "undoing" | "idle" = locked ? (pending ? "applying" : "undoing") : "idle";
  return {
    phase,
    total: phase === "undoing" ? ok.length : lines.length,
    done: phase === "undoing" ? ok.filter((l) => l.undoOk != null).length : lines.length - pending,
    ok: ok.length, failed: lines.filter((l) => !l.ok && l.error != null).length,
    undone: ok.filter((l) => l.undoOk === true).length,
    undoFailed: ok.filter((l) => l.undoOk === false).length,
    /** όσα μπορούν να αναιρεθούν (πρώτη φορά ή ξανά) */
    undoable: phase === "idle" ? ok.filter((l) => l.undoOk !== true).length : 0,
  };
}
