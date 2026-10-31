import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestColumn, unresolvedColumns, duplicateTargets } from "./suggest-core";
import { SPEC_PREFIX, CATEGORY_PAIR } from "./parse-core";

const t = (header: string, samples: string[] = []) => suggestColumn(header, samples);
const kindOf = (header: string, samples: string[] = []) => {
  const s = t(header, samples).target;
  return s.kind === "field" ? `field:${s.key}` : s.kind === "spec" ? `spec:${s.label}` : s.kind === "media" ? `media:${s.type}` : s.kind;
};

test("suggestColumn: αγγλικά XML tags αναγνωρίζονται", () => {
  assert.equal(kindOf("Name"), "field:name");
  assert.equal(kindOf("SKU"), "field:code");
  assert.equal(kindOf("BarcodePiece"), "field:barcode");
  assert.equal(kindOf("NetWeight"), "field:weightKg");
  assert.equal(kindOf("PieceWidth"), "field:widthCm");
  assert.equal(kindOf("PieceHeight"), "field:heightCm");
  assert.equal(kindOf("PieceLength"), "field:lengthCm");
  assert.equal(kindOf("Description"), "field:descText");
  assert.equal(kindOf("Price"), "cost");
  assert.equal(kindOf("PriceRetail"), "rrp");
});

test("suggestColumn: πεδία συσκευασίας και κιβωτίου αγνοούνται εξ ορισμού", () => {
  for (const h of ["BoxNetWeight", "BoxGrossWeight", "BoxWidth", "BoxHeight", "BoxLength", "BarcodeBox", "BarcodeSubbox", "PackageLength", "PackageWidth", "PackageHeight", "PackageWeight", "SubboxWeight", "SubboxLength", "SubboxWidth", "SubboxHeight", "Package"]) {
    assert.equal(kindOf(h), "ignore", `το ${h} πρέπει να αγνοείται`);
    assert.equal(t(h).confidence, "sure", `και με βεβαιότητα — όχι ερώτημα στο AI`);
  }
});

test("suggestColumn: αγγλικές μεταφράσεις και εσωτερικά κλειδιά του προμηθευτή αγνοούνται", () => {
  for (const h of ["NameEn", "DescriptionEn", "ProductId", "link"]) {
    assert.equal(kindOf(h), "ignore", h);
    assert.equal(t(h).confidence, "sure", h);
  }
});

test("suggestColumn: στήλη χαρακτηριστικού μένει χαρακτηριστικό — ΔΕΝ γίνεται πεδίο κατά λάθος", () => {
  assert.equal(kindOf(`${SPEC_PREFIX}Μέγιστο βάρος`), "spec:Μέγιστο βάρος", "το «Μέγιστο βάρος» είναι αντοχή, όχι το βάρος του προϊόντος");
  assert.equal(kindOf(`${SPEC_PREFIX}Χρώμα`), "spec:Χρώμα");
  assert.equal(kindOf(`${SPEC_PREFIX}Ισχύς`), "spec:Ισχύς");
  assert.equal(kindOf(`${SPEC_PREFIX}Εγγύηση`), "spec:Εγγύηση");
});

test("suggestColumn: η ετικέτα μάρκας γίνεται μάρκα", () => {
  assert.equal(kindOf(`${SPEC_PREFIX}Brand`), "brand");
  assert.equal(kindOf(`${SPEC_PREFIX}Μάρκα`), "brand");
  assert.equal(kindOf(`${SPEC_PREFIX}Κατασκευαστής`), "brand");
});

test("suggestColumn: φωτογραφίες", () => {
  assert.equal(kindOf("imageurl 1"), "media:image");
  assert.equal(kindOf("imageurl 9"), "media:image");
  assert.equal(kindOf("image 2"), "media:image");
  assert.equal(kindOf("PhotoUrl 3"), "media:image");
});

test("suggestColumn: κατηγορία — το πλήρες ζεύγος κερδίζει, τα μέρη του αγνοούνται", () => {
  assert.equal(kindOf(CATEGORY_PAIR), "category");
  assert.equal(kindOf("CategoryParent"), "ignore");
  assert.equal(kindOf("Category"), "ignore");
});

