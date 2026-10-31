import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAvailability, parseConds, toShopAvailability, type AvailRule, type AvailInput } from "./availability-core";

const base: AvailInput = { stock: 0, brandId: "b1", categoryIds: ["c3", "c2", "c1"], hasPrice: true };
const rule = (id: string, conditions: AvailRule["conditions"], label: string, state: AvailRule["state"] = "order", publish = true): AvailRule => ({ id, active: true, conditions, label, state, publish });

test("προεπιλογή: απόθεμα → άμεσα, αλλιώς κατόπιν παραγγελίας / στο κατάστημα", () => {
  assert.equal(resolveAvailability({ ...base, stock: 2 }, []).label, "Άμεσα διαθέσιμο");
  assert.equal(resolveAvailability(base, []).label, "Διαθέσιμο κατόπιν παραγγελίας");
  assert.equal(resolveAvailability({ ...base, hasPrice: false }, []).label, "Διαθεσιμότητα στο κατάστημα");
  assert.equal(resolveAvailability(base, []).source, "default");
});

test("η φράση του είδους υπερισχύει των κανόνων", () => {
  const r = resolveAvailability({ ...base, override: "  Μετά από   παραγγελία " }, [rule("r1", [], "Κάτι άλλο")]);
  assert.deepEqual([r.label, r.source, r.state], ["Μετά από παραγγελία", "override", "order"]);
  assert.equal(resolveAvailability({ ...base, stock: 3, override: "Ειδική" }, []).state, "in-stock");
});

test("πρώτος κανόνας που ταιριάζει κερδίζει· όλες οι συνθήκες μαζί", () => {
  const rules = [
    rule("out", [{ k: "stock", op: "<=", n: 0 }, { k: "supplier", in: ["unavailable"] }], "Εξαντλήθηκε", "unavailable", false),
    rule("sup", [{ k: "supplier", in: ["in-stock", "low"] }], "Αποστολή σε 3–5 εργάσιμες"),
    rule("all", [], "Για όλα τα υπόλοιπα"),
  ];
  const out = resolveAvailability({ ...base, supplier: "unavailable" }, rules);
  assert.deepEqual([out.ruleId, out.publish, out.state], ["out", false, "unavailable"]);
  assert.equal(resolveAvailability({ ...base, stock: 1, supplier: "unavailable" }, rules).ruleId, "all");
  assert.equal(resolveAvailability({ ...base, supplier: "low" }, rules).ruleId, "sup");
  assert.equal(resolveAvailability({ ...base, supplier: null }, rules).ruleId, "all");
});

test("ανενεργός κανόνας αγνοείται· κατηγορία ταιριάζει και σε γονική", () => {
  const off = { ...rule("x", [], "x"), active: false };
  assert.equal(resolveAvailability(base, [off]).source, "default");
  assert.equal(resolveAvailability(base, [rule("c", [{ k: "category", in: ["c1"] }], "Λευκές")]).ruleId, "c");
  assert.equal(resolveAvailability(base, [rule("c", [{ k: "category", in: ["zz"] }], "x")]).source, "default");
  assert.equal(resolveAvailability(base, [rule("p", [{ k: "price", has: false }], "x")]).source, "default");
  assert.equal(resolveAvailability(base, [rule("b", [{ k: "brand", in: ["b1"] }], "Brand")]).ruleId, "b");
});

test("parseConds κρατά μόνο έγκυρες συνθήκες", () => {
  assert.deepEqual(parseConds([{ k: "stock", op: ">", n: "2" }, { k: "stock", op: "!", n: 1 }, { k: "supplier", in: ["low", "bad"] }, { k: "brand", in: [] }, { k: "price", has: true }, null, "x"]),
    [{ k: "stock", op: ">", n: 2 }, { k: "supplier", in: ["low"] }, { k: "price", has: true }]);
  assert.deepEqual(parseConds("nope"), []);
});

test("toShopAvailability", () => {
  assert.deepEqual(toShopAvailability({ label: "Άμεσα", state: "low" }, "2026-11-02"), { kind: "in-stock", deliveryDate: "2026-11-02", label: "Άμεσα" });
  assert.deepEqual(toShopAvailability({ label: "Άμεσα διαθέσιμο", state: "in-stock" }, "d"), { kind: "in-stock", deliveryDate: "d" });
  assert.deepEqual(toShopAvailability({ label: "Εξαντλήθηκε", state: "unavailable" }, "d"), { kind: "order", label: "Εξαντλήθηκε" });
});

test("guessAvail: τιμές διαθεσιμότητας του feed", async () => {
  const { guessAvail } = await import("./foreign-import/core");
  assert.equal(guessAvail("Διαθέσιμο"), "in-stock");
  assert.equal(guessAvail("Μη Διαθέσιμο"), "unavailable");
  assert.equal(guessAvail("Μικρό Απόθεμα"), "low");
  assert.equal(guessAvail("Χαμηλό Απόθεμα"), "low");
  assert.equal(guessAvail("Κατόπιν παραγγελίας"), "order");
  assert.equal(guessAvail("Out of stock"), "unavailable");
  assert.equal(guessAvail("In stock"), "in-stock");
  assert.equal(guessAvail("xyz"), null);
});
