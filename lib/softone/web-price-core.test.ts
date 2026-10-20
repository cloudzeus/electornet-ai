import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRA_COLS, pickExtraRow, extraDiff } from "./web-price-core";

const full = (mtrl: string, company: string, num04: string, over: Record<string, string> = {}) => [mtrl, company, ...EXTRA_COLS.map((c) => over[c] ?? (c === "NUM04" ? num04 : ""))];

test("C-1 pickExtraRow: μία γραμμή, καμία, πολλές ανά εταιρεία", () => {
  assert.deepEqual(pickExtraRow([], 7, "1"), { row: null });
  const one = pickExtraRow([full("7", "1", "149.9")], 7, "1");
  assert.equal(one.row?.NUM04, "149.9");
  // δύο εταιρείες → διαλέγει της συνεδρίας
  assert.equal(pickExtraRow([full("7", "1", "10"), full("7", "2", "20")], 7, "2").row?.NUM04, "20");
  // δύο γραμμές της ίδιας εταιρείας ή άγνωστη εταιρεία συνεδρίας → διφορούμενο
  assert.match(pickExtraRow([full("7", "1", "10"), full("7", "1", "20")], 7, "1").error!, /Βρέθηκαν πολλές γραμμές MTREXTRA/);
  assert.match(pickExtraRow([full("7", "1", "10"), full("7", "2", "20")], 7, "").error!, /Βρέθηκαν πολλές γραμμές MTREXTRA/);
  // μία γραμμή άλλης εταιρείας → δεν γράφεται
  assert.ok(pickExtraRow([full("7", "3", "10")], 7, "1").error);
  // γραμμή άλλου είδους αγνοείται
  assert.deepEqual(pickExtraRow([full("8", "1", "10")], 7, "1"), { row: null });
});

test("C-1 extraDiff: μόνο το NUM04 επιτρέπεται να αλλάξει· 0 = κενό", () => {
  const before = pickExtraRow([full("7", "1", "0", { NUM01: "0", VARCHAR01: "x", BOOL01: "1" })], 7, "1").row!;
  const okAfter = pickExtraRow([full("7", "1", "99.9", { NUM01: "", VARCHAR01: "x", BOOL01: "1" })], 7, "1").row!;
  assert.deepEqual(extraDiff(before, okAfter), []);
  const bad = pickExtraRow([full("7", "1", "99.9", { VARCHAR01: "", BOOL01: "0", DATE01: "2026-01-01" })], 7, "1").row!;
  assert.deepEqual(extraDiff(before, bad).map((d) => d.col).sort(), ["BOOL01", "DATE01", "VARCHAR01"]);
  // καμία γραμμή πριν (νέα γραμμή MTREXTRA): τα υπόλοιπα πρέπει να είναι κενά/0
  assert.deepEqual(extraDiff(null, okAfter).map((d) => d.col).sort(), ["BOOL01", "VARCHAR01"]);
});
