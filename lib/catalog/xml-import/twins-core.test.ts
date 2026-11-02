import { test } from "node:test";
import assert from "node:assert/strict";
import { sameNameGroups } from "./twins-core";

const r = (name: string, key: string) => ({ name, key });

test("sameNameGroups: ίδιο όνομα με ΔΙΑΦΟΡΕΤΙΚΟ κλειδί είναι ζεύγος", () => {
  // Πραγματικό: η εσωτερική και η εξωτερική μονάδα ενός split έχουν το ίδιο εμπορικό όνομα.
  const out = sameNameGroups([
    r("Inventor Emperor EMPVI-12WFI/EMPVO-12 Κλιματιστικό 12.000 BTU/h", "220227152"),
    r("Inventor Emperor EMPVI-12WFI/EMPVO-12 Κλιματιστικό 12.000 BTU/h", "220227153"),
    r("Inventor SERA Αφυγραντήρας", "2606520"),
  ]);
  assert.deepEqual(out, [{ name: "Inventor Emperor EMPVI-12WFI/EMPVO-12 Κλιματιστικό 12.000 BTU/h", keys: ["220227152", "220227153"] }]);
});

test("sameNameGroups: ίδιο όνομα ΚΑΙ ίδιο κλειδί δεν είναι ζεύγος — είναι η ίδια γραμμή", () => {
  assert.deepEqual(sameNameGroups([r("Ψυγείο Χ", "A1"), r("Ψυγείο Χ", "A1")]), []);
});

test("sameNameGroups: κενά, κεφαλαία και διπλά διαστήματα δεν κάνουν διαφορά", () => {
  const out = sameNameGroups([r("  Ψυγείο   Χ ", "A1"), r("ΨΥΓΕΊΟ Χ", "A2")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Ψυγείο Χ", "δείχνουμε το πρώτο όνομα όπως ήρθε, καθαρισμένο");
  assert.deepEqual(out[0].keys, ["A1", "A2"]);
});

test("sameNameGroups: γραμμή χωρίς όνομα αγνοείται", () => {
  assert.deepEqual(sameNameGroups([r("", "A1"), r("   ", "A2")]), []);
});

test("sameNameGroups: τα ζεύγη έρχονται από το μεγαλύτερο και κόβονται στο όριο", () => {
  const rows = [
    r("Α", "1"), r("Α", "2"), r("Α", "3"),
    r("Β", "4"), r("Β", "5"),
    r("Γ", "6"), r("Γ", "7"),
  ];
  const out = sameNameGroups(rows, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "Α");
  assert.equal(out[0].keys.length, 3);
});
