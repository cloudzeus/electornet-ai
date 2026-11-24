import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextAction, nextStatuses, orderSteps, searchKind, addressOf, payable, payUntil } from "./model";

test("nextStatuses: ανά τρόπο παράδοσης", () => {
  assert.deepEqual(nextStatuses("processing", "courier"), ["shipped", "cancelled"]);
  assert.deepEqual(nextStatuses("processing", "click-collect"), ["ready-for-pickup", "cancelled"]);
  assert.deepEqual(nextStatuses("processing", "appointment"), ["delivered", "cancelled"]);
  assert.ok(nextStatuses("paid", "click-collect").includes("ready-for-pickup"));
  assert.ok(!nextStatuses("paid", "courier").includes("ready-for-pickup"));
  assert.deepEqual(nextStatuses("cancelled", "courier"), []);
  assert.ok(canTransition("delivered", "returned", "courier"));
  assert.ok(!canTransition("delivered", "cancelled", "courier"));
});

test("nextAction: η επόμενη ενέργεια", () => {
  assert.deepEqual(nextAction({ status: "pending", fulfilment: "courier", paymentMethod: "cod", hasShipment: false }).kind, "status");
  assert.equal(nextAction({ status: "pending", fulfilment: "courier", paymentMethod: "card", hasShipment: false }).kind, "none");
  assert.equal(nextAction({ status: "processing", fulfilment: "courier", paymentMethod: "card", hasShipment: false }).kind, "voucher");
  assert.equal(nextAction({ status: "processing", fulfilment: "courier", paymentMethod: "card", hasShipment: true }).kind, "none");
  const r = nextAction({ status: "paid", fulfilment: "click-collect", paymentMethod: "card", hasShipment: false });
  assert.ok(r.kind === "status" && r.to === "ready-for-pickup");
});

test("orderSteps", () => {
  assert.deepEqual(orderSteps("processing", "courier").map((s) => s.state), ["done", "current", "todo", "todo"]);
  assert.deepEqual(orderSteps("delivered", "courier").map((s) => s.state), ["done", "done", "done", "done"]);
  assert.equal(orderSteps("cancelled", "courier")[3].label, "Ακυρώθηκε");
  assert.equal(orderSteps("ready-for-pickup", "click-collect")[2].state, "current");
});

test("searchKind / addressOf", () => {
  assert.equal(searchKind("EUR-20261016-0001"), "number");
  assert.equal(searchKind("maria@example.gr"), "email");
  assert.equal(searchKind("694 123 4567"), "phone");
  assert.equal(searchKind("Παπαδόπουλος"), "text");
  assert.equal(addressOf({ street: "Ερμού", number: "10", floor: "3", zip: "10563", city: "Αθήνα" }), "Ερμού 10, 3ος, 10563 Αθήνα");
  assert.match(addressOf({ locker: { name: "Σύνταγμα", zip: "10563" } }), /BOX NOW/);
});

test("payable: μόνο online παραγγελία που περιμένει ακόμη πληρωμή", () => {
  const o = (status: string, psp: string | null, pay: string) => ({ status, payment: { psp, status: pay } });
  assert.equal(payable(o("pending", "viva", "pending")), true); // έφυγε από τη σελίδα της Viva
  assert.equal(payable(o("pending", "viva", "failed")), true); // η τράπεζα απέρριψε: δοκιμάζει ξανά
  assert.equal(payable(o("pending", "klarna", "pending")), true);
  assert.equal(payable(o("pending", "viva", "processing")), false); // IRIS που επιβεβαιώνεται: όχι δεύτερη πληρωμή
  assert.equal(payable(o("pending", "viva", "review")), false);
  assert.equal(payable(o("paid", "viva", "paid")), false);
  assert.equal(payable(o("cancelled", "viva", "cancelled")), false);
  assert.equal(payable(o("pending", null, "pending")), false); // αντικαταβολή, κατάθεση
  assert.equal(payable({ status: "pending", payment: null }), false);
});

test("payUntil: 24 ώρες μετά την καταχώρηση, σε ώρα Ελλάδας", () => {
  // Δευτέρα 23/11/2026 14:45 UTC = 16:45 Ελλάδας → Τρίτη 16:45
  assert.match(payUntil(new Date("2026-11-23T14:45:00Z")), /Τρίτη.*16:45/);
});

test("όροφος: ό,τι κι αν έγραψε ο πελάτης, βγαίνει μία φορά το «ος όροφος»", async () => {
  const { floorLabel } = await import("./model");
  assert.deepEqual(["3", "1ος", " 2 ", "Ισόγειο", "", null].map(floorLabel), ["3ος όροφος", "1ος όροφος", "2ος όροφος", "Ισόγειο", "", ""]);
});
