import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next";

test("safeNext: δέχεται σχετικές διαδρομές του ίδιου site (με query / hash)", () => {
  for (const p of ["/", "/logariasmos", "/logariasmos/stoixeia", "/proion/tv-55?snap=1&x=%2F", "/lista#top", "/k/tileoraseis/oled?brand=lg"]) assert.equal(safeNext(p), p);
});

test("safeNext: απορρίπτει απόλυτες, protocol-relative και backslash παρακάμψεις", () => {
  const bad = [
    "https://evil.com", "http://evil.com", "//evil.com", "///evil.com", "/\\evil.com", "\\\\evil.com", "\\/evil.com", "/\\/evil.com",
    "/%2F%2Fevil.com", "/%2fevil.com", "%2F%2Fevil.com", "/%5Cevil.com", "/%5cevil.com", "/%255Cevil.com", "/%252F%252Fevil.com",
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "/javascript:alert(1)", "data:text/html,<script>", "evil.com", "logariasmos", "",
    " /\\evil.com", " //evil.com", "\t//evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/\u0000/evil.com", "/%09/evil.com", "/%0d%0a/evil.com",
    "/foo\\bar", "/%E0%A4%A", "/api/account/logout", "/" + "a".repeat(2100),
  ];
  for (const p of bad) assert.equal(safeNext(p), "/", `πέρασε: ${JSON.stringify(p)}`);
});

test("safeNext: μη-string (π.χ. επαναλαμβανόμενο ?next=a&next=b → πίνακας) → fallback", () => {
  for (const v of [undefined, null, 42, ["/a", "/b"], { href: "/a" }]) assert.equal(safeNext(v, "/logariasmos"), "/logariasmos");
});

test("safeNext: χρησιμοποιεί το fallback που δόθηκε", () => {
  assert.equal(safeNext("//evil.com", "/logariasmos"), "/logariasmos");
  assert.equal(safeNext("/checkout", "/logariasmos"), "/checkout");
});
