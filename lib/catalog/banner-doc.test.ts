import { test } from "node:test";
import assert from "node:assert/strict";
import { calmTitle } from "./banner-doc";

const corpus = "Όλα τα πλυντήρια της AEG διαθέτουν τον κάδο ProTex για να φροντίζει τα ρούχα σας. Η προστασία των υφασμάτων.";

test("calmTitle: ΚΕΦΑΛΑΙΑ → κανονική γραφή με τους τόνους του κειμένου", () => {
  assert.equal(calmTitle("ΠΡΟΣΤΑΣΙΑ ΓΙΑ ΤΑ ΡΟΥΧΑ ΣΑΣ", corpus), "Προστασία για τα ρούχα σας");
  assert.equal(calmTitle("ΚΑΔΟΣ PROTEX", corpus), "ΚΑΔΟΣ PROTEX"); // «κάδος» δεν υπάρχει αυτούσιο → μένει ως έχει
  assert.equal(calmTitle("Ο ΚΑΔΟ PROTEX", corpus), "Ο κάδο ProTex");
});

test("calmTitle: αφήνει ό,τι δεν είναι κεφαλαία ή δεν βρίσκει", () => {
  assert.equal(calmTitle("Λειτουργίες", corpus), "Λειτουργίες");
  assert.equal(calmTitle("ΕΞΟΙΚΟΝΟΜΗΣΗ ΝΕΡΟΥ", corpus), "ΕΞΟΙΚΟΝΟΜΗΣΗ ΝΕΡΟΥ");
});
