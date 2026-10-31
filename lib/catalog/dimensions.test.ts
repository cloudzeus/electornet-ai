import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDims, pickDims, sameBox } from "./dimensions";

test("extractDims: «Πλάτος x Ύψος x Βάθος» και «Εσωτερική μονάδα διαστάσεις», όχι η εξωτερική", () => {
  assert.equal(extractDims([{ key: "Πλάτος x Ύψος x Βάθος", value: "1041 x 383 x 320 mm" }], "Κλιματιστικά Inverter")?.w, 104.1);
  const d = extractDims([{ key: "Εξωτερική μονάδα διαστάσεις (Π*Υ*Β)", value: "842x596x320 mm" }, { key: "Εσωτερική μονάδα διαστάσεις (Π*Υ*Β)", value: "970x300x224 mm" }], "Κλιματιστικά Inverter");
  assert.deepEqual([d?.w, d?.h, d?.d, d?.kind], [97, 30, 22.4, "indoor-unit"]);
  assert.equal(extractDims([{ key: "Διαστάσεις συσκευασίας", value: "100 x 50 x 40 cm" }]), null);
});

test("pickDims: διαχειριστής → SoftOne → EPREL → κατασκευαστής", () => {
  assert.equal(pickDims([{ source: "web" }, { source: "s1-desc" }])?.source, "s1-desc");
  assert.equal(pickDims([{ source: "channel3" }, { source: "web" }])?.source, "web");
  assert.equal(pickDims([{ source: "eprel" }, { source: "manual" }])?.source, "manual");
  assert.equal(pickDims([]), undefined);
});

test("sameBox και όχι «24 bit» ως βάθος", () => {
  assert.equal(sameBox({ w: 27, h: 4.3, d: 19.5 }, { w: 19.5, h: 4.3, d: 27 }), true);
  assert.equal(sameBox({ w: 97, h: 30, d: 22.4 }, { w: 104.1, h: 38.3, d: 32 }), false);
  assert.equal(extractDims([{ key: "Πλάτος", value: "463,7 mm" }, { key: "Ύψος", value: "228,7 mm" }, { key: "Βάθος", value: "24 bit" }]), null);
  assert.equal(extractDims([{ key: "Πλάτος", value: "60 cm" }, { key: "Ύψος", value: "85 εκ." }, { key: "Βάθος", value: "55" }])?.d, 55);
});
