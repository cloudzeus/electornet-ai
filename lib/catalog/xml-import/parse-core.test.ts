import { test } from "node:test";
import assert from "node:assert/strict";
import iconv from "iconv-lite";
import { parseFeed, specColumns, SPEC_PREFIX, CATEGORY_PAIR } from "./parse-core";

/** Μικρό feed: τα `extra` μπαίνουν μέσα στο <Product>. */
const feed = (products: string[], decl = `<?xml version="1.0" encoding="utf-8"?>`) =>
  `${decl}<Store><Products>${products.map((p) => `<Product>${p}</Product>`).join("")}</Products></Store>`;
const utf8 = (s: string) => Buffer.from(s, "utf8");
const cell = (r: ReturnType<typeof parseFeed>, row: number, header: string) => {
  const i = r.headers.indexOf(header);
  assert.notEqual(i, -1, `λείπει η στήλη «${header}» — υπάρχουν: ${r.headers.join(", ")}`);
  return r.matrix[row + 1][i];
};

test("parseFeed: utf-8 με BOM και windows-1253 δίνουν τα ίδια ελληνικά", () => {
  const xml = feed([`<SKU>A1</SKU><Name>Θερμός Καφέ</Name>`]);
  const withBom = parseFeed(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8(xml)]));
  assert.equal(cell(withBom, 0, "Name"), "Θερμός Καφέ");

  const greek = feed([`<SKU>A1</SKU><Name>Θερμός Καφέ</Name>`], `<?xml version="1.0" encoding="windows-1253"?>`);
  const win = parseFeed(iconv.encode(greek, "win1253"));
  assert.equal(cell(win, 0, "Name"), "Θερμός Καφέ");
});

test("parseFeed: επαναλαμβανόμενο tag γίνεται αριθμημένες στήλες με τη σειρά του εγγράφου", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><imageurl>u1</imageurl><imageurl>u2</imageurl><imageurl>u3</imageurl>`])));
  assert.equal(cell(r, 0, "imageurl 1"), "u1");
  assert.equal(cell(r, 0, "imageurl 2"), "u2");
  assert.equal(cell(r, 0, "imageurl 3"), "u3");
});

test("parseFeed: διευθύνσεις ΔΕΝ σπάνε σε ετικέτες παρά το «https:»", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><imageurl>https://x.gr/a.jpg</imageurl><imageurl>https://x.gr/b.jpg</imageurl>`])));
  assert.equal(cell(r, 0, "imageurl 1"), "https://x.gr/a.jpg");
  assert.ok(!r.headers.some((h) => h.startsWith(`${SPEC_PREFIX}https`)), `δεν πρέπει να υπάρχει στήλη spec:https — ${r.headers.join(", ")}`);
});

test("parseFeed: ProductSpecification γίνεται στήλη ανά ετικέτα", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><ProductSpecification>Τύπος: Air Cooler</ProductSpecification><ProductSpecification>Brand: Terra</ProductSpecification>`])));
  assert.equal(cell(r, 0, `${SPEC_PREFIX}Τύπος`), "Air Cooler");
  assert.equal(cell(r, 0, `${SPEC_PREFIX}Brand`), "Terra");
  assert.ok(!r.headers.includes("ProductSpecification"), "το ProductSpecification δεν μένει ως στήλη");
});

test("parseFeed: ετικέτα που επαναλαμβάνεται ΑΝΑΜΕΣΑ σε προϊόντα σπάει σε στήλη, ακόμη κι αν κάθε προϊόν έχει ένα μόνο χαρακτηριστικό", () => {
  const r = parseFeed(utf8(feed([
    `<SKU>A1</SKU><ProductSpecification>Χρώμα: Μαύρο</ProductSpecification>`,
    `<SKU>A2</SKU><ProductSpecification>Χρώμα: Λευκό</ProductSpecification>`,
  ])));
  assert.equal(cell(r, 0, `${SPEC_PREFIX}Χρώμα`), "Μαύρο");
  assert.equal(cell(r, 1, `${SPEC_PREFIX}Χρώμα`), "Λευκό");
});

test("parseFeed: πεδίο κειμένου που τυχαίνει να έχει «:» ΔΕΝ σπάει σε ετικέτα", () => {
  const r = parseFeed(utf8(feed([
    `<SKU>A1</SKU><Name>Θερμός: μαύρος 350ml</Name>`,
    `<SKU>A2</SKU><Name>Κούπα: λευκή 400ml</Name>`,
  ])));
  assert.equal(cell(r, 0, "Name"), "Θερμός: μαύρος 350ml");
  assert.ok(!r.headers.some((h) => h.startsWith(SPEC_PREFIX)), `καμία στήλη spec: — ${r.headers.join(", ")}`);
});

test("parseFeed: προϊόν χωρίς φωτογραφίες δίνει κενά κελιά, όχι εξαίρεση", () => {
  const r = parseFeed(utf8(feed([
    `<SKU>A1</SKU><imageurl>u1</imageurl><imageurl>u2</imageurl>`,
    `<SKU>A2</SKU><Description />`,
  ])));
  assert.equal(cell(r, 1, "SKU"), "A2");
  assert.equal(cell(r, 1, "imageurl 1"), "");
  assert.equal(cell(r, 1, "imageurl 2"), "");
});

test("parseFeed: άγνωστο tag γίνεται κανονική στήλη", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><ΚάτιΠρωτόγνωρο>42</ΚάτιΠρωτόγνωρο>`])));
  assert.equal(cell(r, 0, "ΚάτιΠρωτόγνωρο"), "42");
});

