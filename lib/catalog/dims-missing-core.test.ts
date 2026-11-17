import { test } from "node:test";
import assert from "node:assert/strict";
import { s1Changes, toRowProposal } from "./dims-missing-core";
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
