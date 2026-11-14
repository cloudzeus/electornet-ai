import { test } from "node:test";
import assert from "node:assert/strict";
import { payloads } from "./track";

test("payloads: αγορά με 2 τεμάχια — GA4, Meta, TikTok", () => {
  const p = payloads("purchase", { id: "EU-1", value: 199.999, items: [{ id: "p1", name: "Ψυγείο", brand: "LG", price: 99.995, qty: 2 }] });
  assert.deepEqual(p.google, { currency: "EUR", value: 200, transaction_id: "EU-1", items: [{ item_id: "p1", item_name: "Ψυγείο", item_brand: "LG", price: 100, quantity: 2 }] });
  assert.equal(p.meta[0], "Purchase");
  assert.deepEqual(p.meta[1].content_ids, ["p1"]);
  assert.equal(p.tiktok[0], "CompletePayment");
  assert.equal(payloads("view_item", { value: 5, items: [{ id: "a", name: "x", price: 5 }] }).google.items[0].quantity, 1);
});
