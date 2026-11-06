import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, fillMessage } from "./erp-stages-core";

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
