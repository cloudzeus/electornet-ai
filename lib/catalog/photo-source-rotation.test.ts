import { test } from "node:test";
import assert from "node:assert/strict";
import { photoSearchPlan } from "./enrich-core";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const day = 86_400_000;

test("αναζήτηση φωτογραφιών: Κωτσόβολος πρώτος, όλες οι πηγές με τη σειρά", () => {
  const plan = photoSearchPlan(new Map(), () => null, false, NOW);
  assert.deepEqual(plan.map((x) => x.source), ["kotsovolos", "icecat", "web", "channel3", "shop"]);
  assert.ok(plan.every((x) => x.skip === null));
});

test("αναζήτηση φωτογραφιών: δεν επαναλαμβάνει πηγή που ελέγχθηκε τις τελευταίες 7 ημέρες, εκτός με force", () => {
  const checked = new Map([["kotsovolos", new Date(NOW - 2 * day)], ["icecat", new Date(NOW - 30 * day)]]);
  const plan = photoSearchPlan(checked, () => null, false, NOW);
  assert.match(plan[0].skip ?? "", /ελέγχθηκε/);
  assert.equal(plan[1].skip, null);
  assert.ok(photoSearchPlan(checked, () => null, true, NOW).every((x) => x.skip === null));
});

test("αναζήτηση φωτογραφιών: μη διαθέσιμη πηγή (Channel3 χωρίς κλειδί) παραλείπεται με λόγο, ακόμη και με force", () => {
  const plan = photoSearchPlan(new Map(), (s) => (s === "channel3" ? "χωρίς κλειδί" : null), true, NOW);
  assert.equal(plan.find((x) => x.source === "channel3")?.skip, "χωρίς κλειδί");
});
