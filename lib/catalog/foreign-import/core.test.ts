import { test } from "node:test";
import assert from "node:assert/strict";
import { detectHeaderRow, suggestTarget, headerSignature, normEan, toRows, resolveMatches, blankOnly, newSpecs, type ForeignRow } from "./core";

test("detectHeaderRow: η επικεφαλίδα είναι η πρώτη γραμμή με ≥2 κελιά που έχει δεδομένα από κάτω", () => {
  const m = [[""], ["", ""], ["EAN", "Τιμή", "Όνομα"], ["5901234123457", "10", "Χ"]];
  assert.equal(detectHeaderRow(m), 2);
  assert.equal(detectHeaderRow([["Τίτλος αναφοράς"], ["EAN", "Τιμή"], ["1", "2"]]), 1);
  assert.equal(detectHeaderRow([["a", "b"]]), 0); // καμία γραμμή δεδομένων → 0
  assert.equal(detectHeaderRow([]), 0);
  assert.equal(detectHeaderRow([[" ", ""], ["x", " "]]), 0);
});

test("suggestTarget: ονόματα στηλών → στόχος", () => {
  assert.deepEqual(suggestTarget("EAN13"), { kind: "field", key: "barcode" });
  assert.deepEqual(suggestTarget("Barcode"), { kind: "field", key: "barcode" });
  assert.deepEqual(suggestTarget("GTIN"), { kind: "field", key: "barcode" });
  assert.deepEqual(suggestTarget("SKU"), { kind: "field", key: "code" });
  assert.deepEqual(suggestTarget("Κωδικός"), { kind: "field", key: "code" });
  assert.deepEqual(suggestTarget("Κωδικός κατασκευαστή"), { kind: "field", key: "factoryCode" });
  assert.deepEqual(suggestTarget("Model"), { kind: "field", key: "factoryCode" });
  assert.deepEqual(suggestTarget("MPN"), { kind: "field", key: "factoryCode" });
  assert.deepEqual(suggestTarget("Part Number"), { kind: "field", key: "factoryCode" });
  assert.deepEqual(suggestTarget("Name"), { kind: "field", key: "name" });
  assert.deepEqual(suggestTarget("Περιγραφή είδους"), { kind: "field", key: "name" });
  assert.deepEqual(suggestTarget("Title"), { kind: "field", key: "name" });
  assert.deepEqual(suggestTarget("Φωτογραφία 2"), { kind: "media", type: "image" });
  assert.deepEqual(suggestTarget("URL εικόνας"), { kind: "media", type: "image" });
  assert.deepEqual(suggestTarget("Image"), { kind: "media", type: "image" });
  assert.deepEqual(suggestTarget("Brand"), { kind: "brand" });
  assert.deepEqual(suggestTarget("Μάρκα"), { kind: "brand" });
  assert.deepEqual(suggestTarget("Κατασκευαστής"), { kind: "brand" });
  assert.deepEqual(suggestTarget("Category"), { kind: "category" });
  assert.deepEqual(suggestTarget("Κατηγορία"), { kind: "category" });
  assert.deepEqual(suggestTarget("Cost"), { kind: "cost" });
  assert.deepEqual(suggestTarget("Τιμή αγοράς"), { kind: "cost" });
  assert.deepEqual(suggestTarget("Net"), { kind: "cost" });
  assert.deepEqual(suggestTarget("RRP"), { kind: "rrp" });
  assert.deepEqual(suggestTarget("Λιανική"), { kind: "rrp" });
  assert.deepEqual(suggestTarget("MSRP"), { kind: "rrp" });
  assert.deepEqual(suggestTarget("Χρώμα"), { kind: "ignore" });
  assert.deepEqual(suggestTarget(""), { kind: "ignore" });
});

