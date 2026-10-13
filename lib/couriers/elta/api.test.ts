import { test } from "node:test";
import assert from "node:assert/strict";
import { createVoucherBody, eltaDate, isAuthError, isOk, parseTrace, phoneOf, stateOf, stateOfCode } from "./api";

const creds = { customerCode: "PEL123", user: "USER1", password: "pass123", subCode: null };
const party = { name: "Γιώργος Παπαδόπουλος με πολύ μεγάλο ονοματεπώνυμο", address: "Λεωφ. Κηφισίας 100", area: "Μαρούσι", zip: "151 25" };

test("phoneOf: κινητό, σταθερό, +30 και ξένο", () => {
  assert.deepEqual(phoneOf("+30 694 123 4567"), { mobile: "6941234567", telefon: "", foreign: "" });
  assert.deepEqual(phoneOf("0030 210 1234567"), { mobile: "", telefon: "2101234567", foreign: "" });
  assert.equal(phoneOf("+49 151 2345678").foreign, "00491512345678");
});

test("createVoucherBody: όρια χαρακτήρων, ΤΚ, αντικαταβολή, χωρίς παραλαβή", () => {
  const b = createVoucherBody(creds, { sender: { ...party, phone: "2101234567" }, receiver: { ...party, phone: "6941234567", email: "a@b.gr" }, pieces: 2, weightKg: 3.456, cod: 129.9, refs: ["ORD-1"] });
  assert.equal(b.receiver_details.cust_title.length, 30);
  assert.equal(b.receiver_details.cust_postal_code, "15125");
  assert.equal(b.receiver_details.cust_mobile, "6941234567");
  assert.equal(b.voucher_details.voucher_packages, 2);
  assert.equal(b.voucher_details.voucher_actual_weight, 3.46);
  assert.equal(b.voucher_details.voucher_service, 1);
  assert.deepEqual(b.cod_details, { cod_type: 1, cod_amount: 129.9, cod_date: "" });
  assert.equal(b.order_details.order_flag, 0);
  assert.equal(b.voucher_details.reference1, "ORD-1");
});

test("createVoucherBody: παραγγελία παραλαβής yyyyMMdd", () => {
  const b = createVoucherBody(creds, { sender: party, receiver: party, pieces: 1, weightKg: 1, pickup: { date: new Date(2026, 9, 14) } });
  assert.equal(b.order_details.order_flag, 1);
  assert.equal(b.order_details.pickup_date, "20261014");
  assert.equal(b.cod_details.cod_type, 0);
});

test("isOk / isAuthError", () => {
  assert.ok(isOk({ error_code: "0" }));
  assert.ok(isOk({ error_code: 0 }));
  assert.ok(!isOk({ error_code: "12", error_remarks: "x" }));
  assert.ok(isAuthError(401));
  assert.ok(isAuthError(200, { error_code: "1", error_remarks: "Invalid api_secret" }));
  assert.ok(!isAuthError(200, { error_code: "5", error_remarks: "Λάθος ΤΚ" }));
});

test("eltaDate: μορφές", () => {
  assert.equal(eltaDate("14/10/2026", "13:05"), "2026-10-14T13:05:00");
  assert.equal(eltaDate("20261014", "0930"), "2026-10-14T09:30:00");
  assert.equal(eltaDate("20261013", "100338"), "2026-10-13T10:03:38");
  assert.equal(eltaDate("2026-10-14T00:00:00", ""), "2026-10-14T00:00:00");
  assert.equal(eltaDate("", ""), null);
});

test("stateOf: ελληνικά και αγγλικά", () => {
  assert.equal(stateOf("ΠΑΡΑΔΟΘΗΚΕ"), "delivered");
  assert.equal(stateOf("Αποστολή προς διανομή"), "out-for-delivery");
  assert.equal(stateOf("Απουσία παραλήπτη"), "attempted");
  assert.equal(stateOf("Επιστροφή στον αποστολέα"), "returning");
  assert.equal(stateOf("ΕΠΙΔΟΣΗ ΣΤΟΝ ΑΠΟΣΤΟΛΕΑ"), "returned");
  assert.equal(stateOf("Returned to sender"), "returned");
  assert.equal(stateOf("Παραλαβή από αποστολέα"), "in-transit");
});

test("parseTrace: σειρά, κενή παράδοση 1900, παράδοση", () => {
  const t = parseTrace({ delivery_date: "01/01/1900", trace_details: [
    { trace_Status_code: "2", trace_Status_gr: "Σε διανομή", trace_date: "15/10/2026", trace_time: "08:00" },
    { trace_Status_code: "1", trace_Status_gr: "Παραλαβή", trace_date: "14/10/2026", trace_time: "16:00", trace_Station_gr: "ΑΘΗΝΑ" },
  ] });
  assert.equal(t.deliveredAt, null);
  assert.equal(t.checkpoints[0].shop, "ΑΘΗΝΑ");
  assert.equal(t.state, "out-for-delivery");
  assert.equal(parseTrace({ delivery_date: "15/10/2026", delivery_time: "12:00", trace_details: [{ trace_Status_gr: "Σε διανομή", trace_date: "15/10/2026" }] }).state, "delivered");
  assert.equal(parseTrace({ trace_details: [] }).state, null);
});

test("stateOfCode: κωδικοί StatusInfo", () => {
  assert.equal(stateOfCode("9951"), "delivered");
  assert.equal(stateOfCode("9910"), "out-for-delivery");
  assert.equal(stateOfCode("113"), "attempted");
  assert.equal(stateOfCode("9840"), "on-hold");
  assert.equal(stateOfCode("9965"), "returning");
  assert.equal(stateOfCode("9940"), "returned");
  assert.equal(stateOfCode("9814"), null);
  assert.equal(stateOfCode("9106"), null);
  assert.equal(stateOfCode("9907"), "in-transit");
  assert.equal(stateOfCode("12345", "ΠΑΡΑΔΟΘΗΚΕ"), "delivered");
});

test("parseTrace: αγνοεί δημιουργία/λάθος σκαναρίσματος στο τέλος", () => {
  const t = parseTrace({ trace_details: [
    { trace_Status_code: "9814", trace_Status_gr: "ΔΗΜΙΟΥΡΓΙΑ ΣΥΔΕΛΤΑ ΑΠΟ ΠΕΛΑΤΗ (WS)", trace_date: "14/10/2026", trace_time: "10:00" },
    { trace_Status_code: "9431", trace_Status_gr: "ΑΠΟΣΤΟΛΗ ΠΑΡΕΛΗΦΘΗ ΑΠΟ ΤΟΝ ΑΠΟΣΤΟΛΕΑ", trace_date: "14/10/2026", trace_time: "16:00" },
    { trace_Status_code: "9106", trace_Status_gr: "- ERROR SCAN - ΕΧΕΙ ΗΔΗ ΣΚΑΝΑΡΙΣΤΕΙ", trace_date: "14/10/2026", trace_time: "17:00" },
  ] });
  assert.equal(t.state, "in-transit");
  assert.equal(parseTrace({ trace_details: [{ trace_Status_code: "9814", trace_date: "14/10/2026" }] }).state, null);
});
