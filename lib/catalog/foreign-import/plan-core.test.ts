import { test } from "node:test";
import assert from "node:assert/strict";
import { rowStatus, newDuplicates, rekeySpecs, ruleLabel, planPrice, mostCommon, matchChanged, sameItemRows, chunks } from "./plan-core";
import type { ForeignRow } from "./core";

const row = (rowNo: number, f: ForeignRow["fields"] = {}): ForeignRow => ({ rowNo, fields: f, specs: {}, media: { image: [], banner: [], video: [] }, brandId: null, categoryId: null, cost: null, rrp: null });

test("rowStatus: problem > new > waiting > update > unchanged", () => {
  const base = { problem: false, mtrl: 5 as number | null, changes: 0, price: false, photos: 0, writeOn: true };
  assert.equal(rowStatus({ ...base, problem: true, mtrl: null }), "problem");
  assert.equal(rowStatus({ ...base, problem: true, changes: 3 }), "problem");
  assert.equal(rowStatus({ ...base, mtrl: null, changes: 2, writeOn: false }), "new");
  assert.equal(rowStatus({ ...base, changes: 1, writeOn: false }), "waiting");
  assert.equal(rowStatus({ ...base, price: true, writeOn: false }), "waiting");
  assert.equal(rowStatus({ ...base, changes: 1, photos: 2, writeOn: false }), "waiting");
  assert.equal(rowStatus({ ...base, changes: 1 }), "update");
  assert.equal(rowStatus({ ...base, price: true }), "update");
  assert.equal(rowStatus({ ...base, photos: 1 }), "update");
  assert.equal(rowStatus({ ...base, photos: 1, writeOn: false }), "update"); // φωτογραφίες μόνες τρέχουν και με το SoftOne σε αναμονή
  assert.equal(rowStatus(base), "unchanged");
  assert.equal(rowStatus({ ...base, writeOn: false }), "unchanged");
});

test("newDuplicates: ίδιο EAN ή ίδιος κωδικός/κωδικός κατασκευαστή σε 2+ νέες γραμμές → πρόβλημα σε όλες", () => {
  const rows = [
    row(2, { barcode: "5901234123457" }),
    row(3, { barcode: "5.901234123457E+12" }), // ίδιο EAN σε επιστημονική μορφή
    row(4, { code: "ABC-1" }),
    row(5, { factoryCode: " abc-1 " }),
    row(6, { code: "X", factoryCode: "X" }), // ίδιος κωδικός στην ίδια γραμμή δεν είναι διπλό
    row(7, { barcode: "5901234123457" }), // υπάρχον είδος — δεν μετρά
    row(8, { code: "solo" }),
  ];
  const mtrl = new Map<number, number | null>([[2, null], [3, null], [4, null], [5, null], [6, null], [7, 99], [8, null]]);
  const d = newDuplicates(rows, mtrl);
  assert.deepEqual([...d.keys()].sort(), [2, 3, 4, 5]);
  assert.match(d.get(2)!, /EAN 5901234123457.*2, 3/);
  assert.match(d.get(5)!, /κωδικός.*abc-1.*4, 5/i);
  assert.equal(d.has(6), false);
  assert.equal(d.has(7), false);
});

test("rekeySpecs: ετικέτες χρήστη → ονόματα της ομάδας (χωρίς πεζά/τόνους/ς/«*»)· άγνωστες αγνοούνται με προειδοποίηση", () => {
  const r = rekeySpecs({ "ΧΡΩΜΑ": "Λευκό", "Ενεργειακή κλάση": "A", "Θόρυβος ": "40", "Άγνωστο": "x", "Κενό": "  " }, ["Χρώμα", "Ενεργειακή Κλάση*", "Θόρυβος"]);
  assert.deepEqual(r.specs, { "Χρώμα": "Λευκό", "Ενεργειακή Κλάση*": "A", "Θόρυβος": "40" });
  assert.deepEqual(r.warnings, ["Το χαρακτηριστικό «Άγνωστο» δεν υπάρχει στην ομάδα — αγνοείται."]);
  // χωρίς ομάδα: τίποτα δεν αλλάζει (η ομάδα θα οριστεί στην έγκριση)
  assert.deepEqual(rekeySpecs({ a: "1", b: " " }, null), { specs: { a: "1" }, warnings: [] });
});