test("headerSignature: ίδια για διαφορετική σειρά/πεζά/τόνους/κενά", () => {
  assert.equal(headerSignature(["EAN", "Τιμή"]), headerSignature(["τιμη ", "ean"]));
  assert.equal(headerSignature(["EAN", "Τιμή"]), headerSignature(["τιμη", " ean "]));
  assert.equal(headerSignature(["EAN", "", "Τιμή"]), headerSignature(["Τιμή", "EAN"]));
  assert.notEqual(headerSignature(["EAN", "Τιμή"]), headerSignature(["EAN", "Κόστος"]));
  assert.equal(headerSignature(["Τιμή", "EAN"]), "ean|τιμη");
  assert.equal(headerSignature(["Κωδικός  κατασκευαστή"]), "κωδικόςκατασκευαστή".normalize("NFD").replace(/[̀-ͯ]/g, ""));
});

test("normEan", () => {
  assert.equal(normEan("5901234123457"), "5901234123457");
  assert.equal(normEan(" 5901 2341 23457 "), "5901234123457");
  assert.equal(normEan("5901234123457.0"), "5901234123457");
  assert.equal(normEan("5.90123E+12"), null); // χάθηκαν ψηφία
  assert.equal(normEan("5.901234123457E+12"), "5901234123457");
  assert.equal(normEan("5.901234123457e12"), "5901234123457");
  assert.equal(normEan("123"), null);
  assert.equal(normEan("12345678"), "12345678");
  assert.equal(normEan("123456789012"), "123456789012");
  assert.equal(normEan("12345678901234"), "12345678901234");
  assert.equal(normEan("123456789012345"), null);
  assert.equal(normEan("abc"), null);
  assert.equal(normEan(""), null);
});

const matrix = [
  ["EAN", "Μάρκα", "Κατηγορία", "Φωτογραφία 1", "Φωτογραφία 2", "Χωρητικότητα", "Κόστος", "RRP", "MTRL", "Κωδικός"],
  ["5901234123457", "Samsung", "Πλυντήρια", "http://a/1.jpg, https://a/2.jpg", "ftp://x/3.jpg https://a/4.jpg", "9kg", "100,5", "199", "", "A1"],
  ["", "", "", "", "", "", "", "", "", ""],
  ["", "Άγνωστη", "Χ", "", "", "", "", "", "77", ""],
];
const cfg = {
  columns: {
    0: { kind: "field", key: "barcode" }, 1: { kind: "brand" }, 2: { kind: "category" },
    3: { kind: "media", type: "image" }, 4: { kind: "media", type: "image" }, 5: { kind: "spec", label: "Χωρητικότητα" },
    6: { kind: "cost" }, 7: { kind: "rrp" }, 8: { kind: "field", key: "mtrl" }, 9: { kind: "field", key: "code" },
  } as const,
  brandMap: { Samsung: "b1", "Άγνωστη": null },
  categoryMap: { "Πλυντήρια": "c1" },
};

