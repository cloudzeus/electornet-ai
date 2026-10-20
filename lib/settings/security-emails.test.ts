import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSecurityEmails } from "./security-emails";
import { DEFAULT_SECURITY_EMAILS, MAX_SECURITY_EMAILS, sectionByKey } from "./schema";

test("κενό / null / undefined → προεπιλογή", () => {
  for (const v of ["", "  \n ", null, undefined]) assert.deepEqual(parseSecurityEmails(v), [DEFAULT_SECURITY_EMAILS]);
});
test("χωρισμός με ; κόμμα και νέα γραμμή (CRLF)· άκυρα απορρίπτονται", () => {
  assert.deepEqual(parseSecurityEmails("a@x.gr; b@y.gr\nbad"), ["a@x.gr", "b@y.gr"]);
  assert.deepEqual(parseSecurityEmails(" A@X.gr ,\r\n b@y.gr "), ["a@x.gr", "b@y.gr"]);
});
test("όλα άκυρα → προεπιλογή", () => {
  assert.deepEqual(parseSecurityEmails("bad, @x.gr, a@b"), [DEFAULT_SECURITY_EMAILS]);
});
test("διπλότυπα αφαιρούνται (και με διαφορετικά κεφαλαία)", () => {
  assert.deepEqual(parseSecurityEmails("a@x.gr, A@X.GR\na@x.gr"), ["a@x.gr"]);
});
test("έως MAX_SECURITY_EMAILS", () => {
  const raw = Array.from({ length: 12 }, (_, i) => `u${i}@x.gr`).join("\n");
  const out = parseSecurityEmails(raw);
  assert.equal(out.length, MAX_SECURITY_EMAILS);
  assert.equal(out[0], "u0@x.gr");
});
test("ο κανόνας της φόρμας δέχεται ό,τι δέχεται ο parser (; και κόμμα)", () => {
  const re = sectionByKey("security")!.fields[0].rule!.re;
  assert.ok(re.test("a@x.gr; b@y.gr"));
  assert.ok(re.test("a@x.gr,\nb@y.gr"));
  assert.ok(!re.test("a@x.gr, bad"));
});
