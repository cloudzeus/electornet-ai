import { test } from "node:test";
import assert from "node:assert/strict";
import { fillMissing, planFill, checkDims, checkWeight, descCandidate, webCandidate, weightFromSpecs, type FillRow } from "./dim-fill-core";

const row = (over: Partial<FillRow> = {}): FillRow => ({
  productId: "p1", erpCode: "1234", title: "Πλυντήριο BOSCH WAN28',", typeName: "Πλυντήρια ρούχων",
  isSet: false, item: { weightKg: null, widthCm: null, heightCm: null, lengthCm: null }, specs: [], dims: [], ...over,
});
const d = (source: string, w: number, h: number, dd: number, warning: string | null = null) => ({ source, w, h, d: dd, kind: "product", warning });

// ---------- τι λείπει ----------

test("λείπουν όλα όταν τα πεδία του SoftOne είναι κενά", () => {
  assert.deepEqual(fillMissing(row().item), { dims: true, weight: true, partialDims: false });
});

test("τα μηδενικά του SoftOne είναι κενά", () => {
  assert.deepEqual(fillMissing({ weightKg: 0, widthCm: 0, heightCm: 0, lengthCm: 0 }), { dims: true, weight: true, partialDims: false });
});

test("πλήρες είδος: δεν λείπει τίποτα", () => {
  assert.deepEqual(fillMissing({ weightKg: 68.5, widthCm: 60, heightCm: 85, lengthCm: 55 }), { dims: false, weight: false, partialDims: false });
});

test("μισές διαστάσεις: σημαίνεται ως μερικές — δεν συμπληρώνονται από άλλη πηγή", () => {
  assert.deepEqual(fillMissing({ weightKg: 68.5, widthCm: 60, heightCm: null, lengthCm: null }), { dims: true, weight: false, partialDims: true });
});

// ---------- όρια ----------

test("διαστάσεις μέσα στα όρια 1–400 εκ.", () => {
  assert.equal(checkDims({ w: 60, h: 85, d: 55 }, "Πλυντήρια ρούχων"), null);
  assert.match(checkDims({ w: 0.4, h: 85, d: 55 }, "")!, /εκτός ορίων/);
  assert.match(checkDims({ w: 600, h: 85, d: 55 }, "")!, /εκτός ορίων/);
});

test("διαστάσεις εκτός τυπικών ορίων του τύπου: θέλει μάτι", () => {
  assert.match(checkDims({ w: 60, h: 850, d: 55 }, "Πλυντήρια ρούχων")!, /εκτός/);
  assert.match(checkDims({ w: 8, h: 6, d: 5 }, "Πλυντήρια ρούχων")!, /τυπικών ορίων/);
});

test("βάρος 0,01–300 κιλά", () => {
  assert.equal(checkWeight(68.5), null);
  assert.match(checkWeight(0)!, /εκτός ορίων/);
  assert.match(checkWeight(0.005)!, /εκτός ορίων/);
  assert.match(checkWeight(450)!, /εκτός ορίων/);
});

// ---------- βάρος από τα χαρακτηριστικά ----------

test("βάρος: κιλά και γραμμάρια", () => {
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "6,3 kg" }]), 6.3);
  assert.equal(weightFromSpecs([{ key: "Καθαρό Βάρος (kg)", value: "29" }]), 29);
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "850 g" }]), 0.85);
  assert.equal(weightFromSpecs([{ key: "Βάρος προϊόντος", value: "1,5 κιλά" }]), 1.5);
});

test("βάρος: πρώτα η συσκευασία", () => {
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "68,5 kg" }, { key: "Βάρος συσκευασίας", value: "70,5 kg" }]), 70.5);
});

test("βάρος: το «Βάρος μέσων δίσκου χαρτιού: 64 - 105 g/m²» δεν είναι βάρος προϊόντος", () => {
  assert.equal(weightFromSpecs([{ key: "Βάρος μέσων δίσκου χαρτιού", value: "64 - 105 g/m²" }]), null);
  assert.equal(weightFromSpecs([{ key: "Βάρος μέσων δίσκου χαρτιού", value: "64 - 105 g/m²" }, { key: "Βάρος", value: "6,3 kg" }]), 6.3);
});

test("βάρος: εύρη και μονάδες ανά επιφάνεια πετιούνται", () => {
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "60 - 90 g/m²" }]), null);
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "περίπου 5 κιλά και κάτι" }]), null);
  assert.equal(weightFromSpecs([{ key: "Βάρος", value: "—" }]), null);
});

// ---------- υποψήφιες τιμές ανά πηγή ----------

test("από την περιγραφή: διαστάσεις του ERP και βάρος από τα χαρακτηριστικά", () => {
  const c = descCandidate(row({
    dims: [d("s1-desc", 59.8, 84.5, 55)],
    specs: [{ key: "Βάρος συσκευασίας", value: "70,5 kg" }, { key: "Βάρος", value: "68,5 kg" }],
  }));
  assert.deepEqual(c.dims, { w: 59.8, h: 84.5, d: 55 });
  assert.equal(c.weightKg, 70.5);
  assert.equal(c.kind, "desc");
});

test("από την περιγραφή: δεν παίρνει τις εξωτερικές πηγές", () => {
  assert.equal(descCandidate(row({ dims: [d("icecat", 59.8, 84.5, 55)] })).dims, null);
});

test("η χειροκίνητη γραμμή προηγείται της περιγραφής", () => {
  const c = descCandidate(row({ dims: [d("s1-desc", 1, 1, 1), d("manual", 60, 85, 55)] }));
  assert.deepEqual(c.dims, { w: 60, h: 85, d: 55 });
});

