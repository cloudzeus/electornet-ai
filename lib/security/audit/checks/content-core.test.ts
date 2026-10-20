import { test } from "node:test";
import assert from "node:assert/strict";
import { stringsOf, scanRecord, contentOutcome, SOURCES, CONTENT_BUDGET_MS, type SourceTally } from "./content-core";

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
  assert.equal(r.complete, true);
});

test("contentOutcome: μερική σάρωση → ΠΟΤΕ ok: warn «δεν ολοκληρώθηκε — σαρώθηκαν X/Y»", () => {
  const r = contentOutcome({ mode: "full", since, tallies: [tally(), tally({ key: "s1item", scanned: 2000, total: 40000 })], findings: [], complete: false });
  assert.equal(r.status, "warn");
  assert.match(r.summary, /δεν ολοκληρώθηκε — σαρώθηκαν 2\.?010\/40\.?010/);
  assert.ok(r.findings.some((f) => f.severity === "warn" && /δεν ολοκληρώθηκε/.test(f.title)));
  assert.equal(r.complete, false);
});

test("contentOutcome: light → μόνο όσα άλλαξαν από την αρχή του παραθύρου· ευρήματα καθορίζουν την κατάσταση", () => {
  const r = contentOutcome({ mode: "light", since, tallies: [tally({ scanned: 0, total: 0 })], findings: [{ severity: "critical", title: "x", detail: "y" }], complete: true });
  assert.equal(r.status, "critical");
  assert.match(r.summary, /άλλαξαν από/);
});

test("I-4: υπηρεσίες, όροι προσφορών, διαφημιστικές θέσεις είναι πηγές που αποδίδονται", () => {
  for (const k of ["service", "promotion", "ad"] as const) assert.equal(SOURCES[k].html, true, k);
  const out = scanRecord("service", { id: "sv1", label: "egkatastasi", fields: { faq: [{ q: "Πώς;", a: '<a href="#" onclick="x()">εδώ</a>' }] } });
  assert.equal(out[0].severity, "critical");
  assert.match(out[0].evidence!, /^service#sv1 faq\[0\]\.a: /);
});

test("σύνδεσμοι (href/url/link) με javascript:/vbscript:/data: → critical· κανονικοί και σχετικοί → τίποτα", () => {
  const bad = scanRecord("ad", { id: "a1", label: "home-top", fields: { title: "Προσφορά", href: " JavaScript:alert(1)" } });
  assert.deepEqual(bad.map((f) => f.severity), ["critical"]);
  assert.match(bad[0].title, /σύνδεσμ/i);
  assert.equal(scanRecord("cms", { id: "c1", label: "hero", fields: { data: { slides: [{ ctaHref: "data:text/html;base64,PHNjcmlwdD4=" }] } } }).length, 1);
  assert.deepEqual(scanRecord("ad", { id: "a2", label: "x", fields: { href: "https://www.lg.com/gr/promo" } }), []);
  assert.deepEqual(scanRecord("ad", { id: "a3", label: "x", fields: { href: "/k/tileoraseis?x=javascript:1" } }), []);
  assert.deepEqual(scanRecord("product", { id: "p", label: "x", fields: { description: "javascript: οδηγός για προγραμματιστές" } }), [], "μόνο σε πεδία συνδέσμων");
});

test("I-2: χρονικό όριο σάρωσης ανά mode (light χωράει στο 60″ του ωριαίου ελέγχου)", () => {
  assert.ok(CONTENT_BUDGET_MS.light <= 45_000);
  assert.ok(CONTENT_BUDGET_MS.full <= 180_000);
});

test("σύνδεσμοι data: εικόνας (png/jpeg/gif/webp/avif) σε imageUrl/logoUrl/image.url → τίποτα· data:image/svg+xml και data:text/html → critical", () => {
  for (const u of ["data:image/png;base64,iVBORw0KGgo=", "data:image/jpeg;base64,/9j/4AAQ", "data:image/jpg,xyz", "data:image/gif;base64,R0lG", "data:image/webp;base64,UklG", "data:image/avif;base64,AAAA"]) {
    assert.deepEqual(scanRecord("cms", { id: "c1", label: "x", fields: { data: { imageUrl: u, logoUrl: u, image: { url: u } } } }), [], u);
  }
  const svg = scanRecord("cms", { id: "c1", label: "x", fields: { data: { imageUrl: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" } } });
  assert.deepEqual(svg.map((f) => f.severity), ["critical"]);
  assert.deepEqual(scanRecord("ad", { id: "a", label: "x", fields: { href: "vbscript:msgbox(1)" } }).map((f) => f.severity), ["critical"]);
});

test("ίδιο κείμενο σε τίτλο και σε σύνδεσμο: ο σύνδεσμος ελέγχεται ακόμη κι αν το κείμενο εμφανίστηκε πρώτα σε άλλο πεδίο", () => {
  const out = scanRecord("ad", { id: "a1", label: "x", fields: { title: "javascript:alert(1)", href: "javascript:alert(1)" } });
  assert.deepEqual(out.map((f) => [f.severity, f.evidence]), [["critical", "ad#a1 href: javascript:alert(1)"]]);
});

test("ίδιος κακός σύνδεσμος σε data και published → ένα εύρημα", () => {
  const d = { slides: [{ href: "javascript:alert(1)" }] };
  assert.equal(scanRecord("cms", { id: "c1", label: "hero", fields: { data: d, published: d } }).length, 1);
});

test("contentOutcome (F-11): full με 0 προϊόντα → error «0 προϊόντα — πιθανώς λάθος βάση»· light (μόνο αλλαγμένα) → όχι", () => {
  const zero = [tally({ key: "product", scanned: 0, total: 0 }), tally({ key: "cms", scanned: 3, total: 3 })];
  const r = contentOutcome({ mode: "full", since, tallies: zero, findings: [], complete: true });
  assert.equal(r.status, "error");
  assert.ok(r.findings.some((f) => f.severity === "error" && /0 προϊόντα — πιθανώς λάθος βάση/.test(f.title)));
  assert.equal(contentOutcome({ mode: "light", since, tallies: zero, findings: [], complete: true }).status, "ok");
  assert.equal(contentOutcome({ mode: "full", since, tallies: [tally({ key: "product", scanned: 5, total: 5 })], findings: [], complete: true }).status, "ok");
});
