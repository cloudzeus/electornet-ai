import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyValues, unmapped, type ValueUse } from "./values-core";

const uses: ValueUse[] = [
  { value: "Σαλόνι › Καναπέδες", items: 40 },
  { value: "Κουζίνα › Πιατικά", items: 120 },
  { value: "Κήπος › Ομπρέλες", items: 7 },
  { value: "Φωτισμός › Λάμπες", items: 3 },
];

test("classifyValues: τιμή με αντιστοίχιση, τιμή που ο χρήστης άφησε κενή, και τιμή που δεν έχει δει ποτέ", () => {
  const rows = classifyValues(uses, { "Κουζίνα › Πιατικά": "cat-1", "Κήπος › Ομπρέλες": null });
  const by = new Map(rows.map((r) => [r.value, r]));
  assert.equal(by.get("Κουζίνα › Πιατικά")!.state, "mapped");
  assert.equal(by.get("Κουζίνα › Πιατικά")!.targetId, "cat-1");
  // Κενή αντιστοίχιση = ρητή απόφαση «αγνόησέ την», όχι κάτι καινούργιο: δεν ξαναενοχλεί τον χρήστη.
  assert.equal(by.get("Κήπος › Ομπρέλες")!.state, "ignored");
  assert.equal(by.get("Σαλόνι › Καναπέδες")!.state, "new");
  assert.equal(by.get("Φωτισμός › Λάμπες")!.state, "new");
});

test("classifyValues: οι καινούργιες μπροστά (πολλά προϊόντα πρώτα), μετά οι αγνοημένες, τελευταίες οι αντιστοιχισμένες", () => {
  const rows = classifyValues(uses, { "Κουζίνα › Πιατικά": "cat-1", "Κήπος › Ομπρέλες": null });
  assert.deepEqual(rows.map((r) => r.value), ["Σαλόνι › Καναπέδες", "Φωτισμός › Λάμπες", "Κήπος › Ομπρέλες", "Κουζίνα › Πιατικά"]);
});

test("classifyValues: κενές τιμές δεν είναι τιμές", () => {
  assert.deepEqual(classifyValues([{ value: "", items: 5 }, { value: "   ", items: 2 }], {}), []);
});

test("classifyValues: η τιμή συγκρίνεται χωρίς κενά στις άκρες — όπως τη διαβάζει η μηχανή εισαγωγής", () => {
  const rows = classifyValues([{ value: "  Κουζίνα  ", items: 3 }], { "Κουζίνα": "cat-1" });
  assert.equal(rows[0].value, "Κουζίνα");
  assert.equal(rows[0].state, "mapped");
});

test("classifyValues: ίδια τιμή σε δύο γραμμές μετριέται μία φορά, με το άθροισμα", () => {
  const rows = classifyValues([{ value: "Κουζίνα", items: 3 }, { value: "Κουζίνα ", items: 4 }], {});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items, 7);
});

test("classifyValues: τιμή σαν «constructor» δεν περνά για αντιστοιχισμένη", () => {
  assert.equal(classifyValues([{ value: "constructor", items: 1 }], {})[0].state, "new");
});

test("unmapped: πόσες καινούργιες τιμές και πόσα προϊόντα περιμένουν απόφαση", () => {
  const rows = classifyValues(uses, { "Κουζίνα › Πιατικά": "cat-1", "Κήπος › Ομπρέλες": null });
  assert.deepEqual(unmapped(rows), { values: 2, items: 43 });
  assert.deepEqual(unmapped(classifyValues(uses, Object.fromEntries(uses.map((u) => [u.value, "x"])))), { values: 0, items: 0 });
});
