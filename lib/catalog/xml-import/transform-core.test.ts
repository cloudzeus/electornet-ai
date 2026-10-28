import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTransform, guessTransform, priceWarning, priceFromMode } from "./transform-core";

test("applyTransform: μετατροπές μονάδων", () => {
  assert.equal(applyTransform("4400", "g_kg"), "4.4");
  assert.equal(applyTransform("4.4", "kg_g"), "4400");
  assert.equal(applyTransform("310", "mm_cm"), "31");
  assert.equal(applyTransform("31.00", "cm_mm"), "310");
  assert.equal(applyTransform("1.8", "m_cm"), "180");
  assert.equal(applyTransform("10", { factor: 2.54 }), "25.4");
});

test("applyTransform: «none» κανονικοποιεί τη μορφή του αριθμού", () => {
  assert.equal(applyTransform("1.234,50", "none"), "1234.5");
  assert.equal(applyTransform("49,90", "none"), "49.9");
});

test("applyTransform: ό,τι δεν είναι θετικός αριθμός μένει αναλλοίωτο", () => {
  assert.equal(applyTransform("abc", "g_kg"), "abc");
  assert.equal(applyTransform("", "g_kg"), "");
  assert.equal(applyTransform("0", "g_kg"), "0");
  assert.equal(applyTransform("-5", "g_kg"), "-5");
  assert.equal(applyTransform("Μαύρο", "cm_mm"), "Μαύρο");
});

test("guessTransform: τάξη μεγέθους δείχνει τη μονάδα", () => {
  assert.equal(guessTransform("weightKg", ["4400", "5750"]), "g_kg");
  assert.equal(guessTransform("weightKg", ["4.40", "5.75"]), "none");
  assert.equal(guessTransform("widthCm", ["300", "240", "310"]), "none", "300 cm είναι πιθανό — δεν μαντεύουμε mm");
  assert.equal(guessTransform("widthCm", ["1200", "900"]), "mm_cm");
  assert.equal(guessTransform("name", ["4400", "5750"]), "none", "μη αριθμητικό πεδίο: ποτέ μετατροπή");
  assert.equal(guessTransform("weightKg", []), "none");
  assert.equal(guessTransform("weightKg", ["abc", ""]), "none");
});

test("priceWarning: κόστος ίσο ή πάνω από τη λιανική είναι ύποπτο", () => {
  assert.ok(priceWarning("52.10", "49.90"), "52,10 > 49,90 → προειδοποίηση");
  assert.ok(priceWarning("49.90", "49.90"), "ίσα → προειδοποίηση");
  assert.equal(priceWarning("40", "49.90"), null);
  assert.equal(priceWarning(null, "49.90"), null);
  assert.equal(priceWarning("40", null), null);
  assert.equal(priceWarning("abc", "49.90"), null);
});

const rule = { percent: 30, rounding: "none" as const };

test("priceFromMode «cost»: κόστος × markup × ΦΠΑ", () => {
  const r = priceFromMode("cost", { cost: "40", retail: null, rule, vat: 24 });
  assert.equal(r.price, 64.48);
  assert.equal(r.source, "markup");
  assert.equal(r.warning, undefined);
});

test("priceFromMode «cost»: πλαφόν στη λιανική του feed", () => {
  const r = priceFromMode("cost", { cost: "40", retail: "49.90", rule, vat: 24 });
  assert.equal(r.price, 49.9, "64,48 > 49,90 → κόβεται στη λιανική");
  assert.equal(r.source, "markup");
});

test("priceFromMode «cost»: χωρίς κανόνα ή χωρίς έγκυρο κόστος δεν βγάζει τιμή", () => {
  const noRule = priceFromMode("cost", { cost: "40", retail: null, rule: null, vat: 24 });
  assert.equal(noRule.price, undefined);
  assert.ok(noRule.warning);

  const bad = priceFromMode("cost", { cost: "abc", retail: null, rule, vat: 24 });
  assert.equal(bad.price, undefined);
  assert.ok(bad.warning);
});

test("priceFromMode «retail»: η λιανική του feed, ο κανόνας αγνοείται", () => {
  const r = priceFromMode("retail", { cost: "40", retail: "49.90", rule, vat: 24 });
  assert.equal(r.price, 49.9);
  assert.equal(r.source, "feed");
  assert.equal(r.warning, undefined);
});

test("priceFromMode «retail»: χωρίς λιανική δεν βγάζει τιμή", () => {
  const r = priceFromMode("retail", { cost: "40", retail: null, rule, vat: 24 });
  assert.equal(r.price, undefined);
  assert.ok(r.warning);
});
