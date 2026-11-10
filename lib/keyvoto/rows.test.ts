import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeyvotoBytes, keyvotoEnvelope, keyvotoUrl, parseKeyvotoUrl, parseKeyvotoRows, pairUnits, CATEGORY_COL } from "./rows";
import { CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";
import { suggestColumn, unresolvedColumns, duplicateTargets } from "@/lib/catalog/xml-import/suggest-core";

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

const real = (over: Record<string, unknown> = {}) => ({
  id: "p9", code: "2600018", category: "c1", productStatus: "Active",
  document: {
    "identity-codes": { billingProductName: "PSD18155IN", manufacturer: "Inventor" },
    "gs1-and-barcode": { gtin: "5213013886799" },
    "general-information": { name: { languages: ["el-GR", "en-GB"], "el-GR": "Ψυγειοκαταψύκτης Inox", "en-GB": "Fridge" }, recRetailPriceObj: { value: 479, unit: "Euro" } },
    "unit-dimensions": { widthObj: { value: 545, unit: "Millimeters" }, heightObj: { value: 181, unit: "Centimeters" }, netWeightObj: { value: 12.85, unit: "Milligrams" } },
    main: { noiselevel: 39, reversibledoor: true, color: ["Inox", "Silver"], spacecoverage: { value: 80, unit: "Square Meters" }, warranty: { languages: ["el-GR"], "el-GR": "5 χρόνια" }, "power ": 240 },
    media: { images: [{ path: "a/2.png" }, { path: "a/hero.png", viewAttributes: ["Hero Image"] }], documents: [{ path: "a/manual.pdf" }] },
  },
  ...over,
});

test("parseKeyvotoRows: έτοιμες στήλες που ο οδηγός αναγνωρίζει μόνος του", () => {
  const r = parseKeyvotoRows(keyvotoEnvelope([real()], new Date(), "", { c1: "Ψυγεία › Ψυγειοκαταψύκτες" }, { noiselevel: "Στάθμη Θορύβου [dB(A)]" }));
  const at = (h: string) => r.matrix[1][r.headers.indexOf(h)];
  assert.equal(at("SKU"), "2600018"); assert.equal(at("MPN"), "PSD18155IN"); assert.equal(at("EAN"), "5213013886799");
  assert.equal(at("Name"), "Ψυγειοκαταψύκτης Inox"); assert.equal(at("Brand"), "Inventor"); assert.equal(at("PriceRetail"), "479");
  assert.equal(at(CATEGORY_COL), "Ψυγεία › Ψυγειοκαταψύκτες"); assert.equal(CATEGORY_COL, CATEGORY_PAIR);
  assert.equal(at("Width"), "54.5"); assert.equal(at("Height"), "181"); // χιλιοστά → εκατοστά
  assert.equal(r.headers.includes("NetWeight"), false, "βάρος σε «Milligrams» δεν στέκει: κενό, όχι λάθος νούμερο");
  assert.equal(at("Image 1"), "https://gallery-api.keyvoto.com/v1/files/a%2Fhero.png", "η κύρια φωτογραφία πρώτη");
  assert.equal(at("Image 2"), "https://gallery-api.keyvoto.com/v1/files/a%2F2.png");
  assert.equal(at("spec:Στάθμη Θορύβου [dB(A)]"), "39"); assert.equal(at("spec:reversibledoor"), "Ναι");
  assert.equal(at("spec:color"), "Inox, Silver"); assert.equal(at("spec:spacecoverage"), "80 τ.μ."); assert.equal(at("spec:warranty"), "5 χρόνια"); assert.equal(at("spec:power"), "240");
  assert.equal(at("raw:media.documents[].path"), "https://gallery-api.keyvoto.com/v1/files/a%2Fmanual.pdf");
  assert.equal(at("raw:general-information.name.en-GB"), "Fridge");
  assert.equal(r.headers.some((h) => h.startsWith("raw:main.")), false);
  // ο οδηγός τα λύνει όλα με κανόνες: κανένα «αβέβαιο» (ούτε ερώτημα στο AI), κανένας διπλός στόχος
  const sug = Object.fromEntries(r.headers.map((h, i) => [i, suggestColumn(h, [r.matrix[1][i]])]));
  assert.deepEqual(unresolvedColumns(sug), []);
  assert.deepEqual(duplicateTargets(sug, r.headers), []);
  const target = (h: string) => sug[r.headers.indexOf(h)].target;
  assert.deepEqual(target("SKU"), { kind: "field", key: "code" }); assert.deepEqual(target("Image 1"), { kind: "media", type: "image" });
  assert.deepEqual(target(CATEGORY_COL), { kind: "category" }); assert.deepEqual(target("Brand"), { kind: "brand" }); assert.deepEqual(target("PriceRetail"), { kind: "rrp" });
  assert.deepEqual(target("Width"), { kind: "field", key: "widthCm" }); assert.equal(sug[r.headers.indexOf("Width")].transform, "none");
  assert.deepEqual(target("raw:general-information.name.en-GB"), { kind: "ignore" });
  assert.deepEqual(r.counts, { products: 1, tags: r.headers.length, categories: 1, specLabels: 6, images: 2 });
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

test("pairUnits: εσωτερική + εξωτερική μονάδα που δείχνουν η μία στην άλλη γίνονται μία γραμμή (η εσωτερική)", () => {
  const unit = (contentId: string, code: string, name: string, kg: number, relatives: string[]) =>
    ({ contentId, code, relatives, document: { "general-information": { name: { "el-GR": name } }, gtin: `g-${code}`, main: { btu: "12000" }, "unit-dimensions": { netWeightObj: { value: kg, unit: "Kilograms" } }, media: { images: [{ path: `${code}.png` }] } } });
  const items = [
    unit("o1", "NRO-12", "NRO-12 NURA ΜΙΝΙ SPLIT ΕΞΩΤ.", 21, ["i1"]),
    unit("i1", "NRI-12", "NRI-12 NURA ΜΙΝΙ SPLIT ΕΣΩTEΡIKO", 8, ["o1"]),
    unit("a", "EMPVO-12", "Emperor 12.000 BTU", 30, ["b"]),      // ίδιο όνομα: η ελαφρύτερη είναι η εσωτερική
    unit("b", "EMPVI-12", "Emperor 12.000 BTU", 9.5, ["a"]),
    unit("x", "FAN-1", "Ανεμιστήρας", 3, ["y"]),                   // σχετικά προϊόντα, όχι σετ: μένουν δύο
    unit("y", "FAN-2", "Ανεμιστήρας Tower", 4, ["x"]),
    unit("z", "SOLO", "Ψυγείο", 50, []),
  ];
  const r = pairUnits(items);
  assert.equal(r.pairs, 2);
  assert.deepEqual(r.items.map((x) => x.code), ["NRI-12", "EMPVI-12", "FAN-1", "FAN-2", "SOLO"]);
  assert.equal(r.items[0].pairedWith, "NRO-12");
  const rows = parseKeyvotoRows(keyvotoEnvelope(items));
  assert.equal(rows.counts.products, 5);
  const at = (h: string) => rows.matrix[1][rows.headers.indexOf(h)];
  assert.equal(at("Keyvoto: σετ"), "Εσωτερική + εξωτερική μονάδα (NRO-12) · βάρος σετ 29 = 8 + 21");
  assert.equal(at("NetWeight"), "29"); // το βάρος του προϊόντος είναι του σετ
  assert.equal(at("raw:εξωτερική μονάδα.gtin"), "g-NRO-12");
  assert.equal(at("spec:Εξωτερική μονάδα: βάρος (kg)"), "21");
  assert.equal(at("spec:Εξωτερική μονάδα: μοντέλο"), "NRO-12");
  assert.equal(rows.headers.some((h) => h.startsWith("raw:εξωτερική μονάδα.main") || h.startsWith("raw:εξωτερική μονάδα.media")), false); // ίδια χαρακτηριστικά και οι φωτογραφίες της δεν ξαναμπαίνουν
});
