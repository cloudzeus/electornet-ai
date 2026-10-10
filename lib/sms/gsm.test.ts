import { test } from "node:test";
import assert from "node:assert/strict";
import { gsmGreek, gsmLength, greekMobile } from "./gsm";

test("ελληνικά → GSM-7 κεφαλαία χωρίς τόνους", () => {
  assert.equal(gsmGreek("Η εγγύηση λήγει: δωρεάν επέκταση!"), "H EΓΓYHΣH ΛHΓEI: ΔΩPEAN EΠEKTAΣH!");
  assert.equal(gsmGreek("Samsung WW90 «ψυγείο» – ok"), 'Samsung WW90 "ΨYΓEIO" - ok');
  assert.equal(gsmLength(gsmGreek("Ένα κείμενο με ς και ϊ")), 22);
  assert.equal(gsmLength("49 €"), 5);
  assert.equal(gsmLength("ελληνικά"), null);
});

test("κινητό σε διεθνή μορφή", () => {
  assert.equal(greekMobile("6944 123 456"), "306944123456");
  assert.equal(greekMobile("+30 6944123456"), "306944123456");
  assert.equal(greekMobile("00306944123456"), "306944123456");
  assert.equal(greekMobile("2104835143"), null);
  assert.equal(greekMobile(null), null);
});