test("ruleLabel: σύντομη περιγραφή κανόνα", () => {
  assert.equal(ruleLabel({ percent: 30, brandId: null, categoryId: null }, {}), "Γενικός 30%");
  assert.equal(ruleLabel({ percent: 25, brandId: "b", categoryId: null }, { brand: "LG" }), "Μάρκα LG 25%");
  assert.equal(ruleLabel({ percent: 27.5, brandId: null, categoryId: "c" }, { category: "Ψυγεία" }), "Κατηγορία Ψυγεία 27,5%");
  assert.equal(ruleLabel({ percent: 20, brandId: "b", categoryId: "c" }, { brand: "LG", category: "Ψυγεία" }), "LG · Ψυγεία 20%");
  assert.equal(ruleLabel({ percent: 20, brandId: "b", categoryId: null }, {}), "Μάρκα — 20%");
});

test("planPrice: κόστος × markup με ΦΠΑ, πλαφόν ΤΛΤ, προειδοποιήσεις", () => {
  const rule = { percent: 30, rounding: "none" as const };
  assert.deepEqual(planPrice({ cost: "100,00", rrp: null, rule, label: "Γενικός 30%", vat: 24 }), { price: { cost: 100, price: 161.2, rule: "Γενικός 30%", capped: false, margin: 30 } });
  const capped = planPrice({ cost: "100", rrp: "150", rule, label: "Γενικός 30%", vat: 24 });
  assert.equal(capped.price?.price, 150);
  assert.equal(capped.price?.capped, true);
  assert.deepEqual(planPrice({ cost: "100", rrp: null, rule: null, label: "", vat: 24 }), { warning: "Δεν υπάρχει κανόνας τιμολόγησης." });
  assert.deepEqual(planPrice({ cost: null, rrp: null, rule, label: "x", vat: 24 }), {});
  assert.deepEqual(planPrice({ cost: "κατόπιν", rrp: null, rule, label: "x", vat: 24 }), { warning: "Το κόστος «κατόπιν» δεν είναι ποσό." });
});

test("mostCommon: η συχνότερη τιμή (χωρίς null)· ισοπαλία → η πρώτη που εμφανίστηκε", () => {
  assert.equal(mostCommon([3, null, 5, 5, 3, 5]), 5);
  assert.equal(mostCommon([7, 3, 3, 7]), 7);
  assert.equal(mostCommon([null, null]), null);
  assert.equal(mostCommon([]), null);
});

test("matchChanged: άλλο MTRL ή αλλαγή νέο↔υπάρχον από τον έλεγχο → true", () => {
  assert.equal(matchChanged({ mtrl: 5 }, { mtrl: 5 }), false);
  assert.equal(matchChanged({}, {}), false); // νέο και νέο
  assert.equal(matchChanged({ mtrl: 5 }, { mtrl: 6 }), true);
  assert.equal(matchChanged({}, { mtrl: 6 }), true); // ήταν νέο, τώρα βρέθηκε είδος
  assert.equal(matchChanged({ mtrl: 5 }, {}), true); // ήταν υπάρχον, τώρα νέο
  assert.equal(matchChanged(undefined, {}), true); // η γραμμή δεν υπήρχε στο σχέδιο
});

test("sameItemRows: ίδιο MTRL σε 2+ γραμμές (από όλο το αρχείο) → μήνυμα σε κάθε μία", () => {
  const d = sameItemRows(new Map<number, number | null>([[2, 7], [3, null], [9, 7], [4, 8]]));
  assert.deepEqual([...d.keys()].sort(), [2, 9]);
  assert.equal(d.get(2), "Το ίδιο είδος (MTRL 7) βρέθηκε σε περισσότερες γραμμές: 2, 9");
});

test("chunks: χωρίζει σε κομμάτια το πολύ n", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 3), []);
});