test("toRows: χάρτες, πολλαπλά URL, κενές γραμμές, rowNo", () => {
  const rows = toRows(matrix, 0, { ...cfg, columns: { ...cfg.columns } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowNo, 2);
  assert.deepEqual(rows[0].fields, { barcode: "5901234123457", code: "A1" });
  assert.equal(rows[0].brandId, "b1");
  assert.equal(rows[0].categoryId, "c1");
  assert.deepEqual(rows[0].media.image, ["http://a/1.jpg", "https://a/2.jpg", "https://a/4.jpg"]);
  assert.deepEqual(rows[0].media.banner, []);
  assert.deepEqual(rows[0].specs, { "Χωρητικότητα": "9kg" });
  assert.equal(rows[0].cost, "100,5");
  assert.equal(rows[0].rrp, "199");
  assert.equal(rows[1].rowNo, 4);
  assert.equal(rows[1].brandId, null);
  assert.equal(rows[1].categoryId, null); // λείπει από τον χάρτη
  assert.equal(rows[1].fields.mtrl, "77");
  assert.equal(rows[1].cost, null);
  assert.deepEqual(rows[1].specs, {});
});

test("toRows: ignore δεν μετράει για κενή γραμμή", () => {
  const rows = toRows([["EAN", "Χρώμα"], ["", "κόκκινο"]], 0, { columns: { 0: { kind: "field", key: "barcode" }, 1: { kind: "ignore" } }, brandMap: {}, categoryMap: {} });
  assert.equal(rows.length, 0);
});

const row = (rowNo: number, fields: ForeignRow["fields"], brandId: string | null = null): ForeignRow => ({ rowNo, fields, specs: {}, media: { image: [], banner: [], video: [] }, brandId, categoryId: null, cost: null, rrp: null });
const idx = () => ({
  byMtrl: new Map([[1, 1], [2, 2], [3, 3]]),
  byCode: new Map([["abc", 1], ["xyz", 2]]),
  byEan: new Map([["5901234123457", 1], ["4006381333931", 2]]),
  byFactory: new Map([["b1|wm100", 3]]),
});

test("resolveMatches: αντιστοίχιση με κάθε κλειδί", () => {
  const r = resolveMatches([
    row(2, { mtrl: "2" }), row(3, { code: " ABC " }), row(5, { factoryCode: "WM100" }, "b1"),
  ], idx());
  assert.deepEqual(r.map((x) => [x.rowNo, x.mtrl, x.problem]), [[2, 2, null], [3, 1, null], [5, 3, null]]);
  // EAN σε επιστημονική μορφή (Excel) βρίσκει το είδος
  assert.deepEqual(resolveMatches([row(2, { barcode: "5.901234123457E+12" })], idx()), [{ rowNo: 2, mtrl: 1, problem: null }]);
});

test("resolveMatches: MTRL κερδίζει — κλειδιά που δεν βρέθηκαν δεν μετράνε", () => {
  const [r] = resolveMatches([row(2, { mtrl: "1", code: "ΔΕΝΥΠΑΡΧΕΙ", barcode: "9999999999999" })], idx());
  assert.deepEqual(r, { rowNo: 2, mtrl: 1, problem: null });
});

test("resolveMatches: EAN και κωδικός σε διαφορετικά είδη → πρόβλημα", () => {
  const [r] = resolveMatches([row(2, { code: "abc", barcode: "4006381333931" })], idx());
  assert.equal(r.mtrl, null);
  assert.match(r.problem!, /κωδικ|EAN/i);
});

test("resolveMatches: mtrl που δεν υπάρχει, άκυρο EAN", () => {
  const [a, b] = resolveMatches([row(2, { mtrl: "99" }), row(3, { barcode: "123" })], idx());
  assert.ok(a.problem);
  assert.equal(b.problem, "Μη έγκυρο EAN");
});

test("resolveMatches: ίδιο είδος σε 2 γραμμές → πρόβλημα και στις δύο", () => {
  const r = resolveMatches([row(2, { code: "abc" }), row(3, { barcode: "5901234123457" }), row(4, { code: "xyz" })], idx());
  assert.equal(r[0].mtrl, 1); assert.ok(r[0].problem);
  assert.equal(r[1].mtrl, 1); assert.ok(r[1].problem);
  assert.equal(r[2].problem, null);
});

test("resolveMatches: κωδικός κατασκευαστή χωρίς μάρκα → καμία αντιστοίχιση (νέο είδος)", () => {
  const [r] = resolveMatches([row(2, { factoryCode: "WM100" })], idx());
  assert.deepEqual(r, { rowNo: 2, mtrl: null, problem: null });
});

test("blankOnly: μόνο πεδία που είναι κενά/null στο τρέχον και έχουν τιμή στο εισερχόμενο", () => {
  assert.deepEqual(
    blankOnly({ name: "Χ", barcode: null, factoryCode: "  ", shortDesc: undefined }, { name: "Υ", barcode: "5901234123457", factoryCode: "M1", shortDesc: "σ", descText: " " }),
    { barcode: "5901234123457", factoryCode: "M1", shortDesc: "σ" },
  );
});

test("newSpecs: αγνοεί ετικέτες που υπάρχουν (πεζά/τόνοι)", () => {
  const memo = "Περιγραφή\nχωρητικοτητα : 9kg\n• Χρώμα: λευκό";
  assert.deepEqual(newSpecs(memo, { "Χωρητικότητα": "10kg", "Βάρος": "60", "Χρώμα": "μαύρο", "Κενό": " " }), { "Βάρος": "60" });
  assert.deepEqual(newSpecs("", { A1: "x" }), { A1: "x" });
});
