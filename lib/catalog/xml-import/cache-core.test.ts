import { test } from "node:test";
import assert from "node:assert/strict";
import { planFetch, waitMinutes, clampMinFetch, type SnapshotInfo } from "./cache-core";

const NOW = new Date("2026-10-29T12:00:00Z");
const ago = (min: number): SnapshotInfo => ({ fetchedAt: new Date(NOW.getTime() - min * 60_000), bytes: 100, products: 5 });

test("planFetch: «ξανακατέβασέ το» χωρίς αποθηκευμένο XML κατεβάζει — κανένα όριο δεν έχει χρησιμοποιηθεί", () => {
  assert.deepEqual(planFetch(NOW, null, { minFetchMin: 30, intent: "fresh" }), { use: "download", reason: "none", waitMin: 0 });
});

test("planFetch: «χρησιμοποίησε ό,τι έχουμε» χωρίς αποθηκευμένο XML κατεβάζει κι αυτό", () => {
  assert.deepEqual(planFetch(NOW, null, { minFetchMin: 30, intent: "reuse" }), { use: "download", reason: "none", waitMin: 0 });
});

test("planFetch: «χρησιμοποίησε ό,τι έχουμε» με αποθηκευμένο XML ΔΕΝ αγγίζει τον προμηθευτή, όσο παλιό κι αν είναι", () => {
  assert.deepEqual(planFetch(NOW, ago(5), { minFetchMin: 30, intent: "reuse" }), { use: "snapshot", reason: "reuse", waitMin: 25 });
  assert.deepEqual(planFetch(NOW, ago(600), { minFetchMin: 30, intent: "reuse" }), { use: "snapshot", reason: "reuse", waitMin: 0 });
});

test("planFetch: νέα λήψη μέσα στο όριο δίνει το αποθηκευμένο XML και λέει σε πόσα λεπτά επιτρέπεται", () => {
  assert.deepEqual(planFetch(NOW, ago(10), { minFetchMin: 30, intent: "fresh" }), { use: "snapshot", reason: "limit", waitMin: 20 });
});

test("planFetch: μόλις περάσει το όριο, η νέα λήψη επιτρέπεται", () => {
  assert.deepEqual(planFetch(NOW, ago(30), { minFetchMin: 30, intent: "fresh" }), { use: "download", reason: "allowed", waitMin: 0 });
  assert.deepEqual(planFetch(NOW, ago(31), { minFetchMin: 30, intent: "fresh" }), { use: "download", reason: "allowed", waitMin: 0 });
});

test("planFetch: τα λεπτά αναμονής στρογγυλοποιούνται προς τα πάνω — «0 λεπτά» δεν σημαίνει ποτέ «περίμενε»", () => {
  const half: SnapshotInfo = { fetchedAt: new Date(NOW.getTime() - 29.5 * 60_000), bytes: 1, products: null };
  assert.equal(planFetch(NOW, half, { minFetchMin: 30, intent: "fresh" }).waitMin, 1);
});

test("planFetch: όριο 0 σημαίνει «χωρίς όριο»", () => {
  assert.equal(planFetch(NOW, ago(0), { minFetchMin: 0, intent: "fresh" }).use, "download");
});

test("waitMinutes: πόσο μένει μέχρι να επιτρέπεται νέα λήψη", () => {
  assert.equal(waitMinutes(NOW, ago(10).fetchedAt, 30), 20);
  assert.equal(waitMinutes(NOW, ago(40).fetchedAt, 30), 0);
  assert.equal(waitMinutes(NOW, null, 30), 0);
});

test("clampMinFetch: ό,τι γράψει ο χρήστης μένει σε λογικά όρια", () => {
  assert.equal(clampMinFetch(30), 30);
  assert.equal(clampMinFetch(-5), 0);
  assert.equal(clampMinFetch(99999), 1440);
  assert.equal(clampMinFetch(12.7), 12);
  assert.equal(clampMinFetch(Number.NaN), 30);
  assert.equal(clampMinFetch(undefined), 30);
});
