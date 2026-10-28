import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseMoney } from "@/lib/catalog/pricing/markup";
import { detectHeaderRow, suggestTarget, headerSignature, normEan, gtin14, gs1Valid, eanVariants, sameEan, numCell, toRows, resolveMatches, blankOnly, newSpecs, fillBlankMemo, parseCsv, detectDelimiter, configForHeaders, configToSaved, buildMatchIndex, type ForeignRow, type Target } from "./core";

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
  assert.equal(normEan("12345670"), "12345670"); // EAN-8
  assert.equal(normEan("012345678905"), "012345678905"); // UPC-A
  assert.equal(normEan("00012345678905"), "00012345678905"); // GTIN-14
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

const row = (rowNo: number, fields: ForeignRow["fields"], brandId: string | null = null): ForeignRow => ({ rowNo, fields, specs: {}, media: { image: [], banner: [], video: [] }, brandId, categoryId: null, unitId: null, markId: null, cost: null, rrp: null });
const idx = () => ({
  byMtrl: new Map([[1, 1], [2, 2], [3, 3]]),
  byCode: new Map([["abc", 1], ["xyz", 2]]),
  byEan: new Map([["05901234123457", 1], ["04006381333931", 2]]), // κλειδιά GTIN-14
  byFactory: new Map([["b1|wm100", 3]]),
});

test("resolveMatches: αντιστοίχιση με κάθε κλειδί", () => {
  const r = resolveMatches([
    row(2, { mtrl: "2" }), row(3, { code: " ABC " }), row(5, { factoryCode: "WM100" }, "b1"),
  ], idx());
  assert.deepEqual(r.map((x) => [x.rowNo, x.mtrl, x.problem, x.matchedBy]), [[2, 2, null, "mtrl"], [3, 1, null, "code"], [5, 3, null, "factory"]]);
  // EAN σε επιστημονική μορφή (Excel) βρίσκει το είδος
  assert.deepEqual(resolveMatches([row(2, { barcode: "5.901234123457E+12" })], idx()), [{ rowNo: 2, mtrl: 1, problem: null, matchedBy: "ean" }]);
});

