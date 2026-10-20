import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, pickRule, priceFrom } from "./markup";

test("parseMoney: ελληνική/αγγλική μορφή, σύμβολα νομίσματος", () => {
  assert.equal(parseMoney("1.234,50 €"), 1234.5);
  assert.equal(parseMoney("1234.5"), 1234.5);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("EUR 12,5"), 12.5);
  assert.equal(parseMoney("12 €"), 12);
});

test("parseMoney: τελευταίος διαχωριστής = δεκαδικό, τελείες χιλιάδων", () => {
  assert.equal(parseMoney("1.234"), 1234);
  assert.equal(parseMoney("12.345.678"), 12345678);
  assert.equal(parseMoney("1,234.50"), 1234.5);
  assert.equal(parseMoney("12,5"), 12.5);
  assert.equal(parseMoney("0.5"), 0.5);
  assert.equal(parseMoney("12.34"), 12.34);
});

test("parseMoney: μηδέν/αρνητικό → null", () => {
  assert.equal(parseMoney("0"), null);
  assert.equal(parseMoney("0,00"), null);
  assert.equal(parseMoney("-5"), null);
});

const R = (id: string, brandId: string | null, categoryId: string | null, active = true) => ({ id, brandId, categoryId, active });

test("pickRule: μάρκα+κατηγορία > κατηγορία > μάρκα > γενικός", () => {
  const rules = [R("gen", null, null), R("brand", "b1", null), R("cat", null, "c1"), R("both", "b1", "c1")];
  assert.equal(pickRule(rules, "b1", "c1")?.id, "both");
  assert.equal(pickRule(rules.filter((r) => r.id !== "both"), "b1", "c1")?.id, "cat");
  assert.equal(pickRule(rules.filter((r) => r.id === "brand" || r.id === "gen"), "b1", "c1")?.id, "brand");
  assert.equal(pickRule(rules.filter((r) => r.id === "gen"), "b1", "c1")?.id, "gen");
});

test("pickRule: ανενεργός αγνοείται, μη ταιριαστός δεν εφαρμόζεται, κενό → null", () => {
  assert.equal(pickRule([R("both", "b1", "c1", false), R("gen", null, null)], "b1", "c1")?.id, "gen");
  assert.equal(pickRule([R("other", "b2", null), R("gen", null, null)], "b1", "c1")?.id, "gen");
  assert.equal(pickRule([R("other", "b2", null), R("othercat", null, "c9")], "b1", "c1"), null);
  assert.equal(pickRule([R("gen", null, null)], null, null)?.id, "gen");
  assert.equal(pickRule([R("brand", "b1", null)], null, null), null);
  assert.equal(pickRule([], "b1", "c1"), null);
});

test("pickRule: ισοβαθμία → ο πρώτος στη σειρά", () => {
  assert.equal(pickRule([R("a", "b1", null), R("b", "b1", null)], "b1", null)?.id, "a");
});

const base = { cost: 100, percent: 30, vat: 24 };

test("priceFrom: στρογγυλοποιήσεις (130 × 1,24 = 161,2)", () => {
  assert.equal(priceFrom({ ...base, rounding: "90" }).price, 161.9);
  assert.equal(priceFrom({ ...base, rounding: "99" }).price, 161.99);
  assert.equal(priceFrom({ ...base, rounding: "int" }).price, 162);
  assert.equal(priceFrom({ ...base, rounding: "none" }).price, 161.2);
  assert.equal(priceFrom({ ...base, rounding: "none" }).capped, false);
});

test("priceFrom: οριακές τιμές στο ,90", () => {
  // 100 → 161.95 ακριβώς: cost*(1+p/100)*(1+vat/100) με κόστος που δίνει 161.95
  const up = priceFrom({ cost: 161.95 / 1.24, percent: 0, vat: 24, rounding: "90" });
  assert.equal(up.price, 162.9);
  const exact = priceFrom({ cost: 161.9 / 1.24, percent: 0, vat: 24, rounding: "90" });
  assert.equal(exact.price, 161.9);
  const exact99 = priceFrom({ cost: 161.99 / 1.24, percent: 0, vat: 24, rounding: "99" });
  assert.equal(exact99.price, 161.99);
  assert.equal(priceFrom({ cost: 162 / 1.24, percent: 0, vat: 24, rounding: "int" }).price, 162);
});

test("priceFrom: πλαφόν ΤΛΤ", () => {
  const r = priceFrom({ ...base, rounding: "90", rrp: 150 });
  assert.equal(r.price, 150);
  assert.equal(r.capped, true);
  assert.equal(priceFrom({ ...base, rounding: "90", rrp: 200 }).capped, false);
  assert.equal(priceFrom({ ...base, rounding: "90", rrp: 200 }).price, 161.9);
  assert.equal(priceFrom({ ...base, rounding: "90", rrp: null }).capped, false);
  assert.equal(priceFrom({ ...base, rounding: "90", rrp: 0 }).capped, false);
});

test("priceFrom: περιθώριο = καθαρή τιμή − κόστος (μετά το πλαφόν, μπορεί να είναι αρνητικό)", () => {
  assert.equal(priceFrom({ ...base, rounding: "none" }).margin, 30);
  const capped = priceFrom({ ...base, rounding: "90", rrp: 150 });
  assert.equal(capped.margin, 20.97); // 150/1.24 = 120.97
  assert.equal(priceFrom({ cost: 100, percent: 0, vat: 24, rounding: "none", rrp: 100 }).margin, -19.35);
});
