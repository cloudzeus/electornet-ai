import { test } from "node:test";
import assert from "node:assert/strict";
import { diffItems, mergeEdits, type Diff } from "./diff-core";

const inc = (sku: string, payload: Record<string, string>, pos: number) => ({ sku, payload, pos });
const ex = (sku: string, payload: Record<string, string>) => ({ sku, payload });
const find = (rows: ReturnType<typeof diffItems>, sku: string) => rows.find((r) => r.sku === sku)!;

test("diffItems: νέο, ίδιο, αλλαγμένο, χαμένο", () => {
  const rows = diffItems(
    [inc("A1", { Name: "Θερμός" }, 1), inc("A2", { Name: "Κούπα" }, 2), inc("A3", { Name: "Πιάτο" }, 3)],
    [ex("A2", { Name: "Κούπα" }), ex("A3", { Name: "Πιάτο ΠΑΛΙΟ" }), ex("A9", { Name: "Έφυγε" })],
  );
  assert.equal(find(rows, "A1").diff, "new" satisfies Diff);
  assert.equal(find(rows, "A2").diff, "same");
  assert.equal(find(rows, "A3").diff, "changed");
  assert.equal(find(rows, "A9").diff, "gone");
  assert.equal(rows.length, 4);
});

test("diffItems: πεδίο που προστέθηκε ή αφαιρέθηκε είναι «changed»", () => {
  assert.equal(find(diffItems([inc("A1", { Name: "Θ", Χρώμα: "Μαύρο" }, 1)], [ex("A1", { Name: "Θ" })]), "A1").diff, "changed");
  assert.equal(find(diffItems([inc("A1", { Name: "Θ" }, 1)], [ex("A1", { Name: "Θ", Χρώμα: "Μαύρο" })]), "A1").diff, "changed");
});

test("diffItems: προϊόν ΧΩΡΙΣ sku δεν χάνεται — επιστρέφεται με problem και τη θέση του", () => {
  const rows = diffItems([inc("A1", { Name: "Θ" }, 1), inc("", { Name: "Αγνωστο" }, 2), inc("   ", { Name: "Κενό" }, 3)], []);
  assert.equal(rows.length, 3, "καμία σιωπηλή απώλεια");
  const bad = rows.filter((r) => r.problem);
  assert.equal(bad.length, 2);
  assert.ok(bad[0].problem!.includes("2"), `το problem πρέπει να λέει τη θέση — «${bad[0].problem}»`);
  assert.equal(bad[0].pos, 2);
});

test("diffItems: ίδιο sku δύο φορές — problem στο ΔΕΥΤΕΡΟ, το πρώτο περνά κανονικά", () => {
  const rows = diffItems([inc("A1", { Name: "Πρώτο" }, 1), inc("A1", { Name: "Δεύτερο" }, 7)], []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].problem, undefined);
  assert.equal(rows[0].diff, "new");
  assert.ok(rows[1].problem, "το δεύτερο σημαίνεται");
  assert.ok(rows[1].problem!.includes("1"), `να αναφέρει τη θέση του πρώτου — «${rows[1].problem}»`);
  assert.equal(rows[1].pos, 7);
});

test("diffItems: χωρίς τίποτα εισερχόμενο, όλα τα υπάρχοντα είναι «gone»", () => {
  const rows = diffItems([], [ex("A1", {}), ex("A2", {})]);
  assert.deepEqual(rows.map((r) => [r.sku, r.diff, r.pos]), [["A1", "gone", null], ["A2", "gone", null]]);
});

test("mergeEdits: χωρίς διορθώσεις το merged είναι το payload", () => {
  const p = { Name: "Θερμός", Χρώμα: "Μαύρο" };
  const r = mergeEdits(p, null);
  assert.deepEqual(r.merged, p);
  assert.deepEqual(r.conflicts, []);
});

test("mergeEdits: πεδίο μόνο στις διορθώσεις προστίθεται", () => {
  const r = mergeEdits({ Name: "Θερμός" }, { Εγγύηση: "24" });
  assert.deepEqual(r.merged, { Name: "Θερμός", Εγγύηση: "24" });
  assert.deepEqual(r.conflicts, []);
});

test("mergeEdits: σε σύγκρουση ΚΕΡΔΙΖΕΙ η διόρθωση και επιστρέφεται conflict", () => {
  const r = mergeEdits({ Name: "ΘΕΡΜΟΣ ΑΠΟ FEED", Χρώμα: "Μαύρο" }, { Name: "Θερμός καφέ 350ml" });
  assert.equal(r.merged.Name, "Θερμός καφέ 350ml", "η δική μου τιμή δεν ανατρέπεται σιωπηλά");
  assert.equal(r.merged.Χρώμα, "Μαύρο");
  assert.deepEqual(r.conflicts, [{ key: "Name", mine: "Θερμός καφέ 350ml", feed: "ΘΕΡΜΟΣ ΑΠΟ FEED" }]);
});

test("mergeEdits: ίδια τιμή στα δύο δεν είναι σύγκρουση", () => {
  const r = mergeEdits({ Name: "Θερμός" }, { Name: "Θερμός" });
  assert.equal(r.merged.Name, "Θερμός");
  assert.deepEqual(r.conflicts, []);
});
