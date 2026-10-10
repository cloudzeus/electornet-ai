import { test } from "node:test";
import assert from "node:assert/strict";
import { canExtend, canExtendAtAll, extensionPrice, normalizePricing, parseWarrantyMonths, warrantyFromSpecs } from "./policy";

test("εγγύηση από ελεύθερο κείμενο του ERP", () => {
  assert.equal(parseWarrantyMonths("2 χρόνια"), 24);
  assert.equal(parseWarrantyMonths("4 Χρόνια"), 48);
  assert.equal(parseWarrantyMonths("5 Χρόνια Kenwood"), 60);
  assert.equal(parseWarrantyMonths("2 έτη"), 24);
  assert.equal(parseWarrantyMonths("2 years"), 24);
  assert.equal(parseWarrantyMonths("24 μήνες"), 24);
  assert.equal(parseWarrantyMonths("Περιορισμένη διετής εγγύηση"), 24);
  assert.equal(parseWarrantyMonths("Ναι"), null);
  assert.equal(parseWarrantyMonths(""), null);
});

test("από τα χαρακτηριστικά: η πρώτη γραμμή «Εγγύηση» με διάρκεια", () => {
  assert.deepEqual(warrantyFromSpecs([{ key: "Χρώμα", value: "Λευκό" }, { key: "Εγγύηση", value: "3 χρόνια" }]), { months: 36, text: "3 χρόνια" });
  assert.deepEqual(warrantyFromSpecs([{ key: "Διετής εγγύηση διεθνώς", value: "Ναι" }]), { months: 24, text: "Ναι" });
  assert.equal(warrantyFromSpecs([{ key: "Χρώμα", value: "Λευκό" }]), null);
});

test("δωρεάν επέκταση παλιάς αγοράς: Euronics, προϊόν με CCCWARRANTY, εγγύηση σε ισχύ, μία φορά", () => {
  const now = new Date("2026-10-10");
  const ok = { registeredBy: "erp", productEligible: true, warrantyUntil: new Date("2027-05-01"), extendedUntil: null };
  assert.equal(canExtend(ok, now).eligible, true);
  assert.equal(canExtend({ ...ok, registeredBy: "order" }, now).eligible, true);
  assert.equal(canExtend({ ...ok, registeredBy: "manual" }, now).eligible, false);
  assert.equal(canExtend({ ...ok, productEligible: false }, now).eligible, false);
  assert.equal(canExtend({ ...ok, warrantyUntil: new Date("2026-01-01") }, now).eligible, false);
  assert.equal(canExtend({ ...ok, extendedUntil: new Date("2029-05-01") }, now).eligible, false);
});

test("επέκταση επί πληρωμή: ίδιοι όροι χωρίς το CCCWARRANTY", () => {
  const now = new Date("2026-10-10");
  const ok = { registeredBy: "erp", warrantyUntil: new Date("2027-05-01"), extendedUntil: null };
  assert.equal(canExtendAtAll(ok, now).eligible, true);
  assert.equal(canExtendAtAll({ ...ok, extendedUntil: new Date("2029-05-01") }, now).eligible, false);
  assert.equal(canExtendAtAll({ ...ok, warrantyUntil: new Date("2026-10-01") }, now).eligible, false);
  assert.equal(canExtendAtAll({ ...ok, registeredBy: "manual" }, now).eligible, false);
});

test("τιμή επέκτασης: η πιο ειδική κατηγορία, μετά οι γενικές κλίμακες", () => {
  const p = normalizePricing({ enabled: true, tiers: [
    { id: "a", category: "psygeia", min: 0, max: 200, price: 29 },
    { id: "b", category: "psygeia", min: 200.01, max: 500, price: 49 },
    { id: "c", category: "", min: 0, max: "", price: "39" },
    { id: "bad", category: "", min: 500, max: 100, price: 10 },
  ] });
  assert.equal(p.tiers.length, 3);
  assert.equal(extensionPrice(p, ["psygeia-diplopora", "psygeia"], 180)?.price, 29);
  assert.equal(extensionPrice(p, ["psygeia-diplopora", "psygeia"], 450)?.price, 49);
  assert.equal(extensionPrice(p, ["psygeia"], 900)?.price, 39);
  assert.equal(extensionPrice(p, ["tileoraseis"], 900)?.price, 39);
  assert.equal(extensionPrice(p, ["tileoraseis"], null), null);
  assert.equal(extensionPrice({ ...p, enabled: false }, ["psygeia"], 180), null);
});
