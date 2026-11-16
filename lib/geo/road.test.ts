import { test } from "node:test";
import assert from "node:assert/strict";
import { rankByRoad, roadKm } from "./road";

const res = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
const A = { lat: 38.2466, lng: 21.7346 };
const near = { id: "near", lat: 38.25, lng: 21.74 }, far = { id: "far", lat: 38.3, lng: 21.8 }, away = { id: "away", lat: 40.6, lng: 22.9 };

test("οδική απόσταση: μέτρα → km, χωρίς διαδρομή → null, σφάλμα υπηρεσίας → null συνολικά", async () => {
  assert.deepEqual(await roadKm(A, [near, far], res({ code: "Ok", distances: [[0, 762.9, null]] })), [0.8, null]);
  assert.equal(await roadKm(A, [near], res({ code: "NoTable" })), null);
  assert.equal(await roadKm(A, [near], res({}, false)), null);
  assert.deepEqual(await roadKm(A, []), []);
});

test("κατάταξη: κρίνει η οδική, όχι η ευθεία· τα μακρινά δεν ρωτώνται· χωρίς OSRM η απόσταση μένει άγνωστη", async () => {
  // το «near» είναι πιο κοντά σε ευθεία αλλά πιο μακριά οδικώς (π.χ. ποτάμι/γέφυρα)
  const r = await rankByRoad(A, [near, far, away], { fetch: res({ code: "Ok", distances: [[0, 21000, 9000]] }) });
  assert.deepEqual(r?.map((x) => [x.item.id, x.km]), [["far", 9], ["near", 21]]);
  assert.deepEqual(await rankByRoad(A, [away], { fetch: res({}) }), []);
  assert.equal(await rankByRoad(A, [near], { fetch: res({}, false) }), null);
});
