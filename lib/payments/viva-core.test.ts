import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutUrl, isVivaPay, judgeTransaction } from "./viva-core";

test("redirect με προεπιλεγμένο τρόπο, demo και live", () => {
  assert.equal(checkoutUrl("test", "7680701046572600", "paypal"), "https://demo.vivapayments.com/web/checkout?ref=7680701046572600&paymentMethod=23");
  assert.equal(checkoutUrl("live", "1", "card"), "https://www.vivapayments.com/web/checkout?ref=1&paymentMethod=0");
  assert.equal(isVivaPay("iris"), true);
  assert.equal(isVivaPay("cod"), false);
});

test("συναλλαγή: πληρωμένη μόνο με ίδιο κωδικό και ίδιο ποσό", () => {
  const e = { orderCode: "123", totalCents: 40190 };
  assert.equal(judgeTransaction({ statusId: "F", amount: 401.9, orderCode: 123 }, e), "paid");
  assert.equal(judgeTransaction({ statusId: "F", amount: 400, orderCode: 123 }, e), "mismatch");
  assert.equal(judgeTransaction({ statusId: "F", amount: 401.9, orderCode: 999 }, e), "mismatch");
  assert.equal(judgeTransaction({ statusId: "A", amount: 401.9, orderCode: "123" }, e), "pending");
  assert.equal(judgeTransaction({ statusId: "E", amount: 401.9, orderCode: "123" }, e), "failed");
});

test("τρόποι στο checkout: μόνο με Viva, η κάρτα πάντα, τα υπόλοιπα με διακόπτη", async () => {
  const { enabledVivaPays } = await import("./viva-core");
  assert.deepEqual(enabledVivaPays({ provider: "stripe", paypal: true }), []);
  assert.deepEqual(enabledVivaPays({ provider: "viva" }), ["card"]);
  assert.deepEqual(enabledVivaPays({ provider: "viva", applePay: true, paypal: true, iris: true }), ["card", "apple", "paypal", "iris"]);
});
