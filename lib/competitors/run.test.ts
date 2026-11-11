import { test } from "node:test";
import assert from "node:assert/strict";
import { decideGone, decidePrice, ourPrice, type Prev } from "./run-core";

const prev = (o: Partial<Prev> = {}): Prev => ({ match: "auto", extUrl: "tv/123-x", missCount: 0, their: 100, ourPrice: 110, ...o });
const ok = (o: object = {}) => ({ title: "t", list: 120, offer: 100, buyable: true, ean: "5901234123457", ...o });
const run = (p: Partial<Prev>, parsed: object, ourEan: string | null = "5901234123457", base: "auto" | "suggested" = "auto", ours = 110) =>
  decidePrice({ prev: prev(p), base, note: "διαφέρει κατάληξη: xx", parsed: parsed as any, ourEan, ourPrice: ours });

test("ίδιο EAN αναβαθμίζει suggested σε auto", () => {
  const d = run({ match: "suggested" }, ok(), "5901234123457", "suggested");
  assert.equal(d.match, "auto"); assert.equal(d.lastError, null);
});
test("διαφορετικό EAN: auto → suggested με μήνυμα, ποτέ απόρριψη", () => {
  const d = run({ match: "auto" }, ok({ ean: "5909999999999" }));
  assert.equal(d.match, "suggested"); assert.match(d.lastError!, /διαφορετικό EAN/); assert.ok(d.prices);
  assert.ok(!("rejectedAdd" in d));
});
test("διαφορετικό EAN σε suggested μένει suggested", () => {
  assert.equal(run({ match: "suggested" }, ok({ ean: "5909999999999" }), "5901234123457", "suggested").match, "suggested");
});
test("διαφορετικό EAN σε manual: μένει, μόνο lastError, χωρίς τιμές", () => {
  const d = run({ match: "manual" }, ok({ ean: "5909999999999" }));
  assert.equal(d.match, "manual"); assert.ok(d.lastError); assert.equal(d.prices, undefined);
});
test("EAN που λείπει → κανόνας μοντέλου (base και note)", () => {
  const d = run({ match: null }, ok({ ean: null }), null, "suggested");
  assert.equal(d.match, "suggested"); assert.equal(d.lastError, "διαφέρει κατάληξη: xx");
  assert.equal(run({ match: null }, ok({ ean: null }), null, "auto").match, "auto");
});
test("missCount: 1η απουσία μετρά, 2η → lost και καθαρίζει το ζευγάρι", () => {
  const a = decideGone(prev({ missCount: 0 }));
  assert.equal(a.missCount, 1); assert.equal(a.match, "auto"); assert.equal(a.available, false);
  const b = decideGone(prev({ missCount: 1 }));
  assert.equal(b.match, "lost"); assert.equal(b.lastError, "χάθηκε: tv/123-x"); assert.ok(b.clearPair);
});
test("επιτυχής τιμή μηδενίζει missCount", () => {
  const d = run({ missCount: 1 }, ok()); assert.equal(d.missCount, 0); assert.equal(d.available, true);
});
test("ιστορικό μόνο όταν άλλαξε τιμή ή δική μας τιμή", () => {
  assert.equal(run({}, ok()).history, false);
  assert.equal(run({}, ok({ offer: 95 })).history, true);
  assert.equal(run({}, ok(), "5901234123457", "auto", 105).history, true);
  assert.equal(run({ their: null }, ok()).history, true);
});
test("διαφορά %: offer προτιμάται από list", () => {
  assert.equal(run({}, ok()).prices!.diff, 10); // (110-100)/100
  assert.equal(run({}, ok({ offer: null })).prices!.their, 120);
});
test("και list και offer null → σφάλμα, χωρίς τιμές/ιστορικό, available αμετάβλητο", () => {
  const d = run({}, ok({ list: null, offer: null }));
  assert.equal(d.lastError, "χωρίς τιμή"); assert.equal(d.prices, undefined); assert.equal(d.available, undefined);
});
test("ourPrice: προσφορά έναντι τιμής", () => {
  assert.equal(ourPrice({ price: 120, offer: { price: "99.9" } }), 99.9);
  assert.equal(ourPrice({ price: 120, offer: null }), 120);
  assert.equal(ourPrice({ price: null, offer: null }), null);
});
