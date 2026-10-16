import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextAction, nextStatuses, orderSteps, searchKind, addressOf } from "./model";

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
