import { test } from "node:test";
import assert from "node:assert/strict";
import { canExtend, parseWarrantyMonths, warrantyFromSpecs } from "./policy";

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
