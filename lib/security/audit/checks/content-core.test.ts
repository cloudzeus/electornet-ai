import { test } from "node:test";
import assert from "node:assert/strict";
import { stringsOf, scanRecord, contentOutcome, SOURCES, type SourceTally } from "./content-core";

const since = new Date("2026-10-19T06:00:00Z");

test("stringsOf: όλες οι συμβολοσειρές ενός JSON με τη διαδρομή τους (όχι αριθμοί / κλειδιά)", () => {
  const out = stringsOf({ slides: [{ title: "Γεια", n: 3, tags: ["α", ""] }], on: true, note: null });
  assert.deepEqual(out, [{ path: "slides[0].title", text: "Γεια" }, { path: "slides[0].tags[0]", text: "α" }]);
  assert.deepEqual(stringsOf("απλό"), [{ path: "", text: "απλό" }]);
});

test("scanRecord: καθαρό περιεχόμενο → κανένα εύρημα· επιτρεπτό iframe (YouTube) → κανένα", () => {
  assert.deepEqual(scanRecord("product", { id: "p1", label: "Πλυντήριο", fields: { description: "Πλυντήριο 9 kg με ατμό.", summary: null } }), []);
  assert.deepEqual(scanRecord("cms", { id: "c1", label: "copy/default", fields: { data: { video: '<iframe src="https://www.youtube.com/embed/abc"></iframe>' } } }), []);
});

test("scanRecord: <script> σε CMS → critical με πηγή, εγγραφή και πεδίο στο τεκμήριο", () => {
  const out = scanRecord("cms", { id: "c1", label: "hero.slides/default", fields: { data: { slides: [{ title: 'Προσφορά<script src="https://evil.example/x.js"></script>' }] } } });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.match(out[0].evidence!, /^cms#c1 data\.slides\[0\]\.title: /);
  assert.match(out[0].detail, /hero\.slides\/default/);
});

test("scanRecord: ίδιο κείμενο σε data και published → ένα εύρημα", () => {
  const bad = { t: "<img src=x onerror=alert(1)>" };
  const out = scanRecord("cms", { id: "c1", label: "copy", fields: { data: bad, published: bad } });
  assert.equal(out.length, 1);
});

test("scanRecord: iframe από άγνωστο host σε περιγραφή ERP (δεν αποδίδεται ως HTML) → warn· σε CMS → critical", () => {
  const html = '<p>Δείτε</p><iframe src="https://media.groupeseb.example/player/123"></iframe>';
  const erp = scanRecord("s1item", { id: "123", label: "ABC-1", fields: { longDesc: html } });
  assert.deepEqual(erp.map((f) => f.severity), ["warn"]);
  assert.match(erp[0].detail, /δεν αποδίδεται ως HTML/);
  const cms = scanRecord("cms", { id: "c1", label: "copy", fields: { data: { x: html } } });
  assert.deepEqual(cms.map((f) => f.severity), ["critical"]);
  assert.equal(SOURCES.s1item.html, false);
});

test("scanRecord: <script> / on…= σε περιγραφή ERP παραμένουν critical (ένδειξη ένεσης στην πηγή)", () => {
  const out = scanRecord("s1item", { id: "9", label: "X", fields: { longDesc: "<script>alert(1)</script>" } });
  assert.equal(out[0].severity, "critical");
});

test("scanRecord: λέξεις spam → warn", () => {
  const out = scanRecord("product", { id: "p1", label: "X", fields: { description: "Best online casino bonus" } });
  assert.deepEqual(out.map((f) => f.severity), ["warn"]);
});

const tally = (over: Partial<SourceTally> = {}): SourceTally => ({ key: "product", scanned: 10, total: 10, ...over });

test("contentOutcome: πλήρης σάρωση χωρίς ευρήματα → ok με τι εξετάστηκε", () => {
  const r = contentOutcome({ mode: "full", since, tallies: [tally(), tally({ key: "cms", scanned: 3, total: 3 })], findings: [], complete: true });
  assert.equal(r.status, "ok");
  assert.match(r.summary, /13 εγγραφές/);
  assert.match(r.summary, /Προϊόντα.*10/);
  assert.match(r.summary, /όλες οι εγγραφές/);
});

test("contentOutcome: μερική σάρωση → ΠΟΤΕ ok: warn «δεν ολοκληρώθηκε — σαρώθηκαν X/Y»", () => {
  const r = contentOutcome({ mode: "full", since, tallies: [tally(), tally({ key: "s1item", scanned: 2000, total: 40000 })], findings: [], complete: false });
  assert.equal(r.status, "warn");
  assert.match(r.summary, /δεν ολοκληρώθηκε — σαρώθηκαν 2\.?010\/40\.?010/);
  assert.ok(r.findings.some((f) => f.severity === "warn" && /δεν ολοκληρώθηκε/.test(f.title)));
});

test("contentOutcome: light → μόνο όσα άλλαξαν από την αρχή του παραθύρου· ευρήματα καθορίζουν την κατάσταση", () => {
  const r = contentOutcome({ mode: "light", since, tallies: [tally({ scanned: 0, total: 0 })], findings: [{ severity: "critical", title: "x", detail: "y" }], complete: true });
  assert.equal(r.status, "critical");
  assert.match(r.summary, /άλλαξαν από/);
});
