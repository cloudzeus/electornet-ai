import { test } from "node:test";
import assert from "node:assert/strict";
import { swr, swrMap } from "./swr";

test("swr: μοιράζεται έναν υπολογισμό και σερβίρει το παλιό όσο ανανεώνει", async () => {
  let calls = 0;
  const get = swr(async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return calls; }, 30);
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(calls, 1);
  assert.equal(await get(), 1); // φρέσκο
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await get(), 1); // παλιό, αμέσως — ανανέωση στο παρασκήνιο
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await get(), 2);
  get.invalidate();
  assert.equal(await get(), 2); // παλιό αμέσως, ανανέωση στο παρασκήνιο
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await get(), 3);
});

test("swr: maxStale — πολύ παλιό δεν σερβίρεται", async () => {
  let n = 0;
  const get = swr(async () => ++n, 10, { maxStaleMs: 30 });
  assert.equal(await get(), 1);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(await get(), 1); // παλιό αλλά εντός ορίου
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(await get(), 3); // πέρα από το όριο: περιμένει φρέσκο (η 2 ήταν η ανανέωση στο παρασκήνιο)
});

test("swrMap: ξεχωριστές τιμές ανά κλειδί", async () => {
  const get = swrMap<string>(1000);
  assert.equal(await get("a", async () => "A"), "A");
  assert.equal(await get("b", async () => "B"), "B");
  assert.equal(await get("a", async () => "X"), "A");
});
