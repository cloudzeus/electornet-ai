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
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "evil.com", "logariasmos", "",
    " /\\evil.com", " //evil.com", "\t//evil.com", "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/\u0000/evil.com", "/%09/evil.com", "/%0d%0a/evil.com",
    "/foo\\bar", "/api/account/logout", "/" + "a".repeat(2100),
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

test("safeNext: dot-segments που κανονικοποιούνται σε «//άλλο-site» απορρίπτονται", () => {
  for (const p of ["/.//evil.com", "/%2e//evil.com", "/%2E%2E//evil.com", "/x/..//evil.com", "/a/%2e%2e//evil.com", "/a/../\\evil.com", "/./%2F/evil.com", "/api/../api/x", "/x/%2e%2e/api/y"])
    assert.equal(safeNext(p), "/", `πέρασε: ${JSON.stringify(p)}`);
});

test("safeNext: επιστρέφει την κανονική μορφή (pathname + search + hash), όχι το raw", () => {
  assert.equal(safeNext("/a/./b/../c?x=1#h"), "/a/c?x=1#h");
  assert.equal(safeNext("/logariasmos?tab=orders#x"), "/logariasmos?tab=orders#x");
  assert.equal(safeNext("/k/%CF%84%CE%B7%CE%BB%CE%B5%CE%BF%CF%81%CE%AC%CF%83%CE%B5%CE%B9%CF%82"), "/k/%CF%84%CE%B7%CE%BB%CE%B5%CE%BF%CF%81%CE%AC%CF%83%CE%B5%CE%B9%CF%82");
  assert.equal(safeNext("/k/τηλεοράσεις"), "/k/%CF%84%CE%B7%CE%BB%CE%B5%CE%BF%CF%81%CE%AC%CF%83%CE%B5%CE%B9%CF%82");
  assert.equal(safeNext("/proion/tv-55?snap=save"), "/proion/tv-55?snap=save");
});

test("safeNext: query με «%», %25 ή «javascript:» είναι νόμιμο (δεν είναι διαδρομή)", () => {
  assert.equal(safeNext("/anazitisi?q=100%25"), "/anazitisi?q=100%25");
  assert.equal(safeNext("/anazitisi?q=50%"), "/anazitisi?q=50%");
  assert.equal(safeNext("/anazitisi?q=javascript:"), "/anazitisi?q=javascript:");
  assert.equal(safeNext("/%E0%A4%A"), "/%E0%A4%A"); // άκυρη κωδικοποίηση: σταματά η αποκωδικοποίηση, μένει διαδρομή του site
  assert.equal(safeNext("/javascript:alert(1)"), "/javascript:alert(1)"); // απλή διαδρομή του ίδιου site
});
