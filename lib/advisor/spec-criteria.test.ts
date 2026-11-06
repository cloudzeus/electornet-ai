import { test } from "node:test";
import assert from "node:assert/strict";
import { firstNumber, indexSpecs, numberOf, passes, productPasses, titleMemory, titlePasses } from "./spec-criteria";

test("αριθμοί όπως γράφονται στα χαρακτηριστικά", () => {
  assert.equal(firstNumber("9.000 Btu/h"), 9000);
  assert.equal(firstNumber("1.400 rpm"), 1400);
  assert.equal(firstNumber("4,6"), 4.6);
  assert.equal(firstNumber("4.3"), 4.3);
  assert.equal(firstNumber("2.6 (0.6-3.1) kWatt"), 2.6);
  assert.equal(firstNumber("17.401 Btu/h (3.412-22.17"), 17401);
  assert.equal(firstNumber("76 dB · κλάση B"), 76);
  assert.equal(firstNumber("Ναι"), null);
  assert.equal(numberOf('139,7 cm (55")', "Μέγεθος οθόνης"), 55);
});

test("κριτήρια", () => {
  assert.equal(passes("5.1", { op: "gte", value: 5 }), true);
  assert.equal(passes("4,6", { op: "gte", value: 5 }), false);
  assert.equal(passes("38 dB", { op: "lte", value: 40 }), true);
  assert.equal(passes("R32 (780 g)", { op: "has", value: "R32" }), true);
  assert.equal(passes("R-32", { op: "has", value: "R32" }), true);
  assert.equal(passes("Ναι", { op: "gte", value: 5 }), null);
  assert.equal(passes("40 / 35 / 30 / 21 dB(A)", { op: "lte", value: 25 }), true);
  assert.equal(passes("40 / 35 / 30 / 21 dB(A)", { op: "gte", value: 45 }), false);
  assert.equal(productPasses([{ key: "SCOP", value: "4,2" }, { key: "SCOP", value: "5,1" }], { keys: ["SCOP"], op: "gte", value: 5, need: "" }), true);
  assert.equal(productPasses([{ key: "Θέρμανση", value: "Ναι" }], { keys: ["Θέρμανση"], op: "lte", value: 40, need: "" }), null);
});

test("ευρετήριο κατηγορίας", () => {
  const rows = [1, 2, 3].flatMap((i) => [{ productId: `p${i}`, key: "SCOP", value: ["4,2", "5.1", "4.6"][i - 1] }, { productId: `p${i}`, key: "Χρώμα", value: "Λευκό" }]);
  const idx = indexSpecs([...rows, { productId: "p1", key: "Σπάνιο", value: "x" }], 2);
  assert.deepEqual(idx.find((k) => k.key === "SCOP")?.max, 5.1);
  assert.equal(idx.find((k) => k.key === "Χρώμα")?.min, null);
  assert.equal(idx.some((k) => k.key === "Σπάνιο"), false);
});

test("μνήμη από τον τίτλο", () => {
  assert.deepEqual(titleMemory("S/P Redmi Note 15 Pro 5G Titanium 8/256G INFO QUEST"), { ram: 8, storage: 256 });
  assert.deepEqual(titleMemory("NB HP 15-fc0000nv R7/16/512/11H D0DH9EA WESTNET"), { ram: 16, storage: 512 });
  assert.deepEqual(titleMemory("NB MSI Cyborg A13VE I7RL/15.6/2*8GB/512GB WESTNET"), { ram: 16, storage: 512 });
  assert.deepEqual(titleMemory("APPLE MacBook Air M5 13-inch 8CG/16GB/512GB Silver MDH74GR/A"), { ram: 16, storage: 512 });
  assert.deepEqual(titleMemory("13-inch MacBook Neo: Apple A18 Pro chip with 6 core CPU and 5 core GPU, 8GB, 256GB SSD - Silver"), { ram: 8, storage: 256 });
  assert.deepEqual(titleMemory("iPhone 17 256GB Mist Blue"), { ram: null, storage: 256 });
  assert.deepEqual(titleMemory("MOBILE SAMSUNG SM-A175 GALAXY A17 LTE 4GB / 128GB BLUE"), { ram: 4, storage: 128 });
  assert.deepEqual(titleMemory("HP Laptop 15-fd0001nvx 15.6''HD/Intel N150/4GB RAM/128GB/W11Home"), { ram: 4, storage: 128 });
  assert.equal(titlePasses("APPLE MacBook Air M5 13-inch 8CG/16GB/512GB", { keys: ["Μνήμη RAM"], op: "gte", value: 16, need: "" }), true);
  assert.equal(titlePasses("13-inch MacBook Neo 8GB, 256GB SSD", { keys: ["Μνήμη RAM"], op: "gte", value: 16, need: "" }), false);
  assert.equal(titlePasses("iPhone 17 256GB", { keys: ["Μνήμη Ram"], op: "gte", value: 8, need: "" }), null);
  assert.equal(titlePasses("iPhone 17 256GB", { keys: ["Αποθηκευτικός Χώρος"], op: "gte", value: 256, need: "" }), true);
  assert.equal(titlePasses("TV 55 120Hz", { keys: ["Ρυθμός ανανέωσης"], op: "gte", value: 100, need: "" }), null);
});
