import { test } from "node:test";
import assert from "node:assert/strict";
import { setErp, spcsOf, setPrice, setStock, soldAloneFor, setTitle } from "./set-core";

test("κωδικοί προϊόντος-σετ", () => {
  assert.equal(setErp(594), "SET-594");
  assert.equal(spcsOf("SET-594"), 594);
  assert.equal(spcsOf("142219"), null);
  assert.equal(spcsOf(null), null);
  assert.equal(spcsOf("SET-x"), null);
});

test("τιμή σετ = άθροισμα μελών × ποσότητα· χωρίς τιμή = 0", () => {
  assert.equal(setPrice([{ price: 399, qty: 1 }, { price: null, qty: 1 }]), 399);
  assert.equal(setPrice([{ price: 10.005, qty: 2 }]), 20.01);
  assert.equal(setPrice([]), 0);
});

test("απόθεμα σετ = πόσα πλήρη σετ βγαίνουν", () => {
  assert.equal(setStock([{ stock: 5, qty: 1, isMain: true }, { stock: 2, qty: 1, isMain: false }], "parts"), 2);
  assert.equal(setStock([{ stock: 5, qty: 2, isMain: true }, { stock: 9, qty: 1, isMain: false }], "parts"), 2);
  assert.equal(setStock([{ stock: -3, qty: 1, isMain: true }], "parts"), 0);
  assert.equal(setStock([{ stock: 4, qty: 1, isMain: true }, { stock: 0, qty: 1, isMain: false }], "gift"), 0);
  assert.equal(setStock([], "parts"), 0);
});

test("πωλείται και μόνο του", () => {
  assert.equal(soldAloneFor("auto", true), false);
  assert.equal(soldAloneFor("auto", false), true);
  assert.equal(soldAloneFor("yes", true), true);
  assert.equal(soldAloneFor("no", false), false);
});

test("τίτλος σετ: χωρίς διπλά κενά, μάρκα μία φορά", () => {
  assert.equal(setTitle("Κλιματιστικό  TAN/TAG-09IG IKIGAI  Inverter TOYOTOMI", "TOYOTOMI"), "Κλιματιστικό TAN/TAG-09IG IKIGAI Inverter TOYOTOMI");
  assert.equal(setTitle("43UR78006LK.API + MR24GN.AEU", "LG"), "LG 43UR78006LK.API + MR24GN.AEU");
  assert.equal(setTitle("PHILIPS GC9660/30 + Δώρο σιδερώστρα", "Philips"), "PHILIPS GC9660/30 + Δώρο σιδερώστρα");
});

test("τιμή σετ με δώρο: το δώρο δεν χρεώνεται (μετρά μόνο το κύριο)", () => {
  assert.equal(setPrice([{ price: 299, qty: 1, isMain: true }, { price: 29, qty: 1, isMain: false }], "gift"), 299);
  assert.equal(setPrice([{ price: 399, qty: 1, isMain: true }, { price: 0, qty: 1, isMain: false }], "parts"), 399);
});
