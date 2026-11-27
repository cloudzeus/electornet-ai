import { test } from "node:test";
import assert from "node:assert/strict";
import { basketCharge, classifyShipClass, BASE_CLASS_PRICES } from "./ship-class";

test("τηλεοράσεις: η κλάση βγαίνει από τις ίντσες του τίτλου", () => {
  assert.equal(classifyShipClass({ categoryPath: ["tileoraseis"], title: 'Samsung QE55 Smart TV 55"', weightKg: 15, dimsCm: null }), "G");
  assert.equal(classifyShipClass({ categoryPath: ["tileoraseis"], title: 'LG OLED65 65"', weightKg: 25, dimsCm: null }), "D");
  assert.equal(classifyShipClass({ categoryPath: ["tileoraseis"], title: 'Samsung 98" Neo QLED', weightKg: 60, dimsCm: null }), "E");
  assert.equal(classifyShipClass({ categoryPath: ["tileoraseis"], title: "Τηλεόραση χωρίς ίντσες στον τίτλο", weightKg: 20, dimsCm: null }), "D");
});

test("λευκές/ογκώδεις συσκευές: Δ εξ ορισμού, Ε για ντουλάπα/side-by-side", () => {
  assert.equal(classifyShipClass({ categoryPath: ["leykes-syskeyes", "psygeia", "psygeia-typos"], title: "Ψυγείο", weightKg: 60, dimsCm: null }), "D");
  assert.equal(classifyShipClass({ categoryPath: ["leykes-syskeyes", "psygeia", "ntoylapes-side-by-side"], title: "Ψυγείο ντουλάπα", weightKg: 110, dimsCm: null }), "E");
  assert.equal(classifyShipClass({ categoryPath: ["leykes-syskeyes", "psygeia", "mikra-psygeia-mini-bars"], title: "Μίνι ψυγείο", weightKg: 12, dimsCm: null }), "B");
});

test("πλυντήριο: Ε μόνο όταν η χωρητικότητα ξεπερνά τα 10 κιλά", () => {
  assert.equal(classifyShipClass({ categoryPath: ["plyntiria-stegnotiria", "plyntiria-roychon"], title: "Πλυντήριο 9 κιλών", weightKg: 65, dimsCm: null, washerKg: 9 }), "D");
  assert.equal(classifyShipClass({ categoryPath: ["plyntiria-stegnotiria", "plyntiria-roychon"], title: "Πλυντήριο 12 κιλών", weightKg: 80, dimsCm: null, washerKg: 12 }), "E");
});

test("μικροσυσκευές (Β) και πολύ μικρά προϊόντα (Α)", () => {
  assert.equal(classifyShipClass({ categoryPath: ["prosopiki-frontida", "gia-ton-andra", "xyristikes-michanes"], title: "Ξυριστική μηχανή", weightKg: 0.3, dimsCm: null }), "A");
  assert.equal(classifyShipClass({ categoryPath: ["oikiakos-exoplismos", "skoypes", "ilektrikes-skoypes"], title: "Ηλεκτρική σκούπα", weightKg: 5, dimsCm: null }), "B");
  assert.equal(classifyShipClass({ categoryPath: ["tilefonia", "kiniti-tilefonia", "axesoyar-kiniton"], title: "Θήκη κινητού", weightKg: 0.05, dimsCm: null }), "A");
});

test("ρητή απόφαση διαχειριστή κερδίζει το default", () => {
  assert.equal(classifyShipClass({ categoryPath: ["tileoraseis"], title: 'TV 40"', weightKg: 8, dimsCm: null }, { tileoraseis: "A" }), "A");
});

test("χρέωση καλαθιού: 100% το πρώτο τεμάχιο, 50% κάθε επιπλέον ίδιας κλάσης", () => {
  assert.equal(basketCharge([{ cls: "A", qty: 1 }, { cls: "B", qty: 1 }], BASE_CLASS_PRICES), 300 + 900);
  assert.equal(basketCharge([{ cls: "G", qty: 1 }, { cls: "D", qty: 1 }], BASE_CLASS_PRICES), 5000 + 5000);
  assert.equal(basketCharge([{ cls: "D", qty: 2 }], BASE_CLASS_PRICES), 5000 + 2500);
  assert.equal(basketCharge([{ cls: "B", qty: 1 }, { cls: "D", qty: 2 }], BASE_CLASS_PRICES), 900 + 5000 + 2500);
  assert.equal(basketCharge([], BASE_CLASS_PRICES), 0);
});
