import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSupplierRow, matchesQuery, dedupeSuppliers } from "./suppliers-core";

test("parseSupplierRow: το TRDR βγαίνει από το ZOOMINFO και ο κωδικός καθαρίζεται", () => {
  const r = parseSupplierRow(["SUPPLIER;347", " Π0001", "ELCO ΒΑΓΙΩΝΗΣ Α.Ε.", "094001499"]);
  assert.deepEqual(r, { s1Trdr: 347, code: "Π0001", name: "ELCO ΒΑΓΙΩΝΗΣ Α.Ε.", afm: "094001499" });
});

test("parseSupplierRow: ZOOMINFO χωρίς αριθμό ή με σκουπίδια → null, όχι εξαίρεση", () => {
  assert.equal(parseSupplierRow(["", "Π0001", "Χ", ""]), null);
  assert.equal(parseSupplierRow(["SUPPLIER;", "Π0001", "Χ", ""]), null);
  assert.equal(parseSupplierRow(["SUPPLIER;abc", "Π0001", "Χ", ""]), null);
  assert.equal(parseSupplierRow(["347", "Π0001", "Χ", ""]), null, "χωρίς «;» δεν το εμπιστευόμαστε");
});

test("parseSupplierRow: προμηθευτής χωρίς όνομα δεν περνά", () => {
  assert.equal(parseSupplierRow(["SUPPLIER;347", "Π0001", "   ", "094001499"]), null);
});

test("parseSupplierRow: κενό ΑΦΜ γίνεται null, όχι κενό κείμενο", () => {
  assert.equal(parseSupplierRow(["SUPPLIER;347", "Π0001", "ΕΛΚΟ", "  "])?.afm, null);
});

test("dedupeSuppliers: ο browser δίνει κάθε προμηθευτή δύο φορές — μένει ένας", () => {
  const a = { s1Trdr: 347, code: "Π0001", name: "ELCO", afm: "094001499" };
  const b = { s1Trdr: 322, code: "Π0058", name: "ΔΑΜΚΑΛΙΔΗΣ", afm: "094110760" };
  assert.deepEqual(dedupeSuppliers([a, b, a, b]), [a, b]);
});

test("dedupeSuppliers: κρατά την ΠΡΩΤΗ εμφάνιση και τη σειρά", () => {
  const first = { s1Trdr: 1, code: "Π1", name: "Πρώτο", afm: null };
  const later = { s1Trdr: 1, code: "Π1", name: "Αλλο όνομα", afm: null };
  const other = { s1Trdr: 2, code: "Π2", name: "Δεύτερο", afm: null };
  assert.deepEqual(dedupeSuppliers([first, other, later]), [first, other]);
});

test("matchesQuery: κωδικός, όνομα και ΑΦΜ, χωρίς τόνους και πεζά/κεφαλαία", () => {
  const s = { code: "Π0001", name: "ELCO ΒΑΓΙΩΝΗΣ Α.Ε.", afm: "094001499" };
  assert.ok(matchesQuery(s, "π0001"));
  assert.ok(matchesQuery(s, "elco"));
  assert.ok(matchesQuery(s, "βαγιωνης"), "χωρίς τόνους");
  assert.ok(matchesQuery(s, "ΒΑΓΙΩΝΗΣ"));
  assert.ok(matchesQuery(s, "094001499"));
  assert.ok(matchesQuery(s, ""), "κενό ερώτημα δεν φιλτράρει");
  assert.ok(!matchesQuery(s, "δαμκαλιδης"));
});
