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
    "Keyvoto: κωδικός", "Keyvoto: κατηγορία", "Keyvoto: κατηγορία (κωδικός)", "Keyvoto: κατάλογος", "Keyvoto: εκδότης", "Keyvoto: κατάσταση",
    "gtin", "main.Χρώμα", "main.Ενέργεια", "images[].path 1", "images[].path 2",
  ]);
  assert.equal(r.matrix.length, 2);
  assert.deepEqual(r.matrix[1], ["ABC-1", "", "Ψυγεία", "Ψυγείο Χ", "ACME", "Active", "5201234567890", "Λευκό", "A", "https://gallery-api.keyvoto.com/v1/files/a%2F1.png", "https://gallery-api.keyvoto.com/v1/files/a%2F2.png"]);
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
  assert.equal(r.matrix[2][r.headers.indexOf("images[].path 3")], "https://gallery-api.keyvoto.com/v1/files/3.png");
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

test("parseKeyvotoRows: οι διαδρομές αρχείων γίνονται ΠΡΑΓΜΑΤΙΚΕΣ διευθύνσεις", () => {
  // Το έγγραφο δίνει path, όχι URL· χωρίς μετατροπή η εισαγωγή φωτογραφιών θα ζητούσε ανύπαρκτη διεύθυνση.
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({
    document: { media: { images: [{ path: "BA-1/01_Sera.png", mimeType: "image/png" }], documents: [{ path: "BA-1/manual.pdf" }] } },
  })]));
  const at = (h: string) => r.matrix[1][r.headers.indexOf(h)];
  assert.equal(at("media.images[].path"), "https://gallery-api.keyvoto.com/v1/files/BA-1%2F01_Sera.png");
  assert.equal(at("media.documents[].path"), "https://gallery-api.keyvoto.com/v1/files/BA-1%2Fmanual.pdf");
  assert.equal(at("media.images[].mimeType"), "image/png", "τα άλλα πεδία μένουν ως έχουν");
});

test("parseKeyvotoRows: η gallery του πακέτου υπερισχύει της προεπιλογής", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ document: { images: [{ path: "a/1.png" }] } })], new Date(), "https://g.test"));
  assert.equal(r.matrix[1][r.headers.indexOf("images[].path")], "https://g.test/v1/files/a%2F1.png");
});

test("parseKeyvotoRows: πεδίο που δεν είναι διαδρομή αρχείου δεν γίνεται διεύθυνση", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ document: { main: { Σειρά: "Sera/Pro" }, pathNotes: "a/b" } })]));
  assert.equal(r.matrix[1][r.headers.indexOf("main.Σειρά")], "Sera/Pro");
  assert.equal(r.matrix[1][r.headers.indexOf("pathNotes")], "a/b");
});

test("parseKeyvotoRows: διαδρομή που είναι ήδη διεύθυνση μένει ως έχει", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ document: { images: [{ path: "https://cdn.inventor.gr/a.png" }] } })]));
  assert.equal(r.matrix[1][r.headers.indexOf("images[].path")], "https://cdn.inventor.gr/a.png");
});

test("parseKeyvotoRows: το «name» της δημοσίευσης είναι ο ΚΑΤΑΛΟΓΟΣ — δεν λέγεται «όνομα»", () => {
  // Επαληθευμένο ζωντανά: στη σύνοψη το name είναι «Catalogue Inventor x Euronics» για ΚΑΘΕ προϊόν, και η
  // category είναι κωδικός (b2a17c…). Το πραγματικό όνομα είναι στήλη του εγγράφου.
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ name: "Catalogue Inventor x Euronics", category: "b2a17c2ad4235ea8" })]));
  assert.ok(r.headers.includes("Keyvoto: κατάλογος"), `είχε: ${r.headers.slice(0, 5).join(", ")}`);
  assert.ok(r.headers.includes("Keyvoto: κατηγορία (κωδικός)"));
  assert.ok(!r.headers.includes("Keyvoto: όνομα"), "δεν πρέπει να μοιάζει με όνομα προϊόντος");
});

test("parseKeyvotoRows: ο κωδικός κατηγορίας γίνεται ονομασία με τη διαδρομή της", () => {
  const bytes = keyvotoEnvelope([pub({ category: "c1" })], new Date(), "", { c1: "Ηλεκτρικά Είδη › Ψυγεία › Καταψύκτες" });
  const r = parseKeyvotoRows(bytes);
  const at = (h: string) => r.matrix[1][r.headers.indexOf(h)];
  assert.equal(at("Keyvoto: κατηγορία"), "Ηλεκτρικά Είδη › Ψυγεία › Καταψύκτες");
  assert.equal(at("Keyvoto: κατηγορία (κωδικός)"), "c1", "ο κωδικός μένει διαθέσιμος");
});

test("parseKeyvotoRows: κατηγορία που δεν λύθηκε δεν δείχνει κωδικό ως ονομασία", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ category: "αγνωστη" })]));
  assert.equal(r.matrix[1][r.headers.indexOf("Keyvoto: κατηγορία")], "");
  assert.equal(r.matrix[1][r.headers.indexOf("Keyvoto: κατηγορία (κωδικός)")], "αγνωστη");
});

test("parseKeyvotoRows: οι ΟΝΟΜΑΣΙΕΣ μετριούνται ως κατηγορίες, όχι οι κωδικοί", () => {
  const cats = { a: "Ηλεκτρικά › Ψυγεία", b: "Ηλεκτρικά › Ψυγεία" };
  const r = parseKeyvotoRows(keyvotoEnvelope([pub({ category: "a" }), pub({ category: "b" })], new Date(), "", cats));
  assert.equal(r.counts.categories, 1, "δύο κωδικοί που δείχνουν στην ίδια κατηγορία είναι μία");
});