test("parseFeed: matrix[0] είναι οι επικεφαλίδες (ώστε να περνά στο toRows με headerRow 0)", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU>`, `<SKU>A2</SKU>`])));
  assert.deepEqual(r.matrix[0], r.headers);
  assert.equal(r.matrix.length, 3);
});

test("parseFeed: counts μετρά προϊόντα, tags, κατηγορίες, ετικέτες και φωτογραφίες", () => {
  const r = parseFeed(utf8(feed([
    `<SKU>A1</SKU><CategoryParent>Κουζίνα</CategoryParent><Category>Σκεύη</Category><imageurl>u1</imageurl><imageurl>u2</imageurl><ProductSpecification>Χρώμα: Μαύρο</ProductSpecification><ProductSpecification>Τύπος: Κατσαρόλα</ProductSpecification>`,
    `<SKU>A2</SKU><CategoryParent>Κουζίνα</CategoryParent><Category>Σκεύη</Category><imageurl>u3</imageurl><ProductSpecification>Τύπος: Τηγάνι</ProductSpecification>`,
    `<SKU>A3</SKU><CategoryParent>Μπάνιο</CategoryParent><Category>Αξεσουάρ</Category>`,
  ])));
  assert.equal(r.counts.products, 3);
  assert.equal(r.counts.categories, 2, "δύο διακριτά ζεύγη κατηγοριών");
  assert.equal(r.counts.specLabels, 2, "Χρώμα + Τύπος");
  assert.equal(r.counts.images, 3);
  assert.equal(r.counts.tags, 5, "SKU, CategoryParent, Category, imageurl, ProductSpecification");
});

test("parseFeed: entities αποκωδικοποιούνται", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><Name>Θόρυβος &lt;55dB &amp; ήσυχο</Name>`])));
  assert.equal(cell(r, 0, "Name"), "Θόρυβος <55dB & ήσυχο");
});

test("specColumns: σπάει στο ΠΡΩΤΟ «:» και κρατά το υπόλοιπο ακέραιο", () => {
  const out = specColumns(["Μέγιστη θερμοκρασία: Έως 12 ώρες κρύο & έως 6 ώρες ζεστό"]);
  assert.deepEqual(out, { "Μέγιστη θερμοκρασία": "Έως 12 ώρες κρύο & έως 6 ώρες ζεστό" });
});

test("specColumns: τιμή χωρίς «:» αγνοείται", () => {
  assert.deepEqual(specColumns(["σκέτο κείμενο χωρίς ετικέτα"]), {});
});

test("specColumns: ίδια ετικέτα δύο φορές ενώνεται με «|»", () => {
  assert.deepEqual(specColumns(["Χρώμα: Μαύρο", "Χρώμα: Λευκό"]), { "Χρώμα": "Μαύρο | Λευκό" });
});

test("specColumns: κενή ετικέτα ή κενή τιμή αγνοείται", () => {
  assert.deepEqual(specColumns(["", "   ", ": χωρίς ετικέτα", "Χρώμα:   "]), {});
});

test("parseFeed: CategoryParent + Category δίνουν και παράγωγη στήλη με το πλήρες ζεύγος", () => {
  const r = parseFeed(utf8(feed([
    `<SKU>A1</SKU><CategoryParent>Κουζίνα</CategoryParent><Category>Σκεύη</Category>`,
    `<SKU>A2</SKU><CategoryParent>Μπάνιο</CategoryParent><Category>Σκεύη</Category>`,
  ])));
  assert.equal(cell(r, 0, CATEGORY_PAIR), "Κουζίνα › Σκεύη");
  assert.equal(cell(r, 1, CATEGORY_PAIR), "Μπάνιο › Σκεύη", "ίδιο φύλλο σε άλλο γονέα είναι άλλη κατηγορία");
});

test("parseFeed: χωρίς γονική κατηγορία δεν φτιάχνεται παράγωγη στήλη", () => {
  const r = parseFeed(utf8(feed([`<SKU>A1</SKU><Category>Σκεύη</Category>`])));
  assert.ok(!r.headers.includes(CATEGORY_PAIR), `δεν χρειάζεται ζεύγος — ${r.headers.join(", ")}`);
});
