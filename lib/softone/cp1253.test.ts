import { test } from "node:test";
import assert from "node:assert/strict";
import { toCp1253, unsupportedCp1253 } from "./cp1253";

test("toCp1253: ό,τι αλλάζει σιωπηλά το SoftOne αλλάζει από πριν", () => {
  // το πραγματικό περιστατικό: AirPods Max 2, «USB‑C» με U+2011
  assert.equal(toCp1253("USB‑C Charge Cable"), "USB-C Charge Cable");
  assert.equal(toCp1253("10 kg · 5​ min"), "10 kg · 5 min");
  assert.equal(toCp1253("10.1′"), "10.1'");
});

test("toCp1253: αφήνει ό,τι υπάρχει στο Windows-1253", () => {
  const s = "Ά έως ώ — «εισαγωγικά» “quotes” … € ™ 1 000 – τέλος";
  assert.equal(toCp1253(s), s);
  assert.deepEqual(unsupportedCp1253(s), []);
});

test("unsupportedCp1253: emoji και άλλα αλφάβητα σταματούν πριν την εγγραφή", () => {
  assert.deepEqual(unsupportedCp1253("Τέλειο 👍 USB‑C"), ["👍"]);
  assert.deepEqual(unsupportedCp1253("中文"), ["中", "文"]);
});

test("toCp1253: ο βαθμός ως εκθέτης μηδέν και οι εκθέτες γράφονται, δεν σταματούν την εγγραφή", () => {
  assert.equal(toCp1253("Λειτουργία έως 43⁰C · 10⁵ m²"), "Λειτουργία έως 43°C · 105 m²");
  assert.deepEqual(unsupportedCp1253("43⁰C ≤ 5 • A→B"), []);
});
