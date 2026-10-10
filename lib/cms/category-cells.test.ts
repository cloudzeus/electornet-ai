import { test } from "node:test";
import assert from "node:assert/strict";
import { cellsOf, DEFAULT_CELLS, gridCategories, gridTitle, type CatInfo } from "./category-cells";

const CATS: Record<string, CatInfo> = {
  "eikona-kai-ichos": { id: "c1", slug: "eikona-kai-ichos", name: "Εικόνα και Ήχος", count: 1237, path: "eikona-kai-ichos" },
  psygeia: { id: "c2", slug: "psygeia", name: "Ψυγεία", count: 932, path: "leykes-syskeyes/psygeia" },
  empty: { id: "c3", slug: "empty", name: "Άδεια", count: 0, path: "x/empty" },
};
const find = (r: string) => CATS[r] ?? Object.values(CATS).find((c) => c.id === r);

test("προεπιλογή: τα εννέα κελιά του σχεδίου· οι παλιοί κωδικοί του focus αντιστοιχίζονται", () => {
  assert.equal(cellsOf(undefined).cells.length, 9);
  assert.deepEqual(cellsOf(undefined).cells, DEFAULT_CELLS);
  assert.equal(cellsOf({ featured: "fridge" }).focus, "psygeia");
  assert.equal(cellsOf({ focus: "" }).focus, "");
  assert.equal(cellsOf({ cells: [{ ref: "a" }, { ref: "a" }, { ref: "" }], focus: "a" }).cells.length, 1);
});

test("κελιά → πλέγμα: σειρά, κρυφά, άδειες κατηγορίες, αρίθμηση, πραγματικό πλήθος, focus", () => {
  const g = gridCategories([{ ref: "psygeia", title: "Ψυγεία & Καταψύκτες", meta: "A έως G" }, { ref: "empty" }, { ref: "eikona-kai-ichos", hidden: true }, { ref: "c1" }, { ref: "missing" }], "c1", find);
  assert.deepEqual(g.map((c) => [c.no, c.title, c.count, c.slug, !!c.featured]), [["01", "Ψυγεία & Καταψύκτες", 932, "leykes-syskeyes/psygeia", false], ["02", "Εικόνα και Ήχος", 1237, "eikona-kai-ichos", true]]);
  assert.deepEqual(g[0].titleBreak, ["Ψυγεία", "& Καταψύκτες"]);
});

test("τίτλος ενότητας με τον αριθμό των κελιών", () => {
  assert.deepEqual(gridTitle("", 9), ["Ό,τι χρειάζεται το σπίτι σου,", "σε εννέα κατηγορίες."]);
  assert.deepEqual(gridTitle(undefined, 1), ["Ό,τι χρειάζεται το σπίτι σου,", "σε μία κατηγορία."]);
  assert.equal(gridTitle("Οι κατηγορίες μας", 5), "Οι κατηγορίες μας");
});
