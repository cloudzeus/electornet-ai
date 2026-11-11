import { test } from "node:test";
import assert from "node:assert/strict";
import { badge, gapText, kotView, pct, wasPrice, type KotView } from "./badge";

const v = (o: Partial<KotView> = {}): KotView => ({ match: "auto", extId: "338001", extUrl: "x/338001-a", extTitle: "Hisense 55U7SE", listPrice: 649.99, offerPrice: 649.99, available: true, ourPrice: 829, diffPct: 27.5, lastError: null, checkedAt: null, ...o });

test("badge: ποσοστό σε ελληνική μορφή, πλήρες και μικρό", () => {
  assert.deepEqual(badge(v()), { kind: "up", text: "+27,5% · Κωτσόβολος 649,99 €" });
  assert.equal(badge(v(), true).text, "+27,5% · Κωτσ. 649,99 €");
  assert.deepEqual(badge(v({ diffPct: -7.7, offerPrice: 399.99, listPrice: 449.99 })), { kind: "down", text: "−7,7% · Κωτσόβολος 399,99 €" });
  assert.equal(badge(v({ diffPct: -0.1, offerPrice: null, listPrice: 1049.99 })).kind, "eq");
  assert.equal(badge(v({ diffPct: -0.1, offerPrice: null, listPrice: 1049.99 })).text, "−0,1% · Κωτσόβολος 1.049,99 €");
  assert.equal(pct(0), "0,0%");
});

test("badge: μόνο auto/manual δείχνουν ποσοστό", () => {
  assert.equal(badge(v({ match: "manual" })).kind, "up");
  assert.deepEqual(badge(v({ match: "suggested" })), { kind: "suggested", text: "Πρόταση ζευγαριού · επιβεβαίωσε" });
  assert.equal(badge(v({ match: "rejected" })).kind, "none");
  assert.equal(badge(v({ match: "lost" })).kind, "none");
  assert.equal(badge(v({ extId: null })).kind, "none");
  assert.equal(badge(null).text, "Δεν βρέθηκε ζευγάρι στον Κωτσόβολο");
  assert.equal(badge(null, true).text, "Χωρίς ζευγάρι");
});

test("badge: ζευγάρι που δεν διατίθεται πια = γκρι, ακόμη κι αν μένει η παλιά τιμή", () => {
  assert.deepEqual(badge(v({ available: false })), { kind: "gone", text: "Δεν διατίθεται πια στον Κωτσόβολο" });
});

test("badge: χωρίς δική μας τιμή → μόνο η τιμή τους, χωρίς χρώμα", () => {
  assert.deepEqual(badge(v({ diffPct: null })), { kind: "none", text: "Κωτσόβολος 649,99 €" });
});

test("wasPrice: διαγραμμένη μόνο όταν κατάλογος > προσφορά", () => {
  assert.equal(wasPrice({ listPrice: 749.99, offerPrice: 649.99 }), 749.99);
  assert.equal(wasPrice({ listPrice: 599.99, offerPrice: 649.99 }), null); // παλιός, χαμηλότερος κατάλογος
  assert.equal(wasPrice({ listPrice: 649.99, offerPrice: 649.99 }), null);
  assert.equal(wasPrice({ listPrice: 649.99, offerPrice: null }), null);
});

test("gapText και kotView", () => {
  assert.equal(gapText(v()), "Είμαστε 179,01 € ακριβότεροι.");
  assert.equal(gapText(v({ ourPrice: 369, offerPrice: 399.99, diffPct: -7.7 })), "Είμαστε 30,99 € φθηνότεροι.");
  assert.equal(gapText(v({ match: "suggested" })), null);
  const k = kotView({ match: "auto", extId: "1", extUrl: null, extTitle: null, listPrice: { toString: () => "10.50" }, offerPrice: null, available: true, ourPrice: 12, diffPct: 14.3, lastError: null, checkedAt: new Date("2026-11-11T01:00:00Z") });
  assert.equal(k?.listPrice, 10.5);
  assert.equal(k?.checkedAt, "2026-11-11T01:00:00.000Z");
  assert.equal(kotView(null), null);
});

test("chartData: κενό, ένα παλιό, ένα μέσα στο παράθυρο, πολλά", async () => {
  const { chartData } = await import("./badge");
  const now = Date.UTC(2026, 10, 11);
  const d = 86_400_000;
  assert.equal(chartData([], now), null);
  assert.equal(chartData([{ t: now - d, ours: null, theirs: null }], now), null);
  // ένα παλιό σημείο: κρατά την αρχή του παραθύρου, επίπεδες γραμμές
  const old = chartData([{ t: now - 40 * d, ours: 829, theirs: 649.99 }], now)!;
  assert.equal(old.points.length, 1);
  assert.equal(old.points[0].t, now - 30 * d);
  assert.equal(old.from, now - 30 * d);
  // ένα σημείο μέσα στο παράθυρο: σχεδιάζεται από εκεί έως σήμερα
  const one = chartData([{ t: now - 5 * d, ours: 829, theirs: 649.99 }], now)!;
  assert.deepEqual(one.points.map((p) => p.t), [now - 5 * d]);
  assert.equal(one.to, now);
  // πολλά, σε φθίνουσα σειρά όπως έρχονται από τη βάση
  const many = chartData([{ t: now - 2 * d, ours: 829, theirs: 649.99 }, { t: now - 10 * d, ours: 829, theirs: 699.99 }, { t: now - 40 * d, ours: 829, theirs: 749.99 }], now)!;
  assert.deepEqual(many.points.map((p) => p.theirs), [749.99, 699.99, 649.99]);
  assert.ok(many.min < 649.99 && many.max > 829);
});
