import { test } from "node:test";
import assert from "node:assert/strict";
import { asapSign, phoneParts, shipmentBody, stateFromReason, geoQuery } from "./api";

test("υπογραφή LastMily: HMAC-SHA256(client_id + x-time [+ base64(σώμα)]) σε hex — όπως το παράδειγμα Python της τεκμηρίωσης", () => {
  assert.equal(asapSign({ clientId: "abc123", secret: "priv_secret", time: "1700000000" }), "b665b62318b930568dba0a8c29f090015c8a5beb69ae062aa1eb0b9cd20ada27");
  assert.equal(asapSign({ clientId: "abc123", secret: "priv_secret", time: "1700000000", body: '{"id":4}' }), "6ae55a04bb0029373a5d282a92f8745a2710e148b1bb469dc0608703b1a2834d");
  // ελληνικά: base64 των bytes UTF-8
  assert.equal(asapSign({ clientId: "abc123", secret: "priv_secret", time: "1700000000", body: '{"name":"Γιώργος"}' }), "7366c6845c0cdca27643a68c8fa3532aa04f4015fc300b465310afb75e889eb1");
});

test("τηλέφωνο: πρόθεμα (έως 4) + αριθμός χωρίς πρόθεμα (έως 11)", () => {
  assert.deepEqual(phoneParts("+30 694 567 8901"), { prefix: "+30", phone: "6945678901" });
  assert.deepEqual(phoneParts("6945678901"), { prefix: "+30", phone: "6945678901" });
  assert.deepEqual(phoneParts("0030 210 4835143"), { prefix: "+30", phone: "2104835143" });
  assert.deepEqual(phoneParts("+357 99123456"), { prefix: "+357", phone: "99123456" });
});

test("σώμα αποστολής: πόρτα-πόρτα, παραλήπτης με συντεταγμένες, τεμάχια, αντικαταβολή, κωδικός παραγγελίας, ASAP ως courier", () => {
  const b = shipmentBody({
    courierId: 17, delivery: 1,
    order: "EU-10023", recipient: { name: "Γιάννης Παπάς", phone: "6945678901", street: "Τσιμισκή", number: "73", zip: "121 35", city: "Περιστέρι", lat: 38.02, lon: 23.68, notes: "3ος όροφος" },
    pieces: 2, weightKg: 12, cod: 349.9,
  });
  assert.deepEqual(b.courier_company_ids, [17]);
  assert.equal(b.shipment_service_type, 1);
  assert.equal(b.shipment_delivery_type, 1);
  assert.equal(b.recipient.contact_phone, "6945678901");
  assert.equal(b.recipient.address.lat, 38.02);
  assert.equal(b.recipient.address.postal_code, "12135");
  assert.equal(b.recipient.address.country_code, "GRC");
  assert.equal(b.recipient.address.street, "Τσιμισκή");
  assert.equal(b.recipient.address.house_number, "73");
  assert.equal(b.parcels_count, 2);
  assert.equal(b.parcels.length, 2);
  assert.equal(b.parcels[0].weight_kg, 6);
  assert.deepEqual(b.cash_on_delivery, { currency: "EUR", requested_payment_type: 1, amount: 349.9 });
  assert.equal(b.references.order_code, "EU-10023");
  assert.equal(b.delivery_notes, "3ος όροφος");
  // χωρίς αντικαταβολή: κανένα πεδίο cash_on_delivery
  assert.equal(shipmentBody({ courierId: 1, delivery: 3, order: "X", recipient: { name: "A", phone: "6900000000", street: "B", number: "1", zip: "10000", city: "Αθήνα", lat: 1, lon: 2 }, pieces: 1, weightKg: 1 }).cash_on_delivery, undefined);
});

test("καταστάσεις LastMily → δικές μας", () => {
  assert.equal(stateFromReason(300), null);
  assert.equal(stateFromReason(500), "out-for-delivery");
  assert.equal(stateFromReason(700), "delivered");
  assert.equal(stateFromReason(1700), "delivered");
  assert.equal(stateFromReason(801), "attempted");
  assert.equal(stateFromReason(805), "attempted");
  assert.equal(stateFromReason(819), "cancelled");
});

test("αναζήτηση διεύθυνσης για συντεταγμένες: οδός αριθμός, ΤΚ πόλη", () => {
  assert.equal(geoQuery({ street: "Τσιμισκή", number: "73", zip: "121 35", city: "Περιστέρι" }), "Τσιμισκή 73, 12135 Περιστέρι");
});
