import { test } from "node:test";
import assert from "node:assert/strict";
import { readGuesses, catUser, type CatOption } from "./category-ai-core";

const options: CatOption[] = [{ id: "c-fridge", path: "Ψυγεία › Ψυγειοκαταψύκτες", groupS1Id: 11 }, { id: "c-ac", path: "Κλιματισμός › Κλιματιστικά τοίχου", groupS1Id: 22 }];
const asks = [{ key: "2", name: "Inventor PSD18155IN Ψυγειοκαταψύκτης" }, { key: "3", name: "NURA NRI-12WFI" }, { key: "4", name: "Κάτι άγνωστο" }];

test("readGuesses: μόνο ό,τι ρωτήθηκε και μόνο κατηγορίες της λίστας φτάνουν στον χρήστη", () => {
  const g = readGuesses({ items: [
    { key: "2", n: 1, sure: true },
    { key: "3", n: 2, sure: false },
    { key: "4", n: null, sure: false },      // «καμία δεν ταιριάζει» → καμία πρόταση
    { key: "3", n: 1, sure: true },          // δεύτερη απάντηση για το ίδιο προϊόν: αγνοείται
    { key: "99", n: 1, sure: true },         // προϊόν που δεν ρωτήθηκε
    { key: "2", n: 7, sure: true },          // αριθμός εκτός λίστας
  ] }, options, asks);
  assert.deepEqual(g, [
    { key: "2", categoryId: "c-fridge", path: "Ψυγεία › Ψυγειοκαταψύκτες", groupS1Id: 11, sure: true },
    { key: "3", categoryId: "c-ac", path: "Κλιματισμός › Κλιματιστικά τοίχου", groupS1Id: 22, sure: false },
  ]);
  assert.deepEqual(readGuesses("σκουπίδια", options, asks), []);
  assert.deepEqual(readGuesses({ items: "όχι λίστα" }, options, asks), []);
});

test("catUser: οι κατηγορίες αριθμούνται από το 1, όπως τις διαβάζει πίσω το readGuesses", () => {
  const u = catUser(options, [{ key: "2", name: "Ψυγείο", brand: "Inventor" }]);
  assert.deepEqual(u.categories, ["1. Ψυγεία › Ψυγειοκαταψύκτες", "2. Κλιματισμός › Κλιματιστικά τοίχου"]);
  assert.deepEqual(u.products, [{ key: "2", name: "Ψυγείο", brand: "Inventor" }]);
});
