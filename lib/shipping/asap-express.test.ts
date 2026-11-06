import { test } from "node:test";
import assert from "node:assert/strict";
import { ASAP_DEFAULT, asapEligible, expressCheck, inZips, normalizeAsapRules, pickAsapPrice, type ExpressLine } from "./asap-express";

test("ΤΚ Αττικής: εύρη και μεμονωμένοι, μόνο 5ψήφιοι", () => {
  assert.equal(inZips("11741", "10000-19999"), true);
  assert.equal(inZips("20100", "10000-19999"), false);
  assert.equal(inZips("19600", "10000-18999\n19600"), true);
  assert.equal(inZips("1174", "10000-19999"), false);
  assert.equal(inZips("", "10000-19999"), false);
});

test("επιλεξιμότητα: SKU > πιο ειδική κατηγορία > όχι", () => {
  const r = { ...ASAP_DEFAULT, categories: { "eikona-ixos": false, "fortita-icheia": true }, skus: { "X1": false } };
  assert.equal(asapEligible(["fortita-icheia", "eikona-ixos"], "A", r), true);
  assert.equal(asapEligible(["tileoraseis", "eikona-ixos"], "A", r), false);
  assert.equal(asapEligible(["fortita-icheia", "eikona-ixos"], "X1", r), false);
  assert.equal(asapEligible(["agnosti"], null, r), false);
});

const L = (o: Partial<ExpressLine> = {}): ExpressLine => ({ title: "Ηχείο", qty: 1, eligible: true, inStock: true, weightKg: 2, dimsCm: [30, 20, 20], ...o });

test("Express: όλοι οι όροι, δέμα = ο μεγαλύτερος όγκος", () => {
  const ok = expressCheck([L(), L({ title: "Μίξερ", weightKg: 4, dimsCm: [40, 30, 30] })], ASAP_DEFAULT);
  assert.deepEqual(ok, { ok: true, pkg: { weightKg: 4, dims: [40, 30, 30] } });
  assert.equal(expressCheck([L({ qty: 4 })], ASAP_DEFAULT).ok, false);
  assert.equal(expressCheck([L({ eligible: false })], ASAP_DEFAULT).ok, false);
  assert.equal(expressCheck([L({ inStock: false })], ASAP_DEFAULT).ok, false);
  assert.equal(expressCheck([L({ dimsCm: null })], ASAP_DEFAULT).ok, false);
  assert.equal(expressCheck([L({ weightKg: null })], ASAP_DEFAULT).ok, false);
  assert.equal(expressCheck([], ASAP_DEFAULT).ok, false);
});

test("τιμή: χωρίς «Επιστροφές» 0,01 €, μόνο επιτρεπτές ζώνες", () => {
  const j = { items: { price_lists: [
    { name: "Επιστροφές Express Ατελώς", area_groups: { to: { name: "Greece" } }, charges: { total: 0.01 } },
    { name: "Next Day", area_groups: { to: { name: "Αθήνα εντός" } }, charges: { total: 4.84 } },
  ] } };
  assert.deepEqual(pickAsapPrice(j, ASAP_DEFAULT.zones), { fee: 484, zone: "Αθήνα εντός" });
  const chersaio = { items: { price_lists: [{ name: "Next Day", area_groups: { to: { name: "Χερσαίο" } }, charges: { total: 5.7 } }] } };
  assert.equal(pickAsapPrice(chersaio, ASAP_DEFAULT.zones), null);
  assert.equal(pickAsapPrice(null, ASAP_DEFAULT.zones), null);
});

test("κανόνες: προεπιλογές και καθάρισμα", () => {
  const r = normalizeAsapRules({ on: true, maxItems: 99, categories: { a: true, b: "x" }, zones: [" Αθήνα εντός "] });
  assert.equal(r.on, true);
  assert.equal(r.maxItems, 3);
  assert.deepEqual(r.categories, { a: true });
  assert.deepEqual(r.zones, ["Αθήνα εντός"]);
  assert.equal(normalizeAsapRules(null).atticaZips, "10000-19999");
});
