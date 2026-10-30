import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRA_OFFER_COLS, EXTRA_OFFER_FILTER, offersFromExtra, onSite } from "./offers-core";

test("οι στήλες και το φίλτρο του MTREXTRA περιλαμβάνουν την «Εξαίρεση Web»", () => {
  assert.deepEqual([...EXTRA_OFFER_COLS], ["MTRL", "NUM04", "DATE01", "BOOL01", "BOOL02", "BOOL04"]);
  // το φίλτρο πρέπει να φέρνει και τα εξαιρεμένα, αλλιώς θα φαίνονταν «χωρίς σήμανση»
  assert.match(EXTRA_OFFER_FILTER, /BOOL04=1/);
});

test("γραμμή MTREXTRA → τιμή, ημερομηνία, σημάνσεις", () => {
  assert.deepEqual(offersFromExtra(["142368", "549,00", "2026-03-17 11:50:36", "1", "0", "0"]), {
    eshopPrice: 549, eshopDate01: new Date("2026-03-17T11:50:36"), eshopFlag1: true, eshopFlag2: false, webExcluded: false,
  });
});

test("«Εξαίρεση Web» = 1 → το είδος είναι εκτός site", () => {
  assert.equal(offersFromExtra(["1", "0", "", "0", "0", "1"]).webExcluded, true);
  assert.equal(offersFromExtra(["1", "0", "", "0", "0", "1"]).eshopPrice, null);
});

test("είδος χωρίς γραμμή MTREXTRA δεν θεωρείται εξαιρεμένο", () => {
  assert.deepEqual(offersFromExtra(null), { eshopPrice: null, eshopDate01: null, eshopFlag1: false, eshopFlag2: false, webExcluded: false });
});

test("στη βιτρίνα μπαίνει μόνο ενεργό, υπαρκτό και μη εξαιρεμένο είδος", () => {
  assert.equal(onSite({ active: true, missing: false, webExcluded: false }), true);
  assert.equal(onSite({ active: true, missing: false, webExcluded: true }), false);
  assert.equal(onSite({ active: false, missing: false, webExcluded: false }), false);
  assert.equal(onSite({ active: true, missing: true, webExcluded: false }), false);
});
