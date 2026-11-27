import { test } from "node:test";
import assert from "node:assert/strict";
import { athensAt, isDue, nextRun, pickDue, type Schedule } from "./due";

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

// ---------- ποιες εργασίες ξεκινούν σε ένα tick ----------
const job = (key: string, group: string, maxMin = 20, everyMin = 10) => ({ key, group, maxMin, schedule: { everyMin } as Schedule });
const J = [job("catalog", "softone", 20, 30), job("prices", "softone", 5), job("unpaid", "unpaid", 5, 5), job("cart", "cart", 10, 15), job("backup", "backup", 10)];
const NOW = t("2026-11-24T13:40:00Z"), ago = (min: number) => NOW.getTime() - min * 60000;
const keys = (running: Map<string, number>, rows = new Map<string, { enabled: boolean; lastStartAt: Date | null }>(), max = 3) => pickDue(J, rows, running, NOW, max).map((j) => j.key);

test("pickDue: παράλληλα έως το όριο, μία εργασία ανά ομάδα", () => {
  assert.deepEqual(keys(new Map()), ["catalog", "unpaid", "cart"]); // «prices» περιμένει: ίδια ομάδα με «catalog»
  assert.deepEqual(keys(new Map(), new Map(), 10), ["catalog", "unpaid", "cart", "backup"]);
});

test("pickDue: αργή εργασία δεν σταματά τις άλλες, αλλά κρατά την ομάδα της", () => {
  assert.deepEqual(keys(new Map([["catalog", ago(10)]])), ["unpaid", "cart"]); // τρέχει κανονικά: πιάνει μία από τις 3 θέσεις
});

test("pickDue: κολλημένη εργασία δεν πιάνει θέση ούτε ομάδα, και δεν ξεκινά δεύτερο αντίγραφό της", () => {
  // το περιστατικό της 24/11: ο κατάλογος κόλλησε σε κλείδωμα της βάσης και πάγωσαν τιμές και υπενθυμίσεις για 4 ώρες
  assert.deepEqual(keys(new Map([["catalog", ago(240)]])), ["prices", "unpaid", "cart"]);
});

test("pickDue: σε παύση ή πριν από την ώρα της δεν ξεκινά", () => {
  const rows = new Map([["unpaid", { enabled: false, lastStartAt: null }], ["cart", { enabled: true, lastStartAt: new Date(ago(3)) }], ["catalog", { enabled: true, lastStartAt: new Date(ago(31)) }]]);
  assert.deepEqual(keys(new Map(), rows), ["catalog", "backup"]);
});

test("παράθυρο 09–17 ανά 2 ώρες: 09, 11, 13, 15, 17 ώρα Αθήνας, ποτέ εκτός", () => {
  const s: Schedule = { window: [9, 17], stepMin: 120 };
  // 27/11/2026 χειμώνας: Αθήνα = UTC+2
  assert.equal(isDue(s, null, t("2026-11-27T06:59:00Z")), false); // 08:59
  assert.equal(isDue(s, null, t("2026-11-27T07:00:00Z")), true); // 09:00
  assert.equal(isDue(s, t("2026-11-27T07:00:30Z"), t("2026-11-27T08:30:00Z")), false); // 10:30, έτρεξε στις 09:00
  assert.equal(isDue(s, t("2026-11-27T07:00:30Z"), t("2026-11-27T09:00:00Z")), true); // 11:00
  assert.equal(isDue(s, t("2026-11-27T13:00:30Z"), t("2026-11-27T15:00:00Z")), true); // 17:00, τελευταίο
  assert.equal(isDue(s, t("2026-11-27T13:00:30Z"), t("2026-11-27T17:00:00Z")), false); // 19:00: χάθηκε το 17:00, όχι εκτός ωραρίου
  assert.equal(isDue(s, t("2026-11-27T15:00:30Z"), t("2026-11-27T20:00:00Z")), false); // 22:00
  assert.equal(nextRun(s, t("2026-11-27T15:00:30Z"), t("2026-11-27T16:00:00Z")).toISOString(), "2026-11-28T07:00:00.000Z"); // αύριο 09:00
  assert.equal(nextRun(s, t("2026-11-27T07:00:30Z"), t("2026-11-27T08:00:00Z")).toISOString(), "2026-11-27T09:00:00.000Z"); // 11:00
});