test("γραμμή με προειδοποίηση δεν γίνεται υποψήφια", () => {
  const c = descCandidate(row({ dims: [d("s1-desc", 59.8, 84.5, 55, "Διορθώθηκε αυτόματα: όλες οι πλευρές…")] }));
  assert.equal(c.dims, null);
  assert.match(c.note, /προειδοποίηση/);
});

test("από το internet: μόνο οι εξωτερικές πηγές, με τη σειρά τους", () => {
  const c = webCandidate(row({
    dims: [d("channel3", 1, 2, 3), d("web", 60, 85, 55)],
    specs: [{ key: "Βάρος", value: "68,5 kg" }],
  }));
  assert.deepEqual(c.dims, { w: 60, h: 85, d: 55 });
  assert.equal(c.weightKg, 68.5);
  assert.equal(c.kind, "web");
});

// ---------- σχέδιο εγγραφής ----------

test("όλα κενά και καθαρές τιμές: γράφονται και τα τέσσερα πεδία", () => {
  const p = planFill(row({ dims: [d("s1-desc", 59.8, 84.5, 55)], specs: [{ key: "Βάρος", value: "68,5 kg" }] }));
  assert.equal(p.skip, null);
  assert.equal(p.source, "desc");
  assert.deepEqual(p.write, { widthCm: 59.8, heightCm: 84.5, lengthCm: 55, weightKg: 68.5 });
  assert.equal(p.needWeb, false);
  assert.deepEqual(p.review, []);
});

test("τιμή που υπάρχει ήδη δεν ξαναγράφεται", () => {
  const p = planFill(row({
    item: { weightKg: 70, widthCm: null, heightCm: null, lengthCm: null },
    dims: [d("s1-desc", 59.8, 84.5, 55)], specs: [{ key: "Βάρος", value: "68,5 kg" }],
  }));
  assert.deepEqual(p.write, { widthCm: 59.8, heightCm: 84.5, lengthCm: 55 });
});

test("μερικές διαστάσεις: δεν αγγίζονται, μπαίνει στη λίστα «θέλει μάτι»", () => {
  const p = planFill(row({
    item: { weightKg: 70, widthCm: 60, heightCm: null, lengthCm: null },
    dims: [d("s1-desc", 59.8, 84.5, 55)],
  }));
  assert.deepEqual(p.write, {});
  assert.match(p.review.join(" "), /μερικές διαστάσεις/);
  assert.equal(p.needWeb, false);
});

test("παράλογες τιμές: δεν γράφονται, πάνε στη λίστα «θέλει μάτι»", () => {
  const p = planFill(row({ dims: [d("s1-desc", 6, 8, 5)], specs: [{ key: "Βάρος", value: "900 kg" }] }));
  assert.deepEqual(p.write, {});
  assert.equal(p.review.length, 2);
  assert.equal(p.needWeb, true);
});

test("σετ: ποτέ", () => {
  const p = planFill(row({ isSet: true, dims: [d("s1-desc", 59.8, 84.5, 55)] }));
  assert.match(p.skip!, /Σετ/);
  assert.deepEqual(p.write, {});
  assert.equal(p.needWeb, false);
});

test("είδος χωρίς SoftOne: ποτέ", () => {
  const p = planFill(row({ item: null }));
  assert.match(p.skip!, /SoftOne/);
});

test("τίποτα δεν λείπει: παραλείπεται", () => {
  const p = planFill(row({ item: { weightKg: 68.5, widthCm: 60, heightCm: 85, lengthCm: 55 } }));
  assert.match(p.skip!, /Έχει ήδη/);
  assert.equal(p.needWeb, false);
});

test("προτεραιότητα πηγών: η περιγραφή νικά το internet", () => {
  const p = planFill(row({ dims: [d("s1-desc", 59.8, 84.5, 55), d("icecat", 10, 10, 10)] }));
  assert.equal(p.source, "desc");
  assert.deepEqual(p.write, { widthCm: 59.8, heightCm: 84.5, lengthCm: 55 });
});

test("χωρίς περιγραφή: οι εξωτερικές πηγές χρησιμοποιούνται μόνο όταν επιτρέπεται το internet", () => {
  const r = row({ dims: [d("web", 60, 85, 55)], specs: [{ key: "Βάρος", value: "68,5 kg" }] });
  assert.deepEqual(planFill(r, { web: false }).write, { weightKg: 68.5 }, "το βάρος των χαρακτηριστικών γράφεται· οι διαστάσεις θέλουν internet");
  assert.equal(planFill(r, { web: false }).needWeb, true);
  const p = planFill(r, { web: true });
  assert.equal(p.source, "web");
  assert.deepEqual(p.write, { widthCm: 60, heightCm: 85, lengthCm: 55, weightKg: 68.5 });
  assert.equal(p.needWeb, false);
});

test("το internet συμπληρώνει μόνο ό,τι δεν βρήκε η περιγραφή", () => {
  const p = planFill(row({
    dims: [d("s1-desc", 59.8, 84.5, 55)],
    specs: [{ key: "Βάρος", value: "68,5 kg" }, { key: "Διαστάσεις", value: "άσχετο" }],
  }), { web: true });
  assert.equal(p.source, "desc");
  assert.deepEqual(p.write, { widthCm: 59.8, heightCm: 84.5, lengthCm: 55, weightKg: 68.5 });
});

test("μόνο βάρος από το internet όταν η περιγραφή έχει μόνο διαστάσεις", () => {
  const p = planFill(row({ dims: [d("s1-desc", 59.8, 84.5, 55)], specs: [] }), { web: true });
  assert.deepEqual(p.write, { widthCm: 59.8, heightCm: 84.5, lengthCm: 55 });
  assert.equal(p.needWeb, true, "το βάρος λείπει ακόμη");
});