test("resolveMatches: MTRL κερδίζει — κλειδιά που δεν βρέθηκαν δεν μετράνε", () => {
  const [r] = resolveMatches([row(2, { mtrl: "1", code: "ΔΕΝΥΠΑΡΧΕΙ", barcode: "9999999999994" })], idx());
  assert.deepEqual(r, { rowNo: 2, mtrl: 1, problem: null, matchedBy: "mtrl" });
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

test("newSpecs: ίδια κανονικοποίηση ετικέτας με το composeMemo (ς/σ, αστερίσκος, κενά)", () => {
  assert.deepEqual(newSpecs("Ισχύς : 2000W", { "Ισχυσ": "1", "Ισχύς*": "2", "ΙΣΧΥΣ": "3", "Ισχύς  ": "4" }), {});
  assert.deepEqual(newSpecs("Μέγιστη   ισχύς : 5", { "μεγιστη ισχυς *": "1" }), {});
  assert.deepEqual(newSpecs("Ισχύς : 2000W", { "Ισχύς κινητήρα": "1" }), { "Ισχύς κινητήρα": "1" });
});

test("suggestTarget: επικεφαλίδες προμηθευτών που παλιότερα έβγαιναν λάθος", () => {
  const F = (key: string) => ({ kind: "field", key });
  assert.deepEqual(suggestTarget("Κωδ. κατασκευαστή"), F("factoryCode"));
  assert.deepEqual(suggestTarget("Κωδ.Κατασκευαστή"), F("factoryCode"));
  assert.deepEqual(suggestTarget("Manufacturer code"), F("factoryCode"));
  assert.deepEqual(suggestTarget("Model name"), F("name"));
  assert.deepEqual(suggestTarget("Model"), F("factoryCode"));
  assert.deepEqual(suggestTarget("Net weight"), F("weightKg"));
  assert.deepEqual(suggestTarget("Βάρος"), F("weightKg"));
  assert.deepEqual(suggestTarget("Net"), { kind: "cost" });
  for (const h of ["Vendor code", "Vendor", "Κωδικός προμηθευτή", "Supplier code", "Κωδικός χρώματος", "Color code", "Κατηγορία ΦΠΑ", "VAT category", "ΦΠΑ"]) {
    assert.deepEqual(suggestTarget(h), { kind: "ignore" }, h);
  }
  for (const h of ["Κωδικός", "Κωδ.", "Code", "SKU", "Κωδικός είδους", "Item code"]) assert.deepEqual(suggestTarget(h), F("code"), h);
  assert.deepEqual(suggestTarget("Κατηγορία"), { kind: "category" });
});

test("fillBlankMemo: memo μόνο με χαρακτηριστικά + νέα περιγραφή → όλες οι αρχικές γραμμές αυτούσιες και με τη σειρά", () => {
  const memo = "• Χωρητικότητα: 9 kg.\r\n\r\n\r\n- Στροφές : 1400;\r\nΕνεργειακή κλάση : A\r\n";
  const out = fillBlankMemo(memo, [{ label: "Βάρος", value: "60" }], "Νέο κείμενο.\nΔεύτερη γραμμή.");
  assert.equal(out, "Νέο κείμενο.\nΔεύτερη γραμμή.\n\n• Χωρητικότητα: 9 kg.\n\n\n- Στροφές : 1400;\nΕνεργειακή κλάση : A\nΒάρος : 60");
});

test("fillBlankMemo: υπάρχουσα ετικέτα δεν αντικαθίσταται ούτε διπλασιάζεται· χωρίς τίποτα νέο ο memo μένει ίδιος", () => {
  const memo = "Χρώμα : Μαύρο\nΙσχύς : 2000W";
  assert.equal(fillBlankMemo(memo, [{ label: "χρωμα", value: "Λευκό" }, { label: "Ισχύς*", value: "1" }]), memo);
  assert.equal(fillBlankMemo(memo, [{ label: "Βάρος", value: "6" }, { label: "ΒΑΡΟΣ", value: "7" }]), `${memo}\nΒάρος : 6`);
  assert.equal(fillBlankMemo("", [{ label: "Βάρος", value: "6" }], "Κείμενο"), "Κείμενο\n\nΒάρος : 6");
  assert.equal(fillBlankMemo("", [], "Κείμενο"), "Κείμενο");
});

test("fillBlankMemo: αν ο memo έχει ήδη ελεύθερο κείμενο, η περιγραφή δεν γράφεται", () => {
  const memo = "Ένα πλυντήριο για όλη την οικογένεια.\nΧρώμα : Μαύρο";
  assert.equal(fillBlankMemo(memo, [], "Άλλο κείμενο"), memo);
  assert.equal(fillBlankMemo(memo, [{ label: "Βάρος", value: "6" }], "Άλλο κείμενο"), `${memo}\nΒάρος : 6`);
});

// ---------- CSV ----------

test("detectDelimiter: το συχνότερο από ; , tab στις πρώτες μη κενές γραμμές (εκτός εισαγωγικών)", () => {
  assert.equal(detectDelimiter("\n\nΚωδικός;Όνομα;Τιμή\n1;Χ;2,5"), ";");
  assert.equal(detectDelimiter("a,b,c\n1,2,3\n4;5"), ",");
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
  assert.equal(detectDelimiter('"a;b;c,d",e'), ","); // μέσα σε εισαγωγικά δεν μετράει
  assert.equal(detectDelimiter("μοναδική στήλη"), ",");
});

test("parseCsv: εισαγωγικά, \"\" escape, αλλαγή γραμμής μέσα σε εισαγωγικά, BOM, CRLF", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2'), [["a", "b"], ["x, y", "2"]]);
  assert.deepEqual(parseCsv('"he said ""hi""",z'), [['he said "hi"', "z"]]);
  assert.deepEqual(parseCsv('"γραμμή1\nγραμμή2",ok\nnext,row'), [["γραμμή1\nγραμμή2", "ok"], ["next", "row"]]);
  assert.deepEqual(parseCsv("\uFEFFΚωδικός;Όνομα\r\n1;Τηλεόραση\r\n"), [["Κωδικός", "Όνομα"], ["1", "Τηλεόραση"]]);
  assert.deepEqual(parseCsv("a;b;;\n\n;x"), [["a", "b"], [], ["", "x"]]); // κενή γραμμή → [], ουρά κενών κομμένη, ευθυγράμμιση γραμμών
  assert.deepEqual(parseCsv(" a ; b \n"), [["a", "b"]]);
  assert.deepEqual(parseCsv(""), []);
});

// ---------- Αποθηκευμένες αντιστοιχίσεις ----------

const T_EAN: Target = { kind: "field", key: "barcode" };
const T_COST: Target = { kind: "cost" };
const T_SPEC: Target = { kind: "spec", label: "Χρώμα" };

test("configToSaved + configForHeaders: οι δείκτες ακολουθούν τις επικεφαλίδες όταν αλλάζει η σειρά", () => {
  const h1 = ["EAN", "Τιμή", "Χρώμα", "Σημειώσεις"];
  const saved = configToSaved({ columns: { 0: T_EAN, 1: T_COST, 2: T_SPEC }, brandMap: { Sony: "12" }, categoryMap: { TV: null } }, h1);
  assert.deepEqual(Object.keys(saved.columns).sort(), ["ean", "τιμη", "χρωμα"].sort()); // κανονικοποιημένο κλειδί
  const h2 = ["Χρώμα", "ΤΙΜΗ ", "Extra", "ean"]; // άλλη σειρά, πεζά/κεφαλαία, νέα στήλη, χωρίς «Σημειώσεις»
  const cfg = configForHeaders(saved, h2);
  assert.deepEqual(cfg.columns, { 0: T_SPEC, 1: T_COST, 3: T_EAN }); // «Extra» άγνωστη → δεν αντιστοιχίζεται
  assert.deepEqual(cfg.brandMap, { Sony: "12" });
  assert.deepEqual(cfg.categoryMap, { TV: null });
});

test("configToSaved: διπλές επικεφαλίδες ξεχωρίζουν με σειρά εμφάνισης, κενές αγνοούνται", () => {
  const h = ["Image", "Image", "", "EAN"];
  const saved = configToSaved({ columns: { 0: { kind: "media", type: "image" }, 1: { kind: "media", type: "banner" }, 2: T_COST, 3: T_EAN }, brandMap: {}, categoryMap: {} }, h);
  assert.equal(Object.keys(saved.columns).length, 3);
  const back = configForHeaders(saved, ["EAN", "Image", "Image"]);
  assert.deepEqual(back.columns, { 0: T_EAN, 1: { kind: "media", type: "image" }, 2: { kind: "media", type: "banner" } });
});

// ---------- Διορθώσεις μετά τα πραγματικά αρχεία ----------

test("detectHeaderRow: γραμμές μεταδεδομένων πάνω από την επικεφαλίδα (Gedore) — κερδίζει η γραμμή με τα περισσότερα κελιά", () => {
  const m = [
    ["", "GEDORE Werkzeugfabrik"],
    ["", "", "Version:", "1.1"],
    ["", "", "Datum:", "Stand 29.10.2025"],
    [""],
    [""],
    ["", "EAN", "Code", "Artikel-Nr.", "Kurzbezeichnung", "Description EN"],
    ["6000240", "4010886600023", "6000240", "1 B 5", "Ring-Maulschlüssel", "Combination spanner"],
  ];
  assert.equal(detectHeaderRow(m), 5);
  assert.equal(detectHeaderRow([["", "", "Version:", "1.1"], ["", "EAN", "Code", "Name", "Price", "Brand"], ["1", "2", "3", "4", "5", "6"]]), 1);
});

test("detectHeaderRow: τίτλος με συγχωνευμένα κελιά (ίδιο κείμενο σε πολλές στήλες) μετράει ως ένα κελί", () => {
  const m = [
    ["", "ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΧΟΝΔΡΙΚΗΣ", "ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΧΟΝΔΡΙΚΗΣ", "ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΧΟΝΔΡΙΚΗΣ"],
    ["Part Number", "Περιγραφή", "Τιμή Μονάδος"],
    ["AK-1", "Θυροτηλέφωνο", "100"],
  ];
  assert.equal(detectHeaderRow(m), 1);
});

test("detectHeaderRow: ισοπαλία → η πρώτη· η τελευταία γραμμή χωρίς δεδομένα από κάτω δεν είναι επικεφαλίδα· μόνο οι πρώτες 30 γραμμές", () => {
  assert.equal(detectHeaderRow([["a", "b", "c"], ["d", "e", "f"], ["g"]]), 0);
  assert.equal(detectHeaderRow([["x", "y"], ["1", "2", "3", "4"]]), 0); // η πλουσιότερη είναι η τελευταία → δεν έχει δεδομένα από κάτω
  const long: string[][] = Array.from({ length: 40 }, () => [""]);
  long[35] = ["a", "b", "c", "d"]; long[36] = ["1"]; long[3] = ["pp", "qq"]; long[4] = ["1"];
  assert.equal(detectHeaderRow(long), 3); // το [35] είναι εκτός των πρώτων 30
});

test("suggestTarget: τιμές χονδρικής/μονάδος → cost, λιανικής → rrp, «Τιμή» μόνη → ignore", () => {
  for (const h of ["Τιμή μονάδος", "Τιμή Μονάδος", "Τιμή χονδρικής", "Χονδρική", "Dealer price", "Net price", "Τιμή αγοράς", "Unit price"]) assert.deepEqual(suggestTarget(h), { kind: "cost" }, h);
  for (const h of ["Τιμή λιανικής", "RRP", "MSRP", "Λιανική"]) assert.deepEqual(suggestTarget(h), { kind: "rrp" }, h);
  assert.deepEqual(suggestTarget("Τιμή"), { kind: "ignore" });
  assert.deepEqual(suggestTarget("ΤΙΜΟΚΑΤΑΛΟΓΟΣ ΧΟΝΔΡΙΚΗΣ"), { kind: "ignore" }); // τίτλος, όχι στήλη
});

test("detectHeaderRow: οι γραμμές δεδομένων δεν επιλέγονται ως επικεφαλίδα (αριθμοί/URL δεν μετράνε, πολλά κελιά δεδομένων δεν νικούν)", () => {
  // περισσότερα κελιά στα δεδομένα από την επικεφαλίδα
  assert.equal(detectHeaderRow([
    ["EAN", "Όνομα", "Τιμή", "Μάρκα"],
    ["5901234123457", "Ψυγείο X", "499,00", "LG", "σημείωση"],
    ["5901234123458", "Πλυντήριο Y", "399,00", "Bosch", "άλλη σημείωση"],
  ]), 0);
  // κενό πρώτο κελί επικεφαλίδας
  assert.equal(detectHeaderRow([["", "EAN", "Όνομα", "Τιμή"], ["1", "5901234123457", "Ψυγείο", "499"], ["2", "5901234123458", "Φούρνος", "299"]]), 0);
  // τρεις στήλες «Image» με URL στα δεδομένα
  assert.equal(detectHeaderRow([
    ["Image", "Image", "Image", "EAN"],
    ["https://x.gr/a.jpg", "https://x.gr/b.jpg", "http://x.gr/c.jpg", "5901234123457"],
    ["www.x.gr/d.jpg", "https://x.gr/e.jpg", "https://x.gr/f.jpg", "5901234123458"],
  ]), 0);
  // Gedore με δεύτερη, ποικίλη γραμμή δεδομένων (πολλές γλώσσες περιγραφής)
  const hdr = ["links", "EAN Code", "Code", "Article-No.", "Description DE", "Description EN", "Description FR", "Description IT", "Brand"];
  assert.equal(detectHeaderRow([
    ["", "GEDORE Werkzeugfabrik"], ["", "", "Version:", "1.1"], [""], hdr,
    ["6000240", "4010886600023", "6000240", "1 B 5", "Ring-Maulschlüssel", "Combination spanner", "Clé mixte hexagonale", "Chiave combinata", "GEDORE"],
    ["6000241", "4010886600030", "6000241", "2 B 6", "Gabelschlüssel doppelt", "Double open ended spanner", "Clé à fourche double", "Chiave a forchetta doppia", "GEDORE"],
  ]), 3);
});

// ---------- Διορθώσεις μετά την αναθεώρηση του Task 6 ----------

test("toRows: μάρκα/κατηγορία όλου του φύλλου ως εφεδρεία όταν η γραμμή δεν έχει τιμή στη στήλη (ή δεν υπάρχει στήλη)", () => {
  const m = [["EAN", "Brand", "Cat"], ["5901234123457", "Sony", ""], ["4006381333931", "", "TV"], ["4006381333931", "Άγνωστη", ""]];
  const cfg = { columns: { 0: { kind: "field", key: "barcode" } as Target, 1: { kind: "brand" } as Target, 2: { kind: "category" } as Target }, brandMap: { Sony: "b1", "Άγνωστη": null }, categoryMap: { TV: "c1" }, sheetBrandId: "bS", sheetCategoryId: "cS" };
  const r = toRows(m, 0, cfg);
  assert.deepEqual(r.map((x) => [x.brandId, x.categoryId]), [["b1", "cS"], ["bS", "c1"], [null, "cS"]]); // τιμή που ο χρήστης άφησε χωρίς αντιστοίχιση ΔΕΝ παίρνει τη μάρκα του φύλλου
  const noCols = toRows([["EAN"], ["5901234123457"]], 0, { columns: { 0: { kind: "field", key: "barcode" } }, brandMap: {}, categoryMap: {}, sheetBrandId: "bS", sheetCategoryId: null });
  assert.deepEqual([noCols[0].brandId, noCols[0].categoryId], ["bS", null]);
});

test("configToSaved + configForHeaders: κρατούν μάρκα/κατηγορία φύλλου", () => {
  const saved = configToSaved({ columns: { 0: T_EAN }, brandMap: {}, categoryMap: {}, sheetBrandId: "bS", sheetCategoryId: "cS" }, ["EAN"]);
  assert.equal(saved.sheetBrandId, "bS"); assert.equal(saved.sheetCategoryId, "cS");
  const back = configForHeaders(saved, ["EAN"]);
  assert.equal(back.sheetBrandId, "bS"); assert.equal(back.sheetCategoryId, "cS");
  const none = configForHeaders(configToSaved({ columns: { 0: T_EAN }, brandMap: {}, categoryMap: {} }, ["EAN"]), ["EAN"]);
  assert.equal(none.sheetBrandId ?? null, null); assert.equal(none.sheetCategoryId ?? null, null);
});

test("toRows: μονάδα/σήμανση — τιμή χωρίς αντιστοίχιση ΚΡΑΤΑ την επιλογή του φύλλου (είναι συμπλήρωμα, όχι κλειδί)", () => {
  const m = [["EAN", "UOM", "Line"], ["5901234123457", "ΤΕΜ", "QLED"], ["4006381333931", "ΑΓΝΩΣΤΗ", ""], ["4006381333932", "", "ΑΛΛΗ"]];
  const cfg = {
    columns: { 0: { kind: "field", key: "barcode" } as Target, 1: { kind: "unit" } as Target, 2: { kind: "mark" } as Target },
    brandMap: {}, categoryMap: {}, unitMap: { "ΤΕΜ": "u1", "ΑΓΝΩΣΤΗ": null }, markMap: { QLED: "m1" },
    sheetUnitId: "uS", sheetMarkId: "mS",
  };
  const r = toRows(m, 0, cfg);
  assert.deepEqual(r.map((x) => [x.unitId, x.markId]), [["u1", "m1"], ["uS", "mS"], ["uS", "mS"]]);
  const noCols = toRows([["EAN"], ["5901234123457"]], 0, { columns: { 0: { kind: "field", key: "barcode" } }, brandMap: {}, categoryMap: {}, sheetUnitId: "uS" });
  assert.deepEqual([noCols[0].unitId, noCols[0].markId], ["uS", null]);
});

test("configToSaved + configForHeaders: κρατούν μονάδα/σήμανση φύλλου και τους χάρτες τους", () => {
  const saved = configToSaved({ columns: { 0: T_EAN }, brandMap: {}, categoryMap: {}, unitMap: { "ΤΕΜ": "u1" }, markMap: {}, sheetUnitId: "uS", sheetMarkId: "mS" }, ["EAN"]);
  assert.deepEqual(saved.unitMap, { "ΤΕΜ": "u1" });
  assert.equal(saved.markMap, undefined); // κενός χάρτης δεν αποθηκεύεται
  assert.equal(saved.sheetUnitId, "uS"); assert.equal(saved.sheetMarkId, "mS");
  const back = configForHeaders(saved, ["EAN"]);
  assert.deepEqual(back.unitMap, { "ΤΕΜ": "u1" });
  assert.equal(back.sheetUnitId, "uS"); assert.equal(back.sheetMarkId, "mS");
});

test("suggestTarget: «Μονάδα μέτρησης» → unit, «Unit price» → cost (η τιμή προηγείται)", () => {
  for (const h of ["Μονάδα", "Μονάδα μέτρησης", "Unit of measure", "UOM"]) assert.deepEqual(suggestTarget(h), { kind: "unit" }, h);
  assert.deepEqual(suggestTarget("Unit price"), { kind: "cost" });
  assert.deepEqual(suggestTarget("Τιμή μονάδος"), { kind: "cost" });
});

test("buildMatchIndex: κανονικοποιημένα κλειδιά, και κλειδί σε 2+ είδη → διφορούμενο (όχι στους κανονικούς χάρτες)", () => {
  const ix = buildMatchIndex([
    { mtrl: 1, code: " ABC ", barcode: "5901234123457", factoryCode: "WM100", brandId: "b1" },
    { mtrl: 2, code: "xyz", barcode: "5901234123457", factoryCode: "wm100 ", brandId: "b1" },
    { mtrl: 3, code: "Q1", barcode: "4006381333931", factoryCode: "WM100", brandId: "b2" },
    { mtrl: 4, code: "q1", barcode: null, factoryCode: null, brandId: null },
    { mtrl: 5, code: "solo", barcode: "123", factoryCode: "F5", brandId: null }, // άκυρο EAN, χωρίς μάρκα → όχι στο byFactory
  ]);
  assert.deepEqual([...ix.byMtrl.keys()], [1, 2, 3, 4, 5]);
  assert.deepEqual([...ix.byCode.entries()], [["abc", 1], ["xyz", 2], ["solo", 5]]);
  assert.deepEqual([...ix.byEan.entries()], [["04006381333931", 3]]); // GTIN-14
  assert.deepEqual([...ix.byFactory.entries()], [["b2|wm100", 3]]);
  assert.deepEqual([...ix.ambiguous!.byCode.entries()], [["q1", [3, 4]]]);
  assert.deepEqual([...ix.ambiguous!.byEan.entries()], [["05901234123457", [1, 2]]]);
  assert.deepEqual([...ix.ambiguous!.byFactory.entries()], [["b1|wm100", [1, 2]]]);
});

test("resolveMatches: γραμμή σε διφορούμενο κλειδί → πρόβλημα με τα MTRL", () => {
  const ix = buildMatchIndex([
    { mtrl: 1, code: "A", barcode: "5901234123457", factoryCode: "WM", brandId: "b1" },
    { mtrl: 2, code: "B", barcode: "5901234123457", factoryCode: "wm", brandId: "b1" },
    { mtrl: 3, code: "c", barcode: null, factoryCode: null, brandId: null },
    { mtrl: 4, code: "C", barcode: null, factoryCode: null, brandId: null },
  ]);
  const [e, c, f, ok] = resolveMatches([row(2, { barcode: "5901234123457" }), row(3, { code: "c" }), row(4, { factoryCode: "WM" }, "b1"), row(5, { code: "a" })], ix);
  assert.deepEqual([e.mtrl, e.problem], [null, "Το EAN 5901234123457 ανήκει σε περισσότερα από ένα είδη (MTRL 1, 2)"]);
  assert.equal(c.problem, "Ο κωδικός c ανήκει σε περισσότερα από ένα είδη (MTRL 3, 4)");
  assert.equal(f.problem, "Ο κωδικός κατασκευαστή WM ανήκει σε περισσότερα από ένα είδη (MTRL 1, 2)");
  assert.deepEqual(ok, { rowNo: 5, mtrl: 1, problem: null, matchedBy: "code" });
  // χωρίς ambiguous (παλιά μορφή ευρετηρίου) όλα δουλεύουν όπως πριν
  assert.deepEqual(resolveMatches([row(2, { code: "abc" })], idx()), [{ rowNo: 2, mtrl: 1, problem: null, matchedBy: "code" }]);
});

// ---------- Διορθώσεις τελικής αναθεώρησης ----------

test("I-1 normEan/gtin14: ψηφίο ελέγχου GS1 και EAN χωρίς τα αριστερά μηδενικά", () => {
  assert.equal(gs1Valid("5901234123457"), true);
  assert.equal(gs1Valid("5901234123458"), false);
  assert.equal(normEan("5901234123458"), null); // λάθος ψηφίο ελέγχου
  assert.equal(normEan("12345678"), null); // EAN-8 με λάθος ψηφίο ελέγχου
  assert.equal(normEan("12345678905"), "0012345678905"); // το Excel έφαγε τα μηδενικά
  assert.equal(gtin14("012345678905"), "00012345678905");
  assert.equal(gtin14("0012345678905"), "00012345678905");
  assert.equal(gtin14("12345678905"), "00012345678905");
  assert.equal(gtin14("bad"), null);
  assert.deepEqual(eanVariants("12345678905"), ["012345678905", "0012345678905", "00012345678905"]);
  assert.deepEqual(eanVariants("12345670"), ["12345670", "000012345670", "0000012345670", "00000012345670"]);
  assert.equal(sameEan("012345678905", "0012345678905"), true);
  assert.equal(sameEan("ABC", " ABC "), true); // όχι EAN → ίδιο κείμενο
  assert.equal(sameEan("5901234123457", "4006381333931"), false);
});

test("I-1 resolveMatches: «012345678905» στο αρχείο βρίσκει το αποθηκευμένο «0012345678905»· λάθος ψηφίο ελέγχου → πρόβλημα", () => {
  const index = buildMatchIndex([{ mtrl: 1, code: "X", barcode: "0012345678905", factoryCode: null, brandId: null }]);
  const [a, b, c] = resolveMatches([row(2, { barcode: "012345678905" }), row(3, { barcode: "5901234123458" }), row(4, { barcode: "12345678905" })], index);
  assert.equal(a.mtrl, 1); assert.equal(a.matchedBy, "ean");
  assert.equal(b.mtrl, null); assert.equal(b.problem, "Μη έγκυρο EAN");
  assert.equal(c.mtrl, 1); // ίδιο είδος από 2 γραμμές → και πρόβλημα
  assert.ok(c.problem);
  // διπλό στο SoftOne σε άλλη μορφή → διφορούμενο
  const amb = buildMatchIndex([{ mtrl: 1, code: "X", barcode: "0012345678905", factoryCode: null, brandId: null }, { mtrl: 2, code: "Y", barcode: "012345678905", factoryCode: null, brandId: null }]);
  assert.match(resolveMatches([row(2, { barcode: "12345678905" })], amb)[0].problem!, /περισσότερα από ένα είδη \(MTRL 1, 2\)/);
});

test("minor toRows: τιμή μάρκας/κατηγορίας «constructor» δεν παίρνει το prototype", () => {
  const [r] = toRows([["Brand", "Cat"], ["constructor", "toString"]], 0, { columns: { 0: { kind: "brand" }, 1: { kind: "category" } }, brandMap: {}, categoryMap: {} });
  assert.equal(r.brandId, null);
  assert.equal(r.categoryId, null);
});

test("minor detectDelimiter: τίτλος με κόμμα πάνω από γραμμές με ;", () => {
  assert.equal(detectDelimiter("Τιμοκατάλογος, Ιανουάριος 2026, όλα τα είδη\nΚωδικός;Όνομα;Τιμή\nA1;Ψυγείο;1,5\nA2;Πλυντήριο;2,5"), ";");
});

test("minor headerSignature/configForHeaders: επικεφαλίδα > 160 χαρακτήρων — η κομμένη της προεπισκόπησης = η πλήρης", () => {
  const long = `Περιγραφή ${"πολύ μεγάλη ".repeat(20)}τέλος`;
  const cut = `${long.slice(0, 159)}…`; // όπως το inspectSheet
  assert.equal(headerSignature(["EAN", cut]), headerSignature(["EAN", long]));
  const saved = configToSaved({ columns: { 1: { kind: "field", key: "name" } }, brandMap: {}, categoryMap: {} }, ["EAN", long]);
  assert.deepEqual(configForHeaders(saved, ["EAN", cut]).columns, { 1: { kind: "field", key: "name" } });
});

test("minor suggestTarget: λιανική με ΦΠΑ / ΤΛΤ / Retail price → ΤΛΤ (rrp)", () => {
  for (const h of ["Λιανική με ΦΠΑ", "Τιμή λιανικής με ΦΠΑ", "ΤΛΤ", "Retail price", "Λιανική τιμή (με ΦΠΑ)"]) assert.deepEqual(suggestTarget(h), { kind: "rrp" }, h);
  assert.deepEqual(suggestTarget("ΦΠΑ"), { kind: "ignore" });
  assert.deepEqual(suggestTarget("Κατηγορία ΦΠΑ"), { kind: "ignore" });
});

test("I-5 numCell: αριθμητικό κελί 1.234 (xlsx) → parseMoney 1.234· κείμενο «1.234» → 1234", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("A");
  ws.getCell("A1").value = 1.234; ws.getCell("A2").value = "1.234"; ws.getCell("A3").value = 5901234123457; ws.getCell("A4").value = { formula: "A1*1", result: 12.345 };
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  const c = (a: string) => back.getWorksheet("A")!.getCell(a).value;
  assert.equal(parseMoney(numCell(c("A1"))!), 1.234);
  assert.equal(numCell(c("A2")), null); // κείμενο → το cellText
  assert.equal(parseMoney(String(c("A2"))), 1234);
  assert.equal(numCell(c("A3")), "5901234123457");
  assert.equal(parseMoney(numCell(c("A4"))!), 12.345);
});
