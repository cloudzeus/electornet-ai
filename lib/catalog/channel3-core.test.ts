import { test } from "node:test";
import assert from "node:assert/strict";
import { c3Images, c3Offer, c3Query, c3Specs, codeMatch, matchCodes, normCode, pickMatch, type C3Product } from "./channel3-core";

const p = { brand: "AEG", modelCode: "L7FEC41PSG", sku: "251701", title: "Πλυντήριο AEG L7FEC41PSG 10kg" };
const hit: C3Product = {
  id: "c3_1", title: "AEG L7FEC41PSG Washing Machine 10kg", brands: [{ name: "AEG" }],
  images: [{ url: "https://cdn.shop.gr/b.jpg" }, { url: "https://cdn.shop.gr/a.jpg", is_main_image: true }, { url: "http://insecure/x.jpg" }],
  key_features: ["Capacity: 10 kg", "Steam programme", "Spin speed: 1400 rpm", "Capacity: 9 kg"],
  structured_attributes: { color: ["White"], gender: ["male"], energy_class: ["A"], noise: ["n/a"] },
  offers: [
    { url: "https://www.skroutz.gr/s/1", domain: "skroutz.gr", availability: "InStock", dimensions: null },
    { url: "https://shop.gr/p/1", domain: "shop.gr", availability: "OutOfStock", dimensions: { width: { number: 59.7, unit: "cm" }, height: { number: 84.7, unit: "cm" }, weight: { number: 70.25, unit: "kg" } } },
    { url: "https://other.gr/p/1", domain: "other.gr", availability: "InStock" },
  ],
};

test("normCode / matchCodes: κωδικοί χωρίς σύμβολα, μόνο αρκετά μακριοί με ψηφία", () => {
  assert.equal(normCode("WM-8014 /EU"), "wm8014eu");
  assert.deepEqual(matchCodes({ modelCode: "L7FEC41PSG", sku: "251701" }), ["l7fec41psg", "251701"]);
  assert.deepEqual(matchCodes({ modelCode: "X1", sku: "ABCDEF" }), []);
  assert.equal(c3Query(p), "AEG L7FEC41PSG");
  assert.equal(c3Query({ ...p, modelCode: null }), "AEG 251701");
});

test("pickMatch: ίδια μάρκα και ο κωδικός στον τίτλο, αλλιώς τίποτα", () => {
  const other: C3Product = { id: "c3_2", title: "AEG L7FEC41PSB Washing Machine", brands: [{ name: "AEG" }] };
  const wrongBrand: C3Product = { id: "c3_3", title: "Bosch L7FEC41PSG copy", brands: [{ name: "Bosch" }] };
  assert.equal(pickMatch([other, wrongBrand, hit], p)?.id, "c3_1");
  assert.equal(pickMatch([other, wrongBrand], p), null);
  assert.equal(pickMatch([hit], { brand: "AEG", modelCode: null, sku: "AB" }), null);
});

test("codeMatch: ολόκληρος ή βασικός κωδικός (χωρίς κατάληξη αγοράς), όχι άλλο μέγεθος", () => {
  assert.equal(codeMatch("SAMSUNG Q7F 55 QLED TV 2025 - QE55Q7F", "qe55q7faauxxh"), "base");
  assert.equal(codeMatch("SAMSUNG Q7F 43 QLED TV 2025 QE43Q7F", "qe55q7faauxxh"), null);
  assert.equal(codeMatch("Samsung QE55Q7FAAUXXH", "qe55q7faauxxh"), "exact");
  assert.equal(codeMatch("Samsung QE55 TV", "qe55q7faauxxh"), null);
  const tvs: C3Product[] = [{ id: "base", title: "Samsung QE55Q7F TV", brands: [{ name: "Samsung" }] }, { id: "exact", title: "Samsung QE55Q7FAAUXXH", brands: [{ name: "Samsung" }] }];
  assert.equal(pickMatch(tvs, { brand: "SAMSUNG", modelCode: "QE55Q7FAAUXXH", sku: "1" })?.id, "exact");
  assert.equal(pickMatch(tvs.slice(0, 1), { brand: "SAMSUNG", modelCode: "QE55Q7FAAUXXH", sku: "1" })?.id, "base");
});

test("c3Specs: attributes + «κλειδί: τιμή» + διαστάσεις, χωρίς άχρηστα και διπλά", () => {
  const s = c3Specs(hit);
  assert.deepEqual(s.map((x) => `${x.group}|${x.key}|${x.value}`), [
    "Χαρακτηριστικά|Color|White",
    "Χαρακτηριστικά|Energy class|A",
    "Βασικά χαρακτηριστικά|Capacity|10 kg",
    "Βασικά χαρακτηριστικά|Spin speed|1400 rpm",
    "Βασικά χαρακτηριστικά|Βασικά σημεία|Steam programme",
    "Διαστάσεις & βάρος|Πλάτος|59,7 cm",
    "Διαστάσεις & βάρος|Ύψος|84,7 cm",
    "Διαστάσεις & βάρος|Βάρος|70,3 kg",
  ]);
});

test("c3Images / c3Offer: κύρια πρώτα, μόνο https· κατάστημα όχι συγκριτικό, με απόθεμα πρώτα", () => {
  assert.deepEqual(c3Images(hit), ["https://cdn.shop.gr/a.jpg", "https://cdn.shop.gr/b.jpg"]);
  assert.equal(c3Offer(hit, (u) => u.includes("skroutz"))?.domain, "other.gr");
  assert.equal(c3Offer({ ...hit, offers: [] }, () => false), null);
});
