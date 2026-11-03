import { test } from "node:test";
import assert from "node:assert/strict";
import { acSide, acPairs } from "./split-core";

// Πραγματικά ζεύγη του SoftOne (SPCS 5-8) και του Keyvoto της Inventor.
const toyotomi = [
  { key: "20.709HTi", name: "HTN-709R32 (R32) TOYOTOMI HIRO INV.IN DELTA DOMESTIC" },
  { key: "20.709HTo", name: "HTG-709R32 (R32) TOYOTOMI HIRO INV.OUT DELTA DOMESTIC" },
];

test("acSide: «INV.IN» είναι εσωτερική, «INV.OUT» εξωτερική", () => {
  assert.equal(acSide(toyotomi[0].name, toyotomi[0].key), "in");
  assert.equal(acSide(toyotomi[1].name, toyotomi[1].key), "out");
});

test("acSide: ελληνικά και σκέτο IN/OUT", () => {
  assert.equal(acSide("Κλιματιστικό ΕΣΩΤΕΡΙΚΗ ΜΟΝΑΔΑ 9000 BTU", ""), "in");
  assert.equal(acSide("Κλιματιστικό εξωτερική μονάδα 9000 BTU", ""), "out");
  assert.equal(acSide("NRI-09WFI NURA INVERTER ΜΙΝΙ SPLIT ΕΣΩTEΡIKO", ""), "in");
});

test("acSide: ο κωδικός που τελειώνει σε i/o μετρά μόνο όταν το όνομα δεν λέει τίποτα", () => {
  assert.equal(acSide("TOYOTOMI HIRO 9000 BTU", "20.709HTi"), "in");
  assert.equal(acSide("TOYOTOMI HIRO 9000 BTU", "20.709HTo"), "out");
  // «Mini» δεν είναι εξωτερική μονάδα επειδή τελειώνει σε i
  assert.equal(acSide("Ηχείο Mini", "SPEAKER-MINI"), null);
});

test("acSide: ό,τι δεν είναι κλιματιστικό ή δεν έχει ένδειξη μένει κενό", () => {
  assert.equal(acSide("LAMTECH 4K ACTION CAMERA", "LAM021615"), null);
  assert.equal(acSide("", ""), null);
});

test("acPairs: οι δύο μονάδες του ίδιου μοντέλου γίνονται ένα ζεύγος", () => {
  const out = acPairs(toyotomi);
  assert.equal(out.length, 1);
  assert.equal(out[0].inner.key, "20.709HTi");
  assert.equal(out[0].outer.key, "20.709HTo");
});

test("acPairs: μονάδα χωρίς το ταίρι της δεν είναι ζεύγος", () => {
  assert.deepEqual(acPairs([toyotomi[0]]), []);
  assert.deepEqual(acPairs([toyotomi[1]]), []);
});

test("acPairs: δύο μοντέλα δεν μπερδεύονται μεταξύ τους", () => {
  const rows = [
    ...toyotomi,
    { key: "20.717HTi", name: "HTN-717R32 (R32) TOYOTOMI HIRO INV.IN DELTA" },
    { key: "20.717HTo", name: "HTG-717R32 (R32) TOYOTOMI HIRO INV.OUT DELTA" },
  ];
  const out = acPairs(rows);
  assert.equal(out.length, 2);
  assert.ok(out.every((x) => x.inner.key.slice(0, 7) === x.outer.key.slice(0, 7)), JSON.stringify(out));
});

test("acPairs: χωρίς κοινό κωδικό ταιριάζει με το όνομα χωρίς την ένδειξη", () => {
  const rows = [
    { key: "A1", name: "Κλιματιστικό Aria 9000 BTU ΕΣΩΤΕΡΙΚΗ ΜΟΝΑΔΑ" },
    { key: "B2", name: "Κλιματιστικό Aria 9000 BTU ΕΞΩΤΕΡΙΚΗ ΜΟΝΑΔΑ" },
  ];
  assert.equal(acPairs(rows).length, 1);
});
