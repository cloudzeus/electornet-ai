import { test } from "node:test";
import assert from "node:assert/strict";
import { setErp, spcsOf, setPrice, setStock, soldAloneFor, setTitle, validSet, setPartsSnapshot, setKind, soldAloneChange } from "./set-core";

test("κωδικοί προϊόντος-σετ", () => {
  assert.equal(setErp(594), "SET-594");
  assert.equal(spcsOf("SET-594"), 594);
  assert.equal(spcsOf("142219"), null);
  assert.equal(spcsOf(null), null);
  assert.equal(spcsOf("SET-x"), null);
});

test("τιμή σετ = τιμή κύριου × ποσότητα του (τα μέλη γράφονται με 0, όπως στο SoftOne)", () => {
  assert.equal(setPrice([{ price: 399, qty: 1, isMain: true }, { price: null, qty: 1, isMain: false }]), 399);
  assert.equal(setPrice([{ price: 10.005, qty: 2, isMain: true }]), 20.01);
  assert.equal(setPrice([]), 0);
  // διπλή γραμμή κύριου (λάθος στο SoftOne): μετρά μία φορά
  assert.equal(setPrice([{ price: 479, qty: 1, isMain: true }, { price: 479, qty: 1, isMain: true }]), 479);
  // μέλος με δική του τιμή (εξάρτημα): δεν χρεώνεται χωριστά
  assert.equal(setPrice([{ price: 399, qty: 1, isMain: true }, { price: 50, qty: 1, isMain: false }]), 399);
});

test("έγκυρο σετ: χρειάζεται κύριο και τουλάχιστον ένα άλλο είδος", () => {
  assert.equal(validSet([{ mtrl: 1 }, { mtrl: 2 }], 1), true);
  assert.equal(validSet([{ mtrl: 1 }, { mtrl: 1 }], 1), false);
  assert.equal(validSet([{ mtrl: 2 }, { mtrl: 3 }], 1), false);
  assert.equal(validSet([{ mtrl: 1 }], 1), false);
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

test("στιγμιότυπο μελών για την παραγγελία: κύριο πρώτο, διπλές γραμμές κύριου μία φορά", () => {
  const parts = setPartsSnapshot({ mtrl: 142219, lines: [{ mtrl: 142219, qty: 1, name: "TAN-09IG" }, { mtrl: 142220, qty: 1, name: "TAG-09IG" }] });
  assert.deepEqual(parts, [{ mtrl: 142219, qty: 1, name: "TAN-09IG", main: true }, { mtrl: 142220, qty: 1, name: "TAG-09IG", main: false }]);
  assert.equal(setPartsSnapshot({ mtrl: 1, lines: [{ mtrl: 2, qty: 1, name: "b" }, { mtrl: 1, qty: 1, name: "a" }, { mtrl: 1, qty: 1, name: "a" }] })[0].mtrl, 1);
  assert.equal(setPartsSnapshot({ mtrl: 1, lines: [{ mtrl: 1, qty: 1, name: "a" }, { mtrl: 1, qty: 1, name: "a" }, { mtrl: 2, qty: 3, name: "b" }] }).length, 2);
});

test("είδος σετ: με δώρο αν το λέει το όνομα ή αν άλλο μέλος πουλιέται στο site· αλλιώς εξαρτήματα", () => {
  const lines = [{ mtrl: 1 }, { mtrl: 2 }];
  assert.equal(setKind("TOYOTOMI TAN/TAG-09IG", lines, 1, () => false), "parts");
  assert.equal(setKind("PHILIPS GC9660 + Δώρο σιδερώστρα", lines, 1, () => false), "gift");
  assert.equal(setKind("LG 43UR + soundbar", lines, 1, (m) => m === 2), "gift");
  // το κύριο που πουλιέται δεν κάνει το σετ «με δώρο»
  assert.equal(setKind("TOYOTOMI", lines, 1, (m) => m === 1), "parts");
});

test("μαζική αλλαγή «Πωλείται και μόνο του»: πόσα αλλάζουν, πόσα κρύβονται, πόσα εμφανίζονται", () => {
  const rows = [
    { mode: "auto", soldAlone: false, mainOfParts: true },  // κύριο εξαρτημάτων, κρυφό
    { mode: "auto", soldAlone: true, mainOfParts: false },  // απλό είδος
    { mode: "yes", soldAlone: true, mainOfParts: true },    // ρητά ναι
  ];
  assert.deepEqual(soldAloneChange(rows, "no"), { changed: 3, hide: 2, show: 0 });
  assert.deepEqual(soldAloneChange(rows, "yes"), { changed: 2, hide: 0, show: 1 });
  assert.deepEqual(soldAloneChange(rows, "auto"), { changed: 1, hide: 1, show: 0 });
});
