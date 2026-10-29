import { test } from "node:test";
import assert from "node:assert/strict";
import { SKIP, splitBrandMap, mergeBrandMap, statusFor } from "./skip-core";

test("splitBrandMap: η «παράλειψη» βγαίνει από τον χάρτη μαρκών και γίνεται δική της λίστα", () => {
  const r = splitBrandMap({ Terra: "b-1", Homely: SKIP, Άγνωστη: null });
  assert.deepEqual(r.skipBrands, ["Homely"]);
  // Η παραλειπόμενη μένει στον χάρτη ως «αποφασισμένη χωρίς μάρκα»: αλλιώς θα ξαναεμφανιζόταν ως καινούργια.
  assert.deepEqual(r.brandMap, { Terra: "b-1", Homely: null, "Άγνωστη": null });
});

test("splitBrandMap: κενές τιμές δεν μπαίνουν στη λίστα παράλειψης", () => {
  assert.deepEqual(splitBrandMap({ "  ": SKIP, Terra: "b-1" }).skipBrands, []);
});

test("mergeBrandMap: για το UI, η παράλειψη ξαναγίνεται επιλογή", () => {
  assert.deepEqual(mergeBrandMap({ Terra: "b-1", Homely: null }, ["Homely"]), { Terra: "b-1", Homely: SKIP });
});

test("mergeBrandMap: μάρκα στη λίστα παράλειψης που δεν είναι στον χάρτη μπαίνει κι αυτή", () => {
  assert.deepEqual(mergeBrandMap({}, ["Homely"]), { Homely: SKIP });
});

test("statusFor: νέα γραμμή — το πρόβλημα προηγείται της παράλειψης", () => {
  assert.equal(statusFor(null, { problem: true, skip: true }), "error");
  assert.equal(statusFor(null, { problem: false, skip: true }), "skipped");
  assert.equal(statusFor(null, { problem: false, skip: false }), "review");
});

test("statusFor: η παράλειψη ανάβει και σβήνει όσο ο χρήστης αλλάζει γνώμη", () => {
  assert.equal(statusFor("review", { problem: false, skip: true }), "skipped");
  assert.equal(statusFor("skipped", { problem: false, skip: false }), "review");
});

test("statusFor: ό,τι δεν χρειάζεται αλλαγή επιστρέφει null — καμία άσκοπη εγγραφή", () => {
  assert.equal(statusFor("review", { problem: false, skip: false }), null);
  assert.equal(statusFor("skipped", { problem: false, skip: true }), null);
});

test("statusFor: γραμμή που μπήκε ή τρέχει ΔΕΝ αγγίζεται ποτέ από την παράλειψη", () => {
  for (const s of ["done", "queued", "importing", "error"]) {
    assert.equal(statusFor(s, { problem: false, skip: true }), null, s);
    assert.equal(statusFor(s, { problem: false, skip: false }), null, s);
  }
});
