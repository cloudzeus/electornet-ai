import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultHomeDoc, HOME_SECTIONS, normalizeHomeDoc, sectionActive, sectionWidget, hideClass } from "./home-sections";

test("προεπιλογή = η σημερινή αρχική, με τη σειρά του σχεδίου", () => {
  const d = defaultHomeDoc();
  assert.deepEqual(d.sections.map((s) => s.id), HOME_SECTIONS.map((s) => s.id));
  assert.equal(d.blocks.length, 0);
});

test("καθαρό έγγραφο: διπλές/άγνωστες ενότητες φεύγουν, όσες λείπουν μπαίνουν στο τέλος, components σε υπαρκτή ζώνη", () => {
  const d = normalizeHomeDoc({ sections: [{ id: "news" }, { id: "hero" }, { id: "news" }, { id: "x" }], blocks: [{ id: "b1", type: "banner", zone: "after:news" }, { id: "b2", type: "text", zone: "after:nope" }, null] });
  assert.deepEqual(d.sections.slice(0, 2).map((s) => s.id), ["news", "hero"]);
  assert.equal(d.sections.length, HOME_SECTIONS.length);
  assert.deepEqual(d.blocks.map((b) => b.zone), ["after:news", "top"]);
});

test("ορατότητα: απόκρυψη, ημερομηνίες, κοινό· widget με τις αλλαγές του διαχειριστή", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.equal(sectionActive({ id: "ticker", enabled: false }, now, "guest"), false);
  assert.equal(sectionActive({ id: "ticker", schedule: { from: "2026-11-01T00:00:00Z" } }, now, "guest"), false);
  assert.equal(sectionActive({ id: "ticker", schedule: { to: "2026-10-01T00:00:00Z" } }, now, "guest"), false);
  assert.equal(sectionActive({ id: "ticker", audience: "customer" }, now, "guest"), false);
  assert.equal(sectionActive({ id: "ticker", audience: "customer" }, now, "customer"), true);
  const t = sectionWidget({ id: "ticker", props: { items: [" Α ", "", "Β"] } })!;
  assert.deepEqual(t.props.items, ["Α", "Β"]);
  assert.deepEqual(sectionWidget({ id: "ticker", props: { items: [{ text: "Α" }, { text: "Β", off: true }, "Γ"] } })!.props.items, ["Α", "Γ"]);
  assert.equal(sectionWidget({ id: "hero", props: { intervalMs: 8 } })!.props.intervalMs, 8000);
  assert.equal(sectionWidget({ id: "deals", props: { limit: 8, source: "promotion" } })!.props.limit, 8);
  assert.equal(sectionWidget({ id: "deals" })!.props.source, "auto");
  assert.equal(sectionWidget({ id: "ad-strip" }), null);
  assert.equal(hideClass(["mobile", "desktop"]), "max-md:hidden lg:hidden");
});
