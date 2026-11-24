import { test } from "node:test";
import assert from "node:assert/strict";
import { phon, prefixDistance, buildVocab, expandWord, wordLevel, bestMatches } from "./search-fold";

const vocab = buildVocab([
  "WST KRI44 Πλυντήριο Ρούχων", "MG-100 Πλυντήριο Ρούχων 10kg Ατμού", "ΠΛΥΝΤΗΡΙΟ ΠΙΑΤΩΝ 60cm", "Πλυντήρια Στεγνωτήρια",
  "B5RCNA405HXB Ψυγειοκαταψύκτης", "Ψυγείο Δίπορτο", "Κλιματιστικό Inverter 12000 BTU", "Samsung QE55 OLED Τηλεόραση", "Air Fryer 5L", "Εργαλείο", "Μπλέντερ",
]);

test("φωνητικό κλειδί: ελληνικά, greeklish και ομόηχα λάθη συμπίπτουν", () => {
  for (const w of ["πλυντηριο", "πληντυριο", "πλιντιριο", "plyntirio", "plintirio", "ΠΛΥΝΤΗΡΙΟ"]) assert.equal(phon(w), phon("πλυντήριο"), w);
  assert.equal(phon("psygeio"), phon("ψυγείο"));
  assert.equal(phon("klimatistiko"), phon("κλιματιστικό"));
  assert.equal(phon("blender"), phon("μπλέντερ"));
  assert.equal(phon("σαμσουνγκ"), phon("Samsung"));
  assert.equal(phon("aftomato"), phon("αυτόματο"));
  assert.equal(phon("automato"), phon("αυτόματο"));
});

test("απόσταση από πρόθεμα: λάθος γράμμα, γράμμα που λείπει, αντιμετάθεση", () => {
  assert.equal(prefixDistance("samsng", "samsung"), 1);
  assert.equal(prefixDistance("smasung", "samsung"), 1);
  assert.equal(prefixDistance("plid", "plidirio"), 0);
});

test("η λέξη του πελάτη γίνεται οι λέξεις του καταλόγου", () => {
  const has = (q: string, form: string) => assert.ok(expandWord(q, vocab).includes(form), `${q} → ${form} (πήρα ${expandWord(q, vocab).join(", ")})`);
  for (const q of ["πλυντηριο", "πληντυριο", "plyntirio", "plintirio", "πλυντριο", "pluntirio", "πλυντηρ"]) { has(q, "Πλυντήριο"); has(q, "ΠΛΥΝΤΗΡΙΟ"); }
  has("psygeio", "Ψυγείο"); has("ψυγιο", "Ψυγειοκαταψύκτης");
  has("klimatistiko", "Κλιματιστικό"); has("κλιματηστικο", "Κλιματιστικό");
  has("samsng", "Samsung"); has("tileorasi", "Τηλεόραση"); has("τηλεοραση", "Τηλεόραση");
});

test("δεν φέρνει άσχετα: ίδια γραφή πριν από ίδιο ήχο, ψηφία και μικρές λέξεις ανέγγιχτα", () => {
  assert.deepEqual(expandWord("air", vocab), ["Air"]); // όχι «Εργαλείο» (air → «ερ»)
  assert.deepEqual(expandWord("12000", vocab), []);
  assert.deepEqual(expandWord("qe55", vocab), []);
  assert.deepEqual(expandWord("tv", vocab), []);
  assert.deepEqual(expandWord("καναπες", vocab), []);
});

test("ονόματα κατηγοριών και μαρκών με την ίδια ανοχή, μόνο το καλύτερο σκαλί", () => {
  assert.equal(wordLevel("πλυντηρια", "Πλυντήρια ρούχων"), 0);
  assert.equal(wordLevel("plyntiria", "Πλυντήρια ρούχων"), 1);
  assert.equal(wordLevel("ψυγει", "Ψυγειοκαταψύκτες"), 0);
  assert.equal(wordLevel("samsng", "Samsung"), 2);
  assert.equal(wordLevel("plyntiria", "Ψυγεία"), 9);
  assert.equal(wordLevel("air", "Εργαλεία"), 9);
  const cats = ["Ηχεία", "Υγεία - Ευεξία", "Ηλιακοί Θερμοσίφωνες", "Πλυντήρια Ρούχων", "Πλυντήρια Πιάτων"];
  assert.deepEqual(bestMatches(["ixeia"], cats, (c) => c), ["Ηχεία"]);
  assert.deepEqual(bestMatches(["plyntiria", "piaton"], cats, (c) => c), ["Πλυντήρια Πιάτων"]);
  assert.deepEqual(bestMatches(["kanapes"], cats, (c) => c), []);
});
