import { test } from "node:test";
import assert from "node:assert/strict";
import { contactMatches } from "./contact";

test("contactMatches: τηλέφωνο σε κάθε μορφή", () => {
  assert.ok(contactMatches("6941234567", [], ["694 123 4567"]));
  assert.ok(contactMatches("+30 694 123 4567", [], ["6941234567"]));
  assert.ok(contactMatches("00306941234567", [], ["+306941234567"]));
  assert.ok(!contactMatches("6941234568", [], ["6941234567"]));
  assert.ok(!contactMatches("4567", [], ["6941234567"]));
});
test("contactMatches: email χωρίς διάκριση πεζών/κεφαλαίων", () => {
  assert.ok(contactMatches(" Maria@Example.gr ", ["maria@example.gr"], []));
  assert.ok(!contactMatches("other@example.gr", ["maria@example.gr", null], []));
  assert.ok(!contactMatches("maria@example.gr", [], ["6941234567"]));
});
