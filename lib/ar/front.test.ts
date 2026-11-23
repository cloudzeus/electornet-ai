import { test } from "node:test";
import assert from "node:assert/strict";
import { frontMode } from "./front";

test("frontMode: κατά μέτωπο γεμίζει την πρόσοψη, υπό γωνία μπαίνει ολόκληρη", () => {
  assert.equal(frontMode(0.7, 60 / 85), "face");
  assert.equal(frontMode(0.42, 0.31), "billboard");
});
test("frontMode: επίπεδη συσκευή από πάνω· η επιλογή του διαχειριστή γεμίζει πάντα την πρόσοψη", () => {
  assert.equal(frontMode(1.15, 60 / 5, false, 60 / 52), "top");
  assert.equal(frontMode(1.15, 60 / 5, true, 60 / 52), "face");
  assert.equal(frontMode(0.42, 0.31, true), "face");
});
