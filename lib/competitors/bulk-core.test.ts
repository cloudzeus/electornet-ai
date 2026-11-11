import { test } from "node:test";
import assert from "node:assert/strict";
import { batchProgress, cleanRule, DEFAULT_RULE, planRow, type Row, type Rule } from "./bulk-core";

const at = new Date("2026-11-11T10:00:00Z");
const ago = (h: number) => new Date(at.getTime() - h * 3600_000);
const row = (o: Partial<Row> = {}): Row => ({ productId: "p", mtrl: 1, now: 3499, web: 3499, theirs: 3299.99, checkedAt: ago(2), available: true, promo: false, cost: null, costAt: null, ...o });
const rule = (o: Partial<Rule> = {}): Rule => ({ ...DEFAULT_RULE, minMarginPct: null, ...o });

test("planRow: −0,10 € κάτω από τον Κωτσόβολο", () => {
  assert.deepEqual(planRow(row(), rule(), at), { newPrice: 3299.89, changeEur: -199.11, changePct: -5.7 });
});

test("planRow: μέγιστη μείωση 15%", () => {
  assert.deepEqual(planRow(row({ now: 829, web: 829, theirs: 649.99 }), rule({ maxDropPct: 15 }), at), { skip: "max-drop" });
  // χωρίς τη δικλείδα περνά
  assert.equal((planRow(row({ now: 829, web: 829, theirs: 649.99 }), rule({ maxDropPct: null }), at) as { newPrice: number }).newPrice, 649.89);
});

test("planRow: ποσοστό 1% πάνω σε 1000 → 990", () => {
  assert.deepEqual(planRow(row({ now: 1050, theirs: 1000 }), rule({ mode: "pct", amount: 1 }), at), { newPrice: 990, changeEur: -60, changePct: -5.7 });
});

test("planRow: κόστος + περιθώριο", () => {
  const fresh = { cost: 3200, costAt: ago(3) };
  assert.deepEqual(planRow(row(fresh), rule({ minMarginPct: 5 }), at), { skip: "below-cost" });
  assert.equal("newPrice" in planRow(row({ ...fresh, cost: 3000 }), rule({ minMarginPct: 5 }), at), true);
  // χωρίς κόστος ή με παλιό κόστος (>36 ώρες) και ενεργή δικλείδα → δεν αλλάζει
  assert.deepEqual(planRow(row(), rule({ minMarginPct: 5 }), at), { skip: "no-cost" });
  assert.deepEqual(planRow(row({ cost: 3000, costAt: ago(37) }), rule({ minMarginPct: 5 }), at), { skip: "no-cost" });
  // δικλείδα κλειστή → το κόστος δεν ελέγχεται
  assert.equal("newPrice" in planRow(row(fresh), rule({ minMarginPct: null }), at), true);
});

test("planRow: παλιά τιμή, δεν διατίθεται, προσφορά", () => {
  assert.deepEqual(planRow(row({ checkedAt: ago(37) }), rule(), at), { skip: "stale" });
  assert.deepEqual(planRow(row({ available: false }), rule(), at), { skip: "gone" });
  // ενεργή προσφορά: πάντα έξω, ακόμη και όταν ανεβάζουμε φθηνότερα
  assert.deepEqual(planRow(row({ promo: true }), rule(), at), { skip: "promo" });
  assert.deepEqual(planRow(row({ promo: true, now: 3000 }), rule({ raiseCheaper: true }), at), { skip: "promo" });
});

test("planRow: φθηνότεροι και ίδια τιμή", () => {
  assert.deepEqual(planRow(row({ now: 3000 }), rule(), at), { skip: "cheaper" });
  assert.deepEqual(planRow(row({ now: 3000 }), rule({ raiseCheaper: true }), at), { newPrice: 3299.89, changeEur: 299.89, changePct: 10 });
  // όριο αύξησης 15%: +20% μένει έξω, χωρίς όριο περνά
  assert.deepEqual(planRow(row({ now: 2750 }), rule({ raiseCheaper: true, maxRisePct: 15 }), at), { skip: "max-rise" });
  assert.equal("newPrice" in planRow(row({ now: 2750 }), rule({ raiseCheaper: true, maxRisePct: null }), at), true);
  assert.deepEqual(planRow(row({ now: 3299.89 }), rule(), at), { skip: "same" });
});

test("planRow: στρογγυλοποίηση χωρίς ουρά float", () => {
  const p = planRow(row({ now: 0.5, theirs: 0.1 + 0.2 }), rule({ maxDropPct: null }), at) as { newPrice: number; changeEur: number };
  assert.equal(p.newPrice, 0.2);
  assert.equal(p.changeEur, -0.3);
  assert.equal((planRow(row({ now: 50, theirs: 33.33 }), rule({ mode: "pct", amount: 3, maxDropPct: null }), at) as { newPrice: number }).newPrice, 32.33);
});

test("cleanRule: δέχεται τον προεπιλεγμένο, απορρίπτει παράλογα", () => {
  assert.deepEqual(cleanRule(DEFAULT_RULE), DEFAULT_RULE);
  assert.equal(cleanRule({ ...DEFAULT_RULE, amount: -1 }), null);
  assert.equal(cleanRule({ ...DEFAULT_RULE, mode: "pct", amount: 80 }), null);
  assert.equal(cleanRule({ ...DEFAULT_RULE, maxDropPct: "15" }), null);
  assert.deepEqual(cleanRule({ ...DEFAULT_RULE, minMarginPct: null }), { ...DEFAULT_RULE, minMarginPct: null });
  // παλαιότερη από 36 ώρες τιμή Κωτσόβολου δεν επιτρέπεται· ένα παλιό «skipPromo:false» αγνοείται
  assert.equal(cleanRule({ ...DEFAULT_RULE, maxAgeH: 48 }), null);
  assert.deepEqual(cleanRule({ ...DEFAULT_RULE, skipPromo: false }), DEFAULT_RULE);
});

test("batchProgress: εφαρμογή, αναίρεση, ξαναδοκιμή", () => {
  const L = (ok: boolean, error: string | null, undoOk: boolean | null = null) => ({ ok, error, undoOk });
  const lock = new Date(at.getTime() + 60_000);
  // τρέχει η εφαρμογή: 2 γραμμένες από 3
  assert.deepEqual(batchProgress([L(true, null), L(false, "x"), L(false, null)], lock, at), { phase: "applying", total: 3, done: 2, ok: 1, failed: 1, undone: 0, undoFailed: 0, undoable: 0 });
  // τελείωσε: 2 αναιρέσιμες
  assert.equal(batchProgress([L(true, null), L(true, null), L(false, "x")], null, at).undoable, 2);
  // τρέχει η αναίρεση: 1 από 2
  assert.deepEqual(batchProgress([L(true, null, true), L(true, null), L(false, "x")], lock, at).phase, "undoing");
  assert.equal(batchProgress([L(true, null, true), L(true, null), L(false, "x")], lock, at).done, 1);
  // μία απέτυχε (άλλαξε από άλλον) → μένει 1 για ξαναδοκιμή· το ληγμένο κλείδωμα δεν μετρά
  const p = batchProgress([L(true, null, true), L(true, "άλλαξε από άλλον", false)], new Date(at.getTime() - 1), at);
  assert.equal(p.phase, "idle"); assert.equal(p.undoable, 1); assert.equal(p.undoFailed, 1);
});
