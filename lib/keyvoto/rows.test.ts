import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeyvotoBytes, keyvotoEnvelope, keyvotoUrl, parseKeyvotoUrl, parseKeyvotoRows } from "./rows";

const pub = (over: Record<string, unknown> = {}) => ({
  id: "p1", code: "ABC-1", name: "Ψυγείο Χ", category: "Ψυγεία", publisher: "ACME", productStatus: "Active",
  document: { gtin: "5201234567890", main: { Χρώμα: "Λευκό", Ενέργεια: "A" }, images: [{ path: "a/1.png" }, { path: "a/2.png" }] },
  ...over,
});

test("keyvotoEnvelope: τα προϊόντα γίνονται bytes που αναγνωρίζονται ως Keyvoto", () => {
  const bytes = keyvotoEnvelope([pub()]);
  assert.equal(isKeyvotoBytes(bytes), true);
  assert.equal(isKeyvotoBytes(Buffer.from("<?xml version=\"1.0\"?><Products/>")), false);
  assert.equal(isKeyvotoBytes(Buffer.from('{"other":1}')), false);
});

test("parseKeyvotoRows: οι διαδρομές του εγγράφου γίνονται στήλες", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub()]));
  assert.deepEqual(r.headers, [
    "Keyvoto: κωδικός", "Keyvoto: όνομα", "Keyvoto: κατηγορία", "Keyvoto: εκδότης", "Keyvoto: κατάσταση",
    "gtin", "main.Χρώμα", "main.Ενέργεια", "images[].path 1", "images[].path 2",
  ]);
  assert.equal(r.matrix.length, 2);
  assert.deepEqual(r.matrix[1], ["ABC-1", "Ψυγείο Χ", "Ψυγεία", "ACME", "Active", "5201234567890", "Λευκό", "A", "a/1.png", "a/2.png"]);
});

test("parseKeyvotoRows: πεδίο που λείπει από ένα προϊόν αφήνει κενό κελί, όχι μετατόπιση", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub(), pub({ code: "B-2", document: { gtin: "999" } })]));
  assert.equal(r.matrix[2][r.headers.indexOf("main.Χρώμα")], "");
  assert.equal(r.matrix[2][r.headers.indexOf("gtin")], "999");
  assert.equal(r.matrix[2][0], "B-2");
});

test("parseKeyvotoRows: οι φωτογραφίες αριθμούνται με τη σειρά τους, όσες έχει το προϊόν με τις περισσότερες", () => {
  const many = pub({ document: { images: [{ path: "1.png" }, { path: "2.png" }, { path: "3.png" }] } });
  const r = parseKeyvotoRows(keyvotoEnvelope([pub(), many]));
  assert.deepEqual(r.headers.filter((h) => h.startsWith("images")), ["images[].path 1", "images[].path 2", "images[].path 3"]);
  assert.equal(r.matrix[1][r.headers.indexOf("images[].path 3")], "");
  assert.equal(r.matrix[2][r.headers.indexOf("images[].path 3")], "3.png");
});

test("parseKeyvotoRows: μετρήσεις για το βήμα ελέγχου", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub(), pub({ category: "Κουζίνες" })]));
  assert.equal(r.counts.products, 2);
  assert.equal(r.counts.categories, 2);
  assert.equal(r.counts.specLabels, 2); // main.Χρώμα, main.Ενέργεια
  assert.equal(r.counts.images, 2);
  assert.equal(r.counts.tags, r.headers.length);
});

test("parseKeyvotoRows: άδειο πακέτο δεν σκάει", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([]));
  assert.equal(r.counts.products, 0);
  assert.deepEqual(r.matrix, [[]]);
});

test("keyvotoUrl / parseKeyvotoUrl: η πηγή γίνεται διεύθυνση και πίσω", () => {
  assert.equal(keyvotoUrl("acme"), "keyvoto:acme");
  assert.equal(keyvotoUrl("acme", "cat-7"), "keyvoto:acme/cat-7");
  assert.deepEqual(parseKeyvotoUrl("keyvoto:acme/cat-7"), { publisher: "acme", catalogue: "cat-7" });
  assert.deepEqual(parseKeyvotoUrl("keyvoto:acme"), { publisher: "acme", catalogue: "" });
  assert.equal(parseKeyvotoUrl("https://x/feed.xml"), null);
});
