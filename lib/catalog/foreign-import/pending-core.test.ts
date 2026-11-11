import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingMissing, pendingRow, pendingMedia, pendingSpecs, isStaleCreating, canApprove, STALE_MIN, pendingErp } from "./pending-core";

const ok = { code: "ABC-1", fields: { name: "Ψυγείο" }, brandId: "b1", brandS1Id: "77", specGroupS1Id: 12, webCategoryId: "c1" };

test("pendingMissing: πλήρες είδος → τίποτα", () => {
  assert.deepEqual(pendingMissing(ok), []);
});

test("pendingMissing: κωδικός κενός ή πάνω από 25 χαρακτήρες", () => {
  assert.deepEqual(pendingMissing({ ...ok, code: "" }), ["Κωδικός"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "   " }), ["Κωδικός"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "X".repeat(26) }), ["Κωδικός (έως 25 χαρακτήρες)"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "X".repeat(25) }), []);
});

test("pendingMissing: όνομα", () => {
  assert.deepEqual(pendingMissing({ ...ok, fields: {} }), ["Όνομα"]);
  assert.deepEqual(pendingMissing({ ...ok, fields: { name: "  " } }), ["Όνομα"]);
  assert.deepEqual(pendingMissing({ ...ok, fields: null }), ["Όνομα"]);
});

test("pendingMissing: μάρκα, και μάρκα χωρίς σύνδεση με το SoftOne", () => {
  assert.deepEqual(pendingMissing({ ...ok, brandId: null, brandS1Id: null }), ["Μάρκα"]);
  assert.deepEqual(pendingMissing({ ...ok, brandS1Id: null }), ["Μάρκα συνδεδεμένη με το SoftOne"]);
});

test("pendingMissing: ομάδα χαρακτηριστικών (η κατηγορία site βγαίνει από αυτήν — το webCategoryId δεν απαιτείται)", () => {
  assert.deepEqual(pendingMissing({ ...ok, specGroupS1Id: null }), ["Ομάδα χαρακτηριστικών"]);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: null }), []);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: "" }), []);
});

test("pendingMissing: όλα μαζί, με σταθερή σειρά", () => {
  assert.deepEqual(pendingMissing({ code: "", fields: {}, brandId: null, brandS1Id: null, specGroupS1Id: null, webCategoryId: null }), ["Κωδικός", "Όνομα", "Μάρκα", "Ομάδα χαρακτηριστικών"]);
});

test("pendingRow: ο κωδικός του PendingItem υπερισχύει, χωρίς MTRL, μόνο κείμενα στα χαρακτηριστικά", () => {
  const r = pendingRow({ rowNo: 7, code: " NEW-1 ", fields: { name: "Ψυγείο", code: "OLD", mtrl: "123", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό", "Κενό": " ", "Αριθμός": 5 } }, "Νέα είδη", 12);
  assert.deepEqual(r, { sheet: "Νέα είδη", rowNo: 7, groupS1Id: 12, fields: { name: "Ψυγείο", code: "NEW-1", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό" } });
});

test("pendingRow: μονάδα/σήμανση περνούν ως refs μόνο όταν υπάρχουν", () => {
  const base = { rowNo: 1, code: "A", fields: { name: "Χ" }, specs: {} };
  assert.deepEqual(pendingRow(base, "Νέα είδη", 12, { unit: 1, mark: 3 }).refs, { unit: 1, mark: 3 });
  assert.deepEqual(pendingRow(base, "Νέα είδη", 12, { unit: 1, mark: null }).refs, { unit: 1 });
  assert.equal(pendingRow(base, "Νέα είδη", 12, { unit: null, mark: null }).refs, undefined);
  assert.equal(pendingRow(base, "Νέα είδη", 12).refs, undefined);
});

test("pendingMedia: λίστες URLs, ό,τι άλλο αγνοείται", () => {
  assert.deepEqual(pendingMedia({ image: ["a.jpg", "", 3], video: "x" }), { image: ["a.jpg"], banner: [], video: [] });
  assert.deepEqual(pendingMedia(null), { image: [], banner: [], video: [] });
});

test("isStaleCreating: «creating» πάνω από 15 λεπτά → ανακτήσιμο", () => {
  const now = new Date("2026-10-20T12:00:00Z"), ago = (min: number) => new Date(now.getTime() - min * 60_000);
  assert.equal(STALE_MIN, 15);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(16) }, now), true);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(15.01) }, now), true);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(15) }, now), false);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(1) }, now), false);
  assert.equal(isStaleCreating({ status: "error", updatedAt: ago(60) }, now), false);
});

test("canApprove: pending/error χωρίς MTRL, ή «creating» που κόλλησε", () => {
  const now = new Date("2026-10-20T12:00:00Z"), old = new Date(now.getTime() - 20 * 60_000);
  assert.equal(canApprove({ status: "pending", updatedAt: now, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "error", updatedAt: now, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "error", updatedAt: now, mtrl: 5 }, now), false);
  assert.equal(canApprove({ status: "creating", updatedAt: now, mtrl: null }, now), false);
  assert.equal(canApprove({ status: "creating", updatedAt: old, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "created", updatedAt: old, mtrl: 5 }, now), false);
  assert.equal(canApprove({ status: "discarded", updatedAt: old, mtrl: null }, now), false);
});

