import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type RankCand } from "./rank";

const c = (id: string, o: Partial<RankCand> = {}): RankCand => ({ id, brandId: id, price: 500, stock: 0, sim: 0.5, offer: false, energy: true, noise: null, kwh: null, cls: null, ...o });

test("πρώτα προσφορά + άμεσα, μετά προσφορά, μετά άμεσα, μετά τα υπόλοιπα — ανεξάρτητα από τη σχετικότητα", () => {
  const ids = rankCandidates([c("rest", { sim: 0.9 }), c("stock", { stock: 3, sim: 0.6 }), c("offer", { offer: true, sim: 0.4 }), c("both", { offer: true, stock: 1, sim: 0.3 })], { take: 10 });
  assert.deepEqual(ids, ["both", "offer", "stock", "rest"]);
});

test("μέσα στην ομάδα: σχετικότητα, ή η προτεραιότητα του πελάτη", () => {
  const list = [c("a", { stock: 1, sim: 0.4, price: 300 }), c("b", { stock: 1, sim: 0.7, price: 900 }), c("x", { sim: 0.1 })];
  assert.deepEqual(rankCandidates(list, { take: 3 }), ["b", "a", "x"]);
  assert.deepEqual(rankCandidates(list, { take: 3, priority: "price" }), ["a", "b", "x"]);
});

test("γενική ερώτηση: εναλλάξ μεσαία / φθηνά / ακριβά μέσα στην ομάδα", () => {
  const list = [300, 310, 320, 600, 610, 620, 1200, 1210, 1220].map((p, i) => c(`p${p}`, { stock: 1, price: p, sim: 0.9 - i * 0.01 }));
  const ids = rankCandidates(list, { take: 6, generic: true });
  assert.deepEqual(ids.slice(0, 3).map((x) => Number(x.slice(1))).sort((a, b) => a - b).map((p) => (p < 500 ? "low" : p < 1000 ? "mid" : "high")), ["low", "mid", "high"]);
});

test("έως 4 ανά μάρκα, εκτός αν ζητήθηκε μάρκα", () => {
  const list = Array.from({ length: 6 }, (_, i) => c(`s${i}`, { brandId: "samsung", stock: 1 })).concat([c("lg", { brandId: "lg" })]);
  assert.equal(rankCandidates(list, { take: 10 }).filter((x) => x.startsWith("s")).length, 4);
  assert.equal(rankCandidates(list, { take: 10, brandLock: true }).filter((x) => x.startsWith("s")).length, 6);
});
