import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSlug } from "./slug";

test("slug διαδρομής: ελληνικά αποκωδικοποιούνται, τα υπόλοιπα μένουν ίδια", () => {
  assert.equal(decodeSlug("%CE%B4%CE%B1%CE%BC%CE%BA%CE%B1%CE%BB%CE%B9%CE%B4%CE%B7%CF%82"), "δαμκαλιδης");
  assert.equal(decodeSlug("δαμκαλιδης"), "δαμκαλιδης");
  assert.equal(decodeSlug("apple"), "apple");
  assert.equal(decodeSlug("100%-cotton"), "100%-cotton"); // άκυρη κωδικοποίηση: ως έχει
});
