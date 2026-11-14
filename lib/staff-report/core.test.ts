import { test } from "node:test";
import assert from "node:assert/strict";
import { creditSeconds, fmtDuration, daysBetween, describeAction, athensDay } from "./core";

test("creditSeconds: διπλό ping 0, συνεχόμενο = πραγματικός χρόνος, μετά από διάλειμμα 30", () => {
  assert.equal(creditSeconds(5_000), 0);
  assert.equal(creditSeconds(60_000), 60);
  assert.equal(creditSeconds(150_000), 150);
  assert.equal(creditSeconds(3_600_000), 30);
  assert.equal(creditSeconds(Infinity), 30);
});
test("fmtDuration", () => {
  assert.equal(fmtDuration(0), "0 λ");
  assert.equal(fmtDuration(20), "<1 λ");
  assert.equal(fmtDuration(1500), "25 λ");
  assert.equal(fmtDuration(26_700), "7 ώ 25 λ");
});
test("daysBetween: συμπεριλαμβάνει τα άκρα και περνά την αλλαγή ώρας", () => {
  assert.deepEqual(daysBetween("2026-10-24", "2026-10-26"), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.equal(daysBetween("2026-01-01", "2026-12-31").length, 92);
});
test("athensDay: 22:30 UTC είναι ήδη η επόμενη ημέρα στην Ελλάδα", () => assert.equal(athensDay(new Date("2026-11-13T22:30:00Z")), "2026-11-14"));
test("describeAction", () => {
  assert.deepEqual(describeAction("cms.hero.publish"), { area: "Περιεχόμενο", text: "hero · δημοσίευση" });
  assert.deepEqual(describeAction("staff.create"), { area: "Χρήστες", text: "δημιουργία" });
  assert.deepEqual(describeAction("zzz"), { area: "zzz", text: "zzz" });
});
