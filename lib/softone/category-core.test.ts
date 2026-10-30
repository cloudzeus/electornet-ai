import { test } from "node:test";
import assert from "node:assert/strict";
import { applyL2, l2Key, moveAllowed, nextCode, parseKey, verifyList } from "./category-core";

const LIST = [
  { COMPANY: "1", CCCWEBCATEGORY1: "10|Εικόνα και Ήχος", CCCWEBCATEGORY2: "10", NAME: "Τηλεοράσεις", ISACTIVE: "1", UPDDATE: "2026-06-02 00:00:00" },
  { COMPANY: "1", CCCWEBCATEGORY1: "10|Εικόνα και Ήχος", CCCWEBCATEGORY2: "20", NAME: "Home Cinema", ISACTIVE: "1", UPDDATE: "2026-06-02 00:00:00" },
  { COMPANY: "1", CCCWEBCATEGORY1: "70|Λευκές", CCCWEBCATEGORY2: "10", NAME: "Ψυγεία", ISACTIVE: "1", UPDDATE: "2026-06-02 00:00:00" },
];

test("κλειδιά κόμβων", () => {
  assert.deepEqual(parseKey("2:10:20"), { level: 2, c1: 10, c2: 20 });
  assert.deepEqual(parseKey("g:805"), { level: 3, g: 805 });
  assert.equal(parseKey("2:10"), null);
  assert.equal(parseKey("x"), null);
});

test("νέος κωδικός: κρατά τον ίδιο αν είναι ελεύθερος, αλλιώς επόμενο πολλαπλάσιο του 10", () => {
  assert.equal(nextCode([10, 20]), 30);
  assert.equal(nextCode([10, 25]), 30);
  assert.equal(nextCode([]), 10);
  assert.equal(nextCode([10, 20], 40), 40);
  assert.equal(nextCode([10, 20], 20), 30);
});

test("προσθήκη στο επίπεδο 2: στέλνει ΟΛΗ τη λίστα, καθαρή από «κωδ|όνομα» και UPDDATE", () => {
  const { rows, target } = applyL2(LIST, { kind: "add", c1: 10, name: " Projectors " });
  assert.equal(rows.length, 4);
  assert.deepEqual(target, { COMPANY: "1", CCCWEBCATEGORY1: "10", CCCWEBCATEGORY2: "30", NAME: "Projectors", ISACTIVE: "1" });
  assert.ok(rows.every((r) => !("UPDDATE" in r) && !r.CCCWEBCATEGORY1.includes("|")));
});

test("μετακίνηση στο επίπεδο 2: νέα γραμμή στον νέο γονέα, η παλιά μένει όπως ήταν", () => {
  const { rows, target } = applyL2(LIST, { kind: "copy", from: { c1: 10, c2: 20 }, toC1: 70 });
  assert.equal(rows.length, 4);
  assert.equal(target.CCCWEBCATEGORY1, "70");
  assert.equal(target.CCCWEBCATEGORY2, "20"); // ελεύθερος στο 70
  const { target: t2 } = applyL2(LIST, { kind: "copy", from: { c1: 10, c2: 10 }, toC1: 70 });
  assert.equal(t2.CCCWEBCATEGORY2, "20"); // το 10 είναι πιασμένο στο 70
  assert.equal(rows.find((r) => l2Key(r) === "10:20")!.ISACTIVE, "1");
});

test("μετονομασία: όρια και κενό όνομα", () => {
  assert.throws(() => applyL2(LIST, { kind: "set", c1: 10, c2: 10, patch: { name: "  " } }), /κενό/);
  assert.throws(() => applyL2(LIST, { kind: "set", c1: 10, c2: 10, patch: { name: "x".repeat(65) } }), /64/);
  assert.throws(() => applyL2(LIST, { kind: "set", c1: 99, c2: 10, patch: { name: "a" } }), /δεν βρέθηκε/);
  assert.equal(applyL2(LIST, { kind: "set", c1: 10, c2: 10, patch: { active: false } }).target.ISACTIVE, "0");
});

test("επαλήθευση: εντοπίζει χαμένη γραμμή και λάθος τιμή", () => {
  const { rows, target } = applyL2(LIST, { kind: "add", c1: 10, name: "Projectors" });
  assert.deepEqual(verifyList(rows, target, [...LIST, { ...target, UPDDATE: "x" }], l2Key), []);
  assert.match(verifyList(rows, target, [LIST[0], LIST[1], target], l2Key).join(), /1 άλλες γραμμές/);
  assert.match(verifyList(rows, target, [...LIST, { ...target, NAME: "Άλλο" }], l2Key).join(), /NAME/);
  assert.match(verifyList(rows, target, LIST, l2Key).join(), /δεν βρέθηκε/);
});

test("επιτρεπτές μετακινήσεις", () => {
  assert.equal(moveAllowed({ level: 2, c1: 10, c2: 20 }, { level: 1, c1: 70 }), null);
  assert.match(moveAllowed({ level: 2, c1: 10, c2: 20 }, { level: 1, c1: 10 })!, /ήδη/);
  assert.match(moveAllowed({ level: 2, c1: 10, c2: 20 }, { level: 3, g: 1 })!, /κεντρική/);
  assert.equal(moveAllowed({ level: 3, g: 805 }, { level: 2, c1: 70, c2: 10 }), null);
  assert.ok(moveAllowed({ level: 1, c1: 10 }, { level: 1, c1: 70 }));
});
