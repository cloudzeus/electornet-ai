import { test } from "node:test";
import assert from "node:assert/strict";
import { PLACEHOLDERS, STAGE_BY_FPRMS, currentStage, decide, fillMessage, statusFromDocs, statusPath } from "./erp-stages-core";

const types = [
  { fprms: "7005", notify: true, title: "Λάβαμε", message: "x" }, // ρίζα — ποτέ
  { fprms: "7006", notify: true, title: "Ετοιμάζεται", message: "Γεια {όνομα}, η {παραγγελία} ετοιμάζεται." },
  { fprms: "7061", notify: true, title: "Απόδειξη", message: "Απόδειξη {παραστατικό}" },
  { fprms: "7099", notify: false, title: null, message: "κρυφό" },
];
const doc = (findoc: number, fprms: string, date = "2026-11-06") => ({ findoc, fprms, docNo: `D${findoc}`, date });

test("fills placeholders and keeps unknown ones", () => {
  assert.equal(fillMessage("Γεια { όνομα }, {παραγγελία} {άγνωστο}", { "όνομα": "Μαρία", "παραγγελία": "EUR-1" }), "Γεια Μαρία, EUR-1 {άγνωστο}");
});
test("never notifies the root, unselected types, old docs, or the same type twice", () => {
  const r = decide({ root: 1, today: "2026-11-06", seen: [], types, docs: [doc(1, "7005"), doc(2, "7006"), doc(3, "7099"), doc(4, "7061", "2026-10-01"), doc(5, "7006")] });
  assert.deepEqual(r.fresh.map((d) => d.findoc), [1, 2, 3, 4, 5]);
  assert.deepEqual(r.notify.map((d) => d.findoc), [2]);
});
test("skips docs already seen and types already notified", () => {
  const r = decide({ root: 1, today: "2026-11-06", seen: [{ findoc: 1, fprms: "7005", notified: false }, { findoc: 2, fprms: "7006", notified: true }], types, docs: [doc(1, "7005"), doc(2, "7006"), doc(6, "7006"), doc(7, "7061")] });
  assert.deepEqual(r.fresh.map((d) => d.findoc), [6, 7]);
  assert.deepEqual(r.notify.map((d) => d.findoc), [7]);
});

test("τρέχον στάδιο: το πιο προχωρημένο βήμα, όχι το πιο πρόσφατο παραστατικό", () => {
  // η απόδειξη (7315, βήμα 3) κόπηκε πριν το PKP (7080, βήμα 2) — ο πελάτης πρέπει να βλέπει το πιο προχωρημένο
  const cur = currentStage([{ fprms: "7005", at: "2026-11-01" }, { fprms: "7315", at: "2026-11-03" }, { fprms: "7080", at: "2026-11-04" }]);
  assert.equal(cur?.info.title, "Εκδόθηκε η απόδειξη");
  assert.equal(cur?.info.step, 3);
});

test("τρέχον στάδιο: η ακύρωση υπερισχύει και δεν προχωρά τη μπάρα", () => {
  const cur = currentStage([{ fprms: "7005", at: "2026-11-01" }, { fprms: "7141", at: "2026-11-02" }, { fprms: "7009", at: "2026-11-03" }]);
  assert.equal(cur?.info.title, "Η παραγγελία ακυρώθηκε");
  assert.equal(cur?.info.step, null);
});

test("τρέχον στάδιο: άγνωστοι τύποι αγνοούνται, χωρίς γνωστό τύπο → κανένα στάδιο", () => {
  assert.equal(currentStage([{ fprms: "9999", at: "2026-11-01" }, { fprms: null, at: "2026-11-02" }]), null);
  assert.equal(currentStage([]), null);
});

test("κάθε στάδιο έχει τίτλο και κείμενο με μεταβλητές που γνωρίζουμε", () => {
  const known = new Set(PLACEHOLDERS.map((p) => p.key));
  for (const [fprms, s] of Object.entries(STAGE_BY_FPRMS)) {
    assert.ok(s.title.length > 3 && s.message.length > 20, fprms);
    for (const m of s.message.matchAll(/\{([^{}]+)\}/g)) assert.ok(known.has(m[1].trim() as (typeof PLACEHOLDERS)[number]["key"]), `${fprms}: άγνωστη μεταβλητή {${m[1]}}`);
    assert.equal(fillMessage(s.message, { "όνομα": "Μαρία", "παραγγελία": "EUR-1", "παραστατικό": "e-ΑΛ1", "ημερομηνία": "14/11/2026" }).includes("{"), false, fprms);
  }
});

test("κατάσταση από τα παραστατικά: Πληρωμένη, Παραγγελία/PKP, Δελτίο/Απόδειξη, Ακύρωση", () => {
  const d = (findoc: number, fprms: string, date = "2026-11-27") => ({ findoc, fprms, date });
  assert.equal(statusFromDocs([d(1, "7005")], "courier"), null); // μόνο η ρίζα: τίποτα να αλλάξει
  assert.equal(statusFromDocs([d(1, "7005"), d(2, "7007")], "courier")?.to, "paid");
  assert.equal(statusFromDocs([d(1, "7005"), d(2, "7007"), d(3, "7049"), d(4, "7080")], "courier")?.to, "processing");
  const sh = statusFromDocs([d(1, "7005"), d(2, "7049"), d(3, "7141", "2026-11-28")], "courier");
  assert.equal(sh?.to, "shipped"); assert.equal(sh?.driver.findoc, 3);
  assert.equal(statusFromDocs([d(1, "7005"), d(3, "7315")], "freight")?.to, "shipped");
  // παραλαβή / ραντεβού: το δελτίο δεν σημαίνει «έτοιμη» ή «παραδόθηκε»
  assert.equal(statusFromDocs([d(1, "7005"), d(3, "7141")], "click-collect")?.to, "processing");
  assert.equal(statusFromDocs([d(1, "7005"), d(3, "7315")], "appointment")?.to, "processing");
  assert.equal(statusFromDocs([d(1, "7005"), d(2, "7141"), d(5, "7009")], "courier")?.to, "cancelled"); // η ακύρωση υπερισχύει
  assert.equal(statusFromDocs([d(1, "7005"), d(2, "9999")], "courier"), null); // άγνωστος τύπος
});

test("διαδρομή κατάστασης: μόνο επιτρεπτά βήματα, μόνο προς τα μπρος", () => {
  assert.deepEqual(statusPath("pending", "shipped", "courier"), ["processing", "shipped"]);
  assert.deepEqual(statusPath("pending", "paid", "courier"), ["paid"]);
  assert.deepEqual(statusPath("paid", "processing", "click-collect"), ["processing"]);
  assert.deepEqual(statusPath("shipped", "processing", "courier"), []); // ποτέ πίσω
  assert.deepEqual(statusPath("processing", "paid", "courier"), []);
  assert.deepEqual(statusPath("delivered", "shipped", "courier"), []);
  assert.deepEqual(statusPath("processing", "processing", "courier"), []);
  assert.deepEqual(statusPath("paid", "cancelled", "courier"), ["cancelled"]);
  assert.deepEqual(statusPath("shipped", "cancelled", "courier"), []); // στάλθηκε: δεν ακυρώνεται αυτόματα
  assert.deepEqual(statusPath("cancelled", "shipped", "courier"), []);
});
