import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_POLICY, normPolicy, policyPrice, splitByPolicy } from "./policy-core";

test("προεπιλογή: όλα «μόνο κενά» (όπως πριν)", () => {
  const r = splitByPolicy({ mtrl: "5", barcode: "520", shortDesc: "x" }, { Χρώμα: "Μαύρο" }, DEFAULT_POLICY);
  assert.deepEqual(r.blank, { fields: { mtrl: "5", barcode: "520", shortDesc: "x" }, specs: { Χρώμα: "Μαύρο" } });
  assert.equal(r.over, null);
});

test("ανά ομάδα: αντικατάσταση, μόνο κενά, καθόλου — τα κλειδιά πάνε και στα δύο", () => {
  const p = { ...DEFAULT_POLICY, content: "overwrite" as const, tech: "off" as const };
  const r = splitByPolicy({ mtrl: "5", code: "AB", name: "Νέο όνομα", shortDesc: "x", weightKg: "3" }, { Χρώμα: "Μαύρο" }, p);
  assert.deepEqual(r.over, { fields: { mtrl: "5", code: "AB", shortDesc: "x" }, specs: { Χρώμα: "Μαύρο" } });
  // το όνομα δεν αντικαθίσταται ποτέ
  assert.deepEqual(r.blank, { fields: { mtrl: "5", code: "AB", name: "Νέο όνομα" }, specs: {} });
});

test("όλα off → τίποτα", () => {
  const r = splitByPolicy({ mtrl: "5", barcode: "1" }, { a: "b" }, { price: "off", content: "off", tech: "off", vatIncluded: false });
  assert.deepEqual(r, { blank: null, over: null });
});

test("normPolicy: άγνωστες τιμές → προεπιλογή", () => {
  assert.deepEqual(normPolicy({ price: "x", tech: "overwrite", vatIncluded: "yes" }), { ...DEFAULT_POLICY, tech: "overwrite" });
  assert.deepEqual(normPolicy(null), DEFAULT_POLICY);
});

const rule = { percent: 25, rounding: "none" as const };
test("τιμή από κόστος: χωρίς ΦΠΑ στο feed = όπως πριν", () => {
  const r = policyPrice({ mode: "cost", cost: "100", rrp: null, rule, label: "κανόνας", vat: 24, vatIncluded: false });
  assert.equal(r.price?.price, 155); // 100 × 1,25 × 1,24
  assert.equal(r.price?.cost, 100);
});

test("τιμή από κόστος με ΦΠΑ: αφαιρείται πρώτα ο ΦΠΑ", () => {
  const r = policyPrice({ mode: "cost", cost: "124", rrp: null, rule, label: "κανόνας", vat: 24, vatIncluded: true });
  assert.equal(r.price?.cost, 100);
  assert.equal(r.price?.price, 155);
});

test("λιανική του feed: με ή χωρίς ΦΠΑ", () => {
  assert.equal(policyPrice({ mode: "retail", cost: null, rrp: "199,90", rule: null, label: "", vat: 24, vatIncluded: true }).price?.price, 199.9);
  assert.equal(policyPrice({ mode: "retail", cost: null, rrp: "100", rule: null, label: "", vat: 24, vatIncluded: false }).price?.price, 124);
  assert.match(policyPrice({ mode: "retail", cost: null, rrp: "abc", rule: null, label: "", vat: 24, vatIncluded: true }).warning!, /δεν είναι ποσό/);
});

test("χωρίς κανόνα στο κόστος: προειδοποίηση, όχι τιμή", () => {
  assert.match(policyPrice({ mode: "cost", cost: "10", rrp: null, rule: null, label: "", vat: 24, vatIncluded: false }).warning!, /κανόνας/);
});
