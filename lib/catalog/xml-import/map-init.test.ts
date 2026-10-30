import { test } from "node:test";
import assert from "node:assert/strict";
import { initTargets, initLabels, initTransforms, initPicks, initSettings, initBrandsOn } from "./map-init";
import type { MappingDraft, SuggestDTO } from "./ui-core";
import { SKIP } from "./skip-core";

const col = (header: string, target: string, label = "", transform: SuggestDTO["cols"][number]["transform"] = "none") =>
  ({ header, target, label, transform, confidence: "sure" as const, samples: [], examples: [], values: null });

const dto = (over: Partial<SuggestDTO> = {}): SuggestDTO => ({
  cols: [col("SKU", "field:code"), col("NetWeight", "field:weightKg", "", "g_kg"), col("spec:Χρώμα", "spec", "Χρώμα")],
  cats: [{ value: "Κουζίνα › Πιατικά", n: 12, categoryId: "cat-1", confidence: "sure" }, { value: "Νέα", n: 3, categoryId: null, confidence: "unsure" }],
  specs: [{ label: "Χρώμα", to: "Απόχρωση", confidence: "sure" }],
  duplicates: [], aiUsed: false, ...over,
});

test("initTargets: κάθε στήλη ξεκινά από την πρότασή της — όχι «αγνόηση»", () => {
  assert.deepEqual(initTargets(dto()), { SKU: "field:code", NetWeight: "field:weightKg", "spec:Χρώμα": "spec" });
});

test("initTargets: άδεια πρόταση δίνει άδειες επιλογές (ο οδηγός δεν έχει φτάσει ακόμη στην αντιστοίχιση)", () => {
  assert.deepEqual(initTargets(dto({ cols: [] })), {});
});

test("initLabels: η δική μας ονομασία του χαρακτηριστικού κερδίζει την ετικέτα του feed", () => {
  assert.equal(initLabels(dto())["spec:Χρώμα"], "Απόχρωση");
});

test("initLabels: χωρίς δική μας ονομασία μένει η ετικέτα του feed", () => {
  assert.equal(initLabels(dto({ specs: [{ label: "Χρώμα", to: null, confidence: "sure" }] }))["spec:Χρώμα"], "Χρώμα");
});

test("initTransforms: η μετατροπή μονάδας έρχεται από την πρόταση", () => {
  assert.deepEqual(initTransforms(dto()), { SKU: "none", NetWeight: "g_kg", "spec:Χρώμα": "none" });
});

test("initPicks: οι κατηγορίες προ-επιλέγονται, οι άλλες ταξινομήσεις ξεκινούν άδειες", () => {
  const p = initPicks(dto());
  assert.deepEqual(p.category, { "Κουζίνα › Πιατικά": "cat-1", "Νέα": null });
  assert.deepEqual(p.brand, {});
});

test("initPicks: με αποθηκευμένο πρότυπο, οι μάρκες και οι μονάδες είναι ήδη διαλεγμένες", () => {
  const p = initPicks(dto({ maps: { brand: { Terra: "b-1" }, unit: { ΤΕΜ: "u-1" }, mark: {} } }));
  assert.deepEqual(p.brand, { Terra: "b-1" });
  assert.deepEqual(p.unit, { ΤΕΜ: "u-1" });
});

test("initSettings: χωρίς πρότυπο οι προεπιλογές, με πρότυπο οι αποθηκευμένες ρυθμίσεις", () => {
  assert.deepEqual(initSettings(dto()), { priceMode: "cost", toSoftone: false, minFetchMin: 30, unitId: null, markId: null });
  const tpl = dto({ settings: { priceMode: "retail", toSoftone: true, minFetchMin: 45, unitId: "u-9", markId: "m-9" } });
  assert.deepEqual(initSettings(tpl), { priceMode: "retail", toSoftone: true, minFetchMin: 45, unitId: "u-9", markId: "m-9" });
});

test("initSettings: παράλογο όριο λήψεων μπαίνει σε πλαίσιο", () => {
  assert.equal(initSettings(dto({ settings: { priceMode: "cost", toSoftone: false, minFetchMin: -9, unitId: null, markId: null } })).minFetchMin, 0);
});

// ---------- πρόχειρο: ό,τι είχε διαλέξει ο χρήστης πριν κλείσει τη σελίδα ----------

const draft = (over: Partial<MappingDraft> = {}): MappingDraft => ({
  targets: {}, labels: {}, transforms: {}, brandMap: {}, categoryMap: {}, unitMap: {}, markMap: {}, brandsOn: [],
  unitId: null, markId: null, priceMode: "cost", toSoftone: false, minFetchMin: 30, ...over,
});

test("initTargets: το πρόχειρο κερδίζει την πρόταση", () => {
  const t = initTargets(dto(), draft({ targets: { NetWeight: "ignore" } }));
  assert.equal(t.NetWeight, "ignore");
  assert.equal(t.SKU, "field:code");
});

test("initTargets: στήλη του προχείρου που δεν υπάρχει πια στο feed αγνοείται", () => {
  const t = initTargets(dto(), draft({ targets: { OldCol: "field:ean" } }));
  assert.equal(Object.hasOwn(t, "OldCol"), false);
});

test("initLabels / initTransforms: το πρόχειρο κερδίζει ανά στήλη", () => {
  assert.equal(initLabels(dto(), draft({ labels: { "spec:Χρώμα": "Χρωματισμός" } }))["spec:Χρώμα"], "Χρωματισμός");
  assert.equal(initTransforms(dto(), draft({ transforms: { NetWeight: "none" } })).NetWeight, "none");
});

test("initPicks: οι αντιστοιχίσεις του προχείρου κερδίζουν, οι υπόλοιπες μένουν από την πρόταση", () => {
  const p = initPicks(dto({ maps: { brand: { Terra: "b-1" }, unit: {}, mark: {} } }), draft({ brandMap: { Terra: "b-2", Homely: SKIP }, categoryMap: { "Νέα": "cat-7" } }));
  assert.deepEqual(p.brand, { Terra: "b-2", Homely: SKIP });
  assert.equal(p.category["Νέα"], "cat-7");
  assert.equal(p.category["Κουζίνα › Πιατικά"], "cat-1");
});

test("initSettings: οι ρυθμίσεις του προχείρου κερδίζουν το πρότυπο, με το όριο σε πλαίσιο", () => {
  const tpl = dto({ settings: { priceMode: "retail", toSoftone: true, minFetchMin: 45, unitId: "u-9", markId: "m-9" } });
  assert.deepEqual(initSettings(tpl, draft({ priceMode: "cost", toSoftone: false, minFetchMin: 9999, unitId: "u-1", markId: null })),
    { priceMode: "cost", toSoftone: false, minFetchMin: 1440, unitId: "u-1", markId: null });
});

test("initBrandsOn: η συμμετοχή των μαρκών γυρνά από το πρόχειρο — ΚΑΙ όποιας δεν έχει ακόμη δική μας μάρκα", () => {
  assert.deepEqual(initBrandsOn(draft({ brandsOn: ["Terra", "Homely"] })), { Terra: true, Homely: true });
});

test("initBrandsOn: χωρίς πρόχειρο δεν επιβάλλεται τίποτα — αποφασίζει η πρόταση", () => {
  assert.deepEqual(initBrandsOn(null), {});
  assert.deepEqual(initBrandsOn(draft()), {});
});
