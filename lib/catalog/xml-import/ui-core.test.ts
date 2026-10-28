import { test } from "node:test";
import assert from "node:assert/strict";
import { SPEC_PREFIX, CATEGORY_PAIR } from "./parse-core";
import { DIFF, DIFF_ORDER, STATUS, TARGET_OF, TARGETS, headerLabel, isDecimal, sectionOf, toTransform, transformValue } from "./ui-core";

/**
 * Το `ui-core` κρατά δικό του αντίγραφο των δύο προθεμάτων, ώστε το bundle του browser να μη φέρνει `fast-xml-parser`
 * και `iconv-lite`. Αυτό το test είναι ο λόγος που το αντίγραφο είναι ασφαλές.
 */
test("ui-core: τα προθέματα μένουν ίδια με το parse-core", () => {
  assert.equal(headerLabel("spec:Χρώμα"), "Χαρακτηριστικό: Χρώμα", "το πρόθεμα χαρακτηριστικού πρέπει να είναι το SPEC_PREFIX");
  assert.equal(SPEC_PREFIX, "spec:");
  assert.equal(headerLabel(`${SPEC_PREFIX}Υλικό`), "Χαρακτηριστικό: Υλικό");
  // Η παράγωγη στήλη κατηγορίας μένει αυτούσια (έχει ήδη ελληνικό όνομα)
  assert.equal(headerLabel(CATEGORY_PAIR), CATEGORY_PAIR);
  assert.equal(CATEGORY_PAIR, "Κατηγορία (πλήρης)");
});

test("ui-core: η επικεφαλίδα του feed μένει ως είναι όταν δεν είναι χαρακτηριστικό", () => {
  assert.equal(headerLabel("SKU"), "SKU");
  assert.equal(headerLabel("imageurl 1"), "imageurl 1");
});

test("ui-core: οι ενότητες του modal καλύπτουν κάθε στόχο", () => {
  assert.equal(sectionOf("field:name"), "fields");
  assert.equal(sectionOf("field:weightKg"), "fields");
  assert.equal(sectionOf("spec"), "specs");
  assert.equal(sectionOf("cost"), "price");
  assert.equal(sectionOf("rrp"), "price");
  assert.equal(sectionOf("media:image"), "images");
  assert.equal(sectionOf("ignore"), "ignored");
  assert.equal(sectionOf(undefined), "ignored", "στήλη χωρίς στόχο δεν εμφανίζεται στο modal");
});

test("ui-core: μετατροπή μονάδας από τον browser — ό,τι δεν αναγνωρίζεται δεν πειράζει την τιμή", () => {
  assert.equal(toTransform("g_kg"), "g_kg");
  assert.equal(toTransform("mm_cm"), "mm_cm");
  assert.equal(toTransform("κάτι άλλο"), "none");
  assert.equal(toTransform(""), "none");
  // το `{factor}` δεν έχει επιλογή στο UI: φαίνεται ως «όπως ήρθε» και δεν χάνεται από τη βάση
  assert.equal(transformValue({ factor: 2.54 }), "none");
  assert.equal(transformValue("kg_g"), "kg_g");
});

test("ui-core: inputMode=decimal μόνο στα αριθμητικά", () => {
  for (const t of ["field:widthCm", "field:heightCm", "field:lengthCm", "field:weightKg", "field:guaranteeMonths", "cost", "rrp"]) assert.ok(isDecimal(t), t);
  for (const t of ["field:name", "spec", "media:image", "brand", "category", "ignore"]) assert.ok(!isDecimal(t), t);
  assert.ok(!isDecimal(undefined));
});

test("ui-core: κάθε κατάσταση και κάθε διαφορά έχει ελληνική λέξη (ποτέ μόνο χρώμα)", () => {
  for (const d of DIFF_ORDER) {
    assert.ok(DIFF[d].label.length > 2, d);
    assert.ok(DIFF[d].help.length > 10, `${d}: θέλει εξήγηση`);
  }
  for (const s of ["review", "queued", "importing", "done", "error", "skipped"]) assert.ok(STATUS[s], s);
});

test("ui-core: κάθε στόχος στηλών έχει ετικέτα και εξήγηση, χωρίς διπλές τιμές", () => {
  const items = TARGETS.flatMap((g) => g.items);
  assert.equal(new Set(items.map((i) => i.value)).size, items.length, "διπλός στόχος");
  for (const i of items) {
    assert.ok(i.label.length > 2, i.value);
    assert.ok(i.help.length > 15, `${i.value}: θέλει εξήγηση`);
    assert.equal(TARGET_OF.get(i.value), i);
  }
  // Το SKU είναι υποχρεωτικό για την εισαγωγή — πρέπει να προσφέρεται
  assert.ok(TARGET_OF.has("field:code"));
});
