import { test } from "node:test";
import assert from "node:assert/strict";
import { docKind } from "./doc-kind";
import { cleanValue, fieldKey } from "../custom-fields";

test("docKind classifies SoftOne type names", () => {
  assert.equal(docKind("ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ-Δ.ΑΠΟΣΤΟΛΗΣ"), "sale");
  assert.equal(docKind("ΑΠΟΔ.ΛΙΑΝ.ΠΩΛΗΣΗΣ-Δ.ΑΠΟΣΤΟΛΗΣ"), "sale");
  assert.equal(docKind("ΑΠΟΔΕΙΞΗ ΕΠΙΣΤΡΟΦΗΣ ΛΙΑΝΙΚΩΝ ΠΩΛΗΘΕΝΤΩΝ"), "credit");
  assert.equal(docKind("(E-shop) Πιστωτικό Τιμολόγιο"), "credit");
  assert.equal(docKind("ΠΡΟ-ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ"), "offer");
  assert.equal(docKind("(E-shop) Ακυρώτικο Πιστωτικό Τιμολόγιο"), "cancel");
  assert.equal(docKind("ΠΑΡΑΓΓΕΛΙΑ e-Shop Ακυρωμένη"), "cancel");
  assert.equal(docKind("ΠΑΡΑΓΓΕΛΙΑ ΜΕΛΟΥΣ ON-LINE"), "order");
  assert.equal(docKind("ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ"), "delivery");
});

test("custom fields: keys and values", () => {
  assert.equal(fieldKey("Λήξη σύμβασης"), "lixi_symvasis");
  assert.deepEqual(cleanValue({ type: "number", options: [], label: "x" }, "12,5"), { ok: true, value: 12.5 });
  assert.equal(cleanValue({ type: "link", options: [], label: "x" }, "ftp://a").ok, false);
  assert.equal(cleanValue({ type: "select", options: ["α"], label: "x" }, "β").ok, false);
  assert.deepEqual(cleanValue({ type: "text", options: [], label: "x" }, ""), { ok: true, value: null });
});