test("I-4 pendingSpecs: ετικέτες του χρήστη → ονόματα της ΤΕΛΙΚΗΣ ομάδας· άγνωστες → προειδοποίηση", () => {
  const raw = { "χρωμα": "Λευκό", "Ενεργειακή κλάση": "A", "Άγνωστο": "x", "Κενό": " " };
  const r = pendingSpecs(raw, ["Χρώμα", "Ενεργειακή Κλάση *"]);
  assert.deepEqual(r.specs, { "Χρώμα": "Λευκό", "Ενεργειακή Κλάση *": "A" });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /Άγνωστο/);
  // μη αντικείμενο (παλιά/άκυρα δεδομένα) → τίποτα
  assert.deepEqual(pendingSpecs(null, ["Χρώμα"]), { specs: {}, warnings: [] });
  // και η γραμμή για τη μηχανή παίρνει τα ξανα-αντιστοιχισμένα
  const row = pendingRow({ rowNo: 3, code: "A", fields: { name: "Χ" }, specs: r.specs }, "Νέα είδη", 12);
  assert.deepEqual(row.specs, r.specs);
});

test("webNameOf: έως 64 χαρακτήρες, κόψιμο σε ολόκληρη λέξη", async () => {
  const { webNameOf, leadSentence } = await import("./pending-core");
  assert.equal(webNameOf("Inventor CLP-TT88S Πλυντήριο Πιάτων"), "Inventor CLP-TT88S Πλυντήριο Πιάτων");
  const long = webNameOf("ΗΛ. ΘΕΡΜ. 120lt ΜΟΝΟΥ ΣΥΛΛΕΚΤΗ ΔΙΠΛΗΣ ΕΝΕΡΓΕΙΑΣ OPTIMA MAX GLASS BC 12/2.1 GAUZER");
  assert.ok(long.length <= 64 && long.endsWith("GLASS"), long);
  // δεν χωρά → μάρκα και μοντέλο μπροστά, ώστε να μη χάνονται στο κόψιμο
  const led = webNameOf("ΗΛ. ΘΕΡΜ. 120lt ΜΟΝΟΥ ΣΥΛΛΕΚΤΗ ΔΙΠΛΗΣ ΕΝΕΡΓΕΙΑΣ ΚΕΡΑΜΟΣΚΕΠΗΣ OPTIMA MAX GLASS BCK 12/2.1 GAUZER", 64, { brand: "GAUZER", model: "BCK 12/2.1" });
  assert.ok(led.length <= 64 && led.startsWith("GAUZER BCK 12/2.1 ΗΛ. ΘΕΡΜ. 120lt") && !led.slice(6).includes("GAUZER"), led);
  assert.equal(webNameOf("Inventor CLP-TT88S Πλυντήριο Πιάτων", 64, { brand: "Inventor", model: "CLP-TT88S" }), "Inventor CLP-TT88S Πλυντήριο Πιάτων");
  assert.equal(leadSentence("Ο&nbsp;νέος&nbsp;ψυγειοκαταψύκτης <b>No frost</b> της Inventor. Δεύτερη πρόταση."), "Ο νέος ψυγειοκαταψύκτης No frost της Inventor.");
  assert.equal(leadSentence(""), "");
});

test("newItemCode / missingSpecs / renameSpec", async () => {
  const { newItemCode, missingSpecs, renameSpec, similarSpec } = await import("./pending-core");
  const key = (s: string) => s.toLowerCase().trim();
  assert.equal(newItemCode({ code: "2691103", factoryCode: "CLP-TT88S" }), "CLP-TT88S");
  assert.equal(newItemCode({ code: "2691103" }), "2691103");
  assert.equal(newItemCode({ code: "A1", factoryCode: "X".repeat(30) }), "A1");
  const names = new Map([[975, ["Χρώμα", "Ενεργειακή Κλάση", "Πλάτος"]]]);
  const gaps = missingSpecs([{ specGroupS1Id: 975, specs: { "χρώμα": "Silver", "Πλάτος (cm)": "55", "Τύπος Οθόνης": "LED" } }, { specGroupS1Id: 975, specs: { "Τύπος Οθόνης": "LCD" } }], names, key);
  assert.deepEqual(gaps.map((g) => [g.label, g.items, g.similar]), [["Πλάτος (cm)", 1, "Πλάτος"], ["Τύπος Οθόνης", 2, null]]);
  assert.equal(similarSpec("Στάθμη Θορύβου [dB(A)]", ["Χρώμα"]), null);
  assert.deepEqual(renameSpec({ "Πλάτος (cm)": "55", "Χρώμα": "Silver" }, "Πλάτος (cm)", "Πλάτος", key), { "Χρώμα": "Silver", "Πλάτος": "55" });
});

test("pendingErp: μόνο έγκυροι αριθμοί από το fields._erp· το pendingRow τα περνά ως refs.erp", () => {
  assert.deepEqual(pendingErp({ name: "Χ", _erp: { supplier: 819, busUnit: "2", acn: 0, expval1: 0 } }), { supplier: 819, busUnit: 2, expval1: 0 });
  assert.deepEqual(pendingErp({ _erp: { supplier: -1, expval1: 5000, acn: 1.5 } }), {});
  assert.deepEqual(pendingErp({ name: "Χ" }), {});
  assert.deepEqual(pendingErp(null), {});
  const r = pendingRow({ rowNo: 1, code: "A", fields: { name: "Χ", _erp: { supplier: 819, expval1: 0.5 } }, specs: {} }, "Νέα είδη", 12, { unit: 1 });
  assert.deepEqual(r.fields, { name: "Χ", code: "A" });
  assert.deepEqual(r.refs, { unit: 1, erp: { supplier: 819, expval1: 0.5 } });
});
