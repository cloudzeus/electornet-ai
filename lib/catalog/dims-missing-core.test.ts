import { test } from "node:test";
import assert from "node:assert/strict";
import { s1Changes, s1SyncChanges, toRowProposal } from "./dims-missing-core";
import { proposeFromContent } from "./dims-from-content-core";

const live = (o: Record<string, unknown> = {}) => ({ weightKg: "0", lengthCm: "", widthCm: "0", heightCm: "0", mass: "0", dim1: "0", dim2: "0", dim3: "0", ...o });

test("s1Changes: γεμίζει CCC και τυπικά πεδία μόνο όπου είναι κενά", () => {
  const c = s1Changes(live(), { dims: { w: 60, h: 85, d: 55 }, kg: 70 });
  assert.deepEqual(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v!.to])), { lengthCm: 55, widthCm: 60, heightCm: 85, dim1: 55, dim2: 60, dim3: 85, weightKg: 70, mass: 70 });
});
test("s1Changes: μισογεμάτες διαστάσεις και υπάρχον βάρος δεν αγγίζονται", () => {
  const c = s1Changes(live({ widthCm: "60", weightKg: "12,5", dim2: "1" }), { dims: { w: 60, h: 85, d: 55 }, kg: 70 });
  assert.deepEqual(Object.keys(c), ["mass"]);
});
test("toRowProposal: έτοιμο, θέλει μάτι, τίποτα", () => {
  const p = proposeFromContent([{ id: "a", label: "A", specs: [{ key: "Διαστάσεις (ΠxΥxΒ)", value: "60 x 85 x 55 cm" }, { key: "Βάρος", value: "70 kg" }] }], "Πλυντήρια ρούχων");
  assert.equal(toRowProposal("1", { dims: true, weight: true }, p).status, "ready");
  const r = toRowProposal("1", { dims: true, weight: false }, p);
  assert.equal(r.weight, null); assert.equal(r.status, "ready");
  const half = proposeFromContent([{ id: "a", label: "A", specs: [{ key: "Βάρος", value: "70 kg" }] }]);
  assert.equal(toRowProposal("1", { dims: true, weight: true }, half).status, "review");
  assert.equal(toRowProposal("1", { dims: true, weight: false }, half).status, "none");
});
test("toRowProposal: διαστάσεις συσκευασίας (εκτός τυπικών ορίων τύπου) είναι έτοιμες, όχι «θέλει μάτι»", () => {
  const p = proposeFromContent([{ id: "a", label: "A", specs: [{ key: "Πλάτος", value: "78 cm" }, { key: "Ύψος", value: "22,5 cm" }, { key: "Βάθος", value: "49 cm" }] }], "Εστίες");
  assert.match(p.warning ?? "", /εκτός τυπικών ορίων/);
  assert.equal(toRowProposal("1", { dims: true, weight: false }, p).status, "ready");
});
test("s1SyncChanges: τυπικά → CCC, CCC → τυπικά, eshop όπου λείπουν και τα δύο· διαφορετικά βάρη μένουν", () => {
  const to = (c: object) => Object.fromEntries(Object.entries(c).map(([k, x]) => [k, (x as { to: number }).to]));
  // το είδος 56454: διαστάσεις μόνο στα τυπικά, βάρος και στα δύο με άλλη τιμή
  assert.deepEqual(to(s1SyncChanges(live({ weightKg: "2.06", mass: "1.2", dim1: "27", dim2: "19", dim3: "17" }), {})), { lengthCm: 27, widthCm: 19, heightCm: 17 });
  assert.deepEqual(to(s1SyncChanges(live({ weightKg: "5", lengthCm: "40", widthCm: "30", heightCm: "20" }), {})), { dim1: 40, dim2: 30, dim3: 20, mass: 5 });
  assert.deepEqual(to(s1SyncChanges(live(), { dims: { w: 60, h: 85, d: 55 }, kg: 70 })), { lengthCm: 55, widthCm: 60, heightCm: 85, dim1: 55, dim2: 60, dim3: 85, weightKg: 70, mass: 70 });
  assert.deepEqual(s1SyncChanges(live(), {}), {});
});
