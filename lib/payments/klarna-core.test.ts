import { test } from "node:test";
import assert from "node:assert/strict";
import { hppSession, judgeKlarna, klarnaHost, klarnaSession, taxOf } from "./klarna-core";

test("διευθύνσεις playground / live", () => {
  assert.equal(klarnaHost("test"), "https://api.playground.klarna.com");
  assert.equal(klarnaHost("live"), "https://api.klarna.com");
});

test("ΦΠΑ που περιέχεται: 124,00 € με 24 % → 24,00 €", () => {
  assert.equal(taxOf(12400, 2400), 2400);
  assert.equal(taxOf(24990, 2400), 4837);
});

test("γραμμές: έκπτωση γραμμής, μεταφορικά, άθροισμα = σύνολο, ΦΠΑ αθροίζεται", () => {
  const s = klarnaSession({ number: "EUR-1", total: 2 * 19.99 - 5 + 3.9, shippingFee: 3.9, lines: [{ reference: "150066", name: "Σίδερο", qty: 2, unitPrice: 19.99, lineTotal: 34.98, vatRate: 24 }] });
  assert.equal(s.order_amount, 3888);
  assert.equal(s.order_lines.reduce((a, l) => a + l.total_amount, 0), s.order_amount);
  assert.equal(s.order_tax_amount, s.order_lines.reduce((a, l) => a + l.total_tax_amount, 0));
  assert.equal(s.order_lines[0].total_discount_amount, 500);
  assert.equal(s.order_lines[1].type, "shipping_fee");
  assert.equal(s.merchant_reference1, "EUR-1");
  assert.equal(s.purchase_country, "GR");
});

test("διαφορά (π.χ. κουπόνι σε επίπεδο παραγγελίας) → γραμμή έκπτωσης", () => {
  const s = klarnaSession({ number: "EUR-2", total: 90, shippingFee: 0, lines: [{ name: "A", qty: 1, unitPrice: 100, lineTotal: 100, vatRate: 24 }] });
  const d = s.order_lines.at(-1)!;
  assert.equal(d.type, "discount"); assert.equal(d.total_amount, -1000);
  assert.equal(s.order_lines.reduce((a, l) => a + l.total_amount, 0), 9000);
});

test("HPP: χρέωση με την αποστολή → PLACE_ORDER, αμέσως → CAPTURE_ORDER", () => {
  const u = { success: "s", cancel: "c", back: "b", failure: "f", error: "e", status: "u" };
  assert.equal(hppSession("kp1", "test", u, "shipment").options.place_order_mode, "PLACE_ORDER");
  assert.equal(hppSession("kp1", "live", u, "immediate").options.place_order_mode, "CAPTURE_ORDER");
  assert.equal(hppSession("kp1", "live", u, "shipment").payment_session_url, "https://api.klarna.com/payments/v1/sessions/kp1");
});

test("αξιολόγηση: πληρωμένη μόνο με ίδιο αριθμό, ίδιο ποσό και ACCEPTED", () => {
  const ex = { number: "EUR-1", totalCents: 3888 };
  const ord = { order_id: "o1", status: "AUTHORIZED", fraud_status: "ACCEPTED", order_amount: 3888, merchant_reference1: "EUR-1" };
  assert.equal(judgeKlarna({ status: "COMPLETED", order_id: "o1" }, ord, ex), "paid");
  assert.equal(judgeKlarna({ status: "COMPLETED" }, { ...ord, order_amount: 3800 }, ex), "mismatch");
  assert.equal(judgeKlarna({ status: "COMPLETED" }, { ...ord, merchant_reference1: "EUR-9" }, ex), "mismatch");
  assert.equal(judgeKlarna({ status: "COMPLETED" }, { ...ord, fraud_status: "PENDING" }, ex), "pending");
  assert.equal(judgeKlarna({ status: "COMPLETED" }, { ...ord, fraud_status: "REJECTED" }, ex), "failed");
  assert.equal(judgeKlarna({ status: "WAITING" }, null, ex), "waiting");
  assert.equal(judgeKlarna({ status: "CANCELLED" }, null, ex), "failed");
});