test("suggestColumn: ό,τι δεν ξέρουμε μένει «unsure» για το AI", () => {
  const a = t("WarehouseZone");
  assert.equal(a.target.kind, "ignore");
  assert.equal(a.confidence, "unsure");
  assert.equal(t("NextShipmentDate").confidence, "unsure");
  assert.equal(t("ΚάτιΠρωτόγνωρο").confidence, "unsure");
});

test("suggestColumn: η διαθεσιμότητα του προμηθευτή αναγνωρίζεται", () => {
  assert.equal(kindOf("Availability"), "availability");
  assert.equal(kindOf("Διαθεσιμότητα"), "availability");
});

test("suggestColumn: η μονάδα μαντεύεται από τα δείγματα", () => {
  assert.equal(t("NetWeight", ["4400", "5750"]).transform, "g_kg");
  assert.equal(t("NetWeight", ["4.40", "5.75"]).transform, "none");
  assert.equal(t("PieceWidth", ["1200", "900"]).transform, "mm_cm");
  assert.equal(t("Name", ["4400"]).transform, "none", "μη αριθμητικό πεδίο δεν παίρνει μονάδα");
});

test("unresolvedColumns: επιστρέφει τους δείκτες που θα πάνε στο AI, με τη σειρά", () => {
  const sug = { 0: t("Name"), 1: t("WarehouseZone"), 2: t("BoxWidth"), 3: t("NextShipmentDate") };
  assert.deepEqual(unresolvedColumns(sug), [1, 3]);
});

test("duplicateTargets: δύο στήλες στο ίδιο πεδίο είναι σύγκρουση", () => {
  const sug = { 0: t("PieceLength"), 1: t("PieceDepth"), 2: t("Name") };
  const dups = duplicateTargets(sug, ["PieceLength", "PieceDepth", "Name"]);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].label, "field:lengthCm");
  assert.deepEqual(dups[0].headers, ["PieceLength", "PieceDepth"]);
});

test("duplicateTargets: αγνοημένες στήλες, φωτογραφίες και χαρακτηριστικά δεν συγκρούονται", () => {
  const sug = { 0: t("BoxWidth"), 1: t("BoxHeight"), 2: t("imageurl 1"), 3: t("imageurl 2"), 4: t(`${SPEC_PREFIX}Χρώμα`), 5: t(`${SPEC_PREFIX}Τύπος`) };
  assert.deepEqual(duplicateTargets(sug, ["BoxWidth", "BoxHeight", "imageurl 1", "imageurl 2", `${SPEC_PREFIX}Χρώμα`, `${SPEC_PREFIX}Τύπος`]), []);
});

test("duplicateTargets: ίδια ετικέτα χαρακτηριστικού δύο φορές ΕΙΝΑΙ σύγκρουση", () => {
  const sug = { 0: t(`${SPEC_PREFIX}Χρώμα`), 1: t(`${SPEC_PREFIX}Χρώμα`) };
  assert.equal(duplicateTargets(sug, [`${SPEC_PREFIX}Χρώμα`, `${SPEC_PREFIX}Χρώμα`]).length, 1);
});

test("suggestColumn: μία μόνο στήλη γίνεται προτεινόμενη λιανική — οι άλλες τιμές αγνοούνται", () => {
  assert.equal(kindOf("PriceRetail"), "rrp");
  assert.equal(kindOf("StartingRetailPrice"), "ignore", "τιμή εκκίνησης: ίδια με τη λιανική, θα συγκρουόταν");
  assert.equal(kindOf("PromoRetailPrice"), "ignore", "τιμή προσφοράς: χρονικά περιορισμένη, δεν είναι η λιανική μας");
  assert.equal(t("StartingRetailPrice").confidence, "sure");
  const sug = { 0: t("Price"), 1: t("PriceRetail"), 2: t("StartingRetailPrice"), 3: t("PromoRetailPrice") };
  assert.deepEqual(duplicateTargets(sug, ["Price", "PriceRetail", "StartingRetailPrice", "PromoRetailPrice"]), [], "καμία σύγκρουση τιμών");
});
