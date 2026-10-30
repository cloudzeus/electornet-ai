import { test } from "node:test";
import assert from "node:assert/strict";
import { athensAt, isDue, nextRun } from "./due";

// 30/10/2026: χειμερινή ώρα Ελλάδας από 25/10 → UTC+2
const t = (iso: string) => new Date(iso);

test("athensAt: 03:30 Αθήνα = 01:30 UTC τον χειμώνα, 00:30 UTC το καλοκαίρι", () => {
  assert.equal(athensAt(t("2026-10-30T12:00:00Z"), 3, 30).toISOString(), "2026-10-30T01:30:00.000Z");
  assert.equal(athensAt(t("2026-07-15T12:00:00Z"), 3, 30).toISOString(), "2026-07-15T00:30:00.000Z");
});

test("κάθε Ν λεπτά: τρέχει αν δεν έτρεξε ποτέ ή πέρασε το διάστημα", () => {
  const s = { everyMin: 30 };
  assert.equal(isDue(s, null, t("2026-10-30T12:00:00Z")), true);
  assert.equal(isDue(s, t("2026-10-30T11:45:00Z"), t("2026-10-30T12:00:00Z")), false);
  assert.equal(isDue(s, t("2026-10-30T11:30:00Z"), t("2026-10-30T12:00:00Z")), true);
});

test("καθημερινά: μία φορά μετά την ώρα του, όχι πριν", () => {
  const s = { dailyAt: [3, 30] as [number, number] };
  // 03:00 Αθήνα, πριν την ώρα — έτρεξε χθες
  assert.equal(isDue(s, t("2026-10-29T01:31:00Z"), t("2026-10-30T01:00:00Z")), false);
  // 03:31 Αθήνα — δεν έχει τρέξει σήμερα
  assert.equal(isDue(s, t("2026-10-29T01:31:00Z"), t("2026-10-30T01:31:00Z")), true);
  // έτρεξε ήδη σήμερα
  assert.equal(isDue(s, t("2026-10-30T01:31:00Z"), t("2026-10-30T09:00:00Z")), false);
  // ο server ήταν κάτω στις 03:30 → τρέχει όταν ξανασηκωθεί
  assert.equal(isDue(s, t("2026-10-29T01:31:00Z"), t("2026-10-30T09:00:00Z")), true);
});

test("επόμενη εκτέλεση", () => {
  assert.equal(nextRun({ everyMin: 30 }, t("2026-10-30T11:45:00Z"), t("2026-10-30T12:00:00Z")).toISOString(), "2026-10-30T12:15:00.000Z");
  assert.equal(nextRun({ dailyAt: [3, 30] }, t("2026-10-30T01:31:00Z"), t("2026-10-30T09:00:00Z")).toISOString(), "2026-10-31T01:30:00.000Z");
});
