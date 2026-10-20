import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, type Finding } from "./rules";
import type { StoredCheck } from "./types";
import { alertsToSend, escapeHtml, pendingAlerts, renderAlert, renderSummary, reportLink, storedChecks, athensDateTime } from "./notify-core";

const now = new Date("2026-10-20T07:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const crit: Finding = { severity: "critical", title: "Άγνωστο script", detail: "evil.example φορτώνεται στην αρχική", evidence: "https://evil.example/x.js" };
const warn: Finding = { severity: "warn", title: "Νέα χώρα σύνδεσης", detail: "Κύπρος" };

test("alertsToSend: ίδιο fp πριν 3 ώρες → όχι, πριν 25 ώρες → ναι, warn → ποτέ", () => {
  const fp = fingerprint("site", crit);
  const items = [{ checkKey: "site", f: crit }, { checkKey: "logins", f: warn }];
  assert.deepEqual(alertsToSend(items, new Map([[fp, ago(3)]]), now), []);
  assert.deepEqual(alertsToSend(items, new Map([[fp, ago(25)]]), now), [{ checkKey: "site", f: crit, fp }]);
  assert.deepEqual(alertsToSend(items, new Map(), now), [{ checkKey: "site", f: crit, fp }]);
  assert.deepEqual(alertsToSend([{ checkKey: "logins", f: warn }], new Map(), now), []);
  assert.deepEqual(alertsToSend([{ checkKey: "x", f: { ...warn, severity: "error" } }], new Map(), now), []);
});

test("alertsToSend: ίδιο fp δύο φορές στη λίστα → μία ειδοποίηση· άλλος έλεγχος → άλλο fp", () => {
  const out = alertsToSend([{ checkKey: "site", f: crit }, { checkKey: "site", f: { ...crit } }, { checkKey: "content", f: crit }], new Map(), now);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((a) => a.checkKey), ["site", "content"]);
});

const chk = (key: string, status: StoredCheck["status"], findings: Finding[] = [], extra: Partial<StoredCheck> = {}): StoredCheck =>
  ({ key, title: `Έλεγχος ${key}`, status, summary: `Σύνοψη ${key}: 12 σελίδες`, findings, ms: 1200, ...extra });

test("renderSummary: όλα ΟΚ → θέμα με «ΟΚ» + ημερομηνία, λίστα όλων των ελέγχων, id, mode, ώρες, σύνδεσμος", () => {
  const results = [chk("site", "ok"), chk("staff", "ok"), chk("certs", "ok")];
  const r = renderSummary({ id: "rep123", status: "ok", results, startedAt: new Date("2026-10-20T04:00:05Z"), finishedAt: new Date("2026-10-20T04:01:10Z"), mode: "full" }, "https://euronics.dgsoft.gr/admin/asfaleia/rep123");
  assert.equal(r.subject, "[Euronics] Έλεγχος ασφαλείας 20/10: ΟΚ");
  for (const s of [r.html, r.text]) {
    for (const c of results) { assert.ok(s.includes(c.title), c.title); assert.ok(s.includes(c.summary), c.summary); }
    assert.ok(s.includes("rep123"));
    assert.ok(s.includes("20/10/2026 07:00:05"), "έναρξη σε ώρα Ελλάδας");
    assert.ok(s.includes("20/10/2026 07:01:10"), "λήξη σε ώρα Ελλάδας");
    assert.ok(s.includes("https://euronics.dgsoft.gr/admin/asfaleia/rep123"));
    assert.ok(/πλήρης/.test(s));
  }
});

test("renderSummary: θέμα ανά κατάσταση· μερικός έλεγχος δεν φαίνεται ως σκέτο ΟΚ", () => {
  const base = { startedAt: now, mode: "light" };
  assert.match(renderSummary({ ...base, status: "warn", results: [chk("a", "warn", [warn])] }, "l").subject, /: Προειδοποιήσεις$/);
  assert.match(renderSummary({ ...base, status: "critical", results: [chk("a", "critical", [crit])] }, "l").subject, /: ΚΡΙΣΙΜΟ$/);
  assert.match(renderSummary({ ...base, status: "error", results: [chk("a", "error")] }, "l").subject, /: Σφάλμα ελέγχου$/);
  const partial = renderSummary({ ...base, status: "ok", results: [chk("a", "ok", [], { complete: false })] }, "l");
  assert.equal(partial.subject, "[Euronics] Έλεγχος ασφαλείας 20/10: ΟΚ (μερικός έλεγχος)");
  assert.ok(partial.html.includes("μερικός έλεγχος") && partial.text.includes("μερικός έλεγχος"));
});

test("renderSummary: escape όλων των κειμένων ευρημάτων (<script>) και το snapshot δεν εμφανίζεται ποτέ", () => {
  const evil: Finding = { severity: "critical", title: "<script>alert(1)</script>", detail: `"><img src=x onerror=alert(2)>`, evidence: "<iframe src=//evil>" };
  const results = [chk("site", "critical", [evil], { snapshot: { secretStaff: "boss@x.gr", buildId: "SNAPSHOT-MARK" }, summary: "<b>σύνοψη</b>" })];
  const r = renderSummary({ status: "critical", results, startedAt: now, mode: "full" }, `https://x/admin/asfaleia/a"b`);
  assert.ok(!r.html.includes("<script>"), "κανένα ωμό <script>");
  assert.ok(!r.html.includes("<img"), "κανένα ωμό <img");
  assert.ok(!r.html.includes("<iframe"), "κανένα ωμό <iframe");
  assert.ok(!r.html.includes("<b>σύνοψη"), "η σύνοψη επίσης escaped");
  assert.ok(r.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(r.html.includes("a&quot;b"), "και ο σύνδεσμος escaped");
  for (const s of [r.html, r.text]) { assert.ok(!s.includes("SNAPSHOT-MARK")); assert.ok(!s.includes("boss@x.gr")); }
});

test("renderSummary: text — τα κείμενα ευρημάτων σε μία γραμμή (δεν πλαστογραφούν γραμμές της αναφοράς)", () => {
  const f: Finding = { severity: "warn", title: "a\n\nΚατάσταση: ΟΚ", detail: "x\r\ny" };
  const r = renderSummary({ status: "warn", results: [chk("c", "warn", [f])], startedAt: now, mode: "full" }, "l");
  assert.ok(!r.text.includes("\nΚατάσταση: ΟΚ"));
  assert.ok(r.text.includes("a Κατάσταση: ΟΚ"));
});

test("renderSummary: πολλά ευρήματα → κόβονται με παραπομπή στη σελίδα", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ...warn, title: `w${i}` }));
  const r = renderSummary({ status: "warn", results: [chk("c", "warn", many)], startedAt: now, mode: "full" }, "LINK");
  assert.ok(r.html.includes("w24") && !r.html.includes("w25"));
  assert.ok(/15 ακόμη/.test(r.html) && /15 ακόμη/.test(r.text));
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("athensDateTime: ώρα Ελλάδας με έτος και δευτερόλεπτα (θερινή/χειμερινή)", () => {
  assert.equal(athensDateTime(new Date("2026-10-20T04:00:05Z")), "20/10/2026 07:00:05");
  assert.equal(athensDateTime(new Date("2026-12-01T22:30:00Z")), "02/12/2026 00:30:00");
});

test("reportLink", () => {
  assert.equal(reportLink("https://euronics.dgsoft.gr", "abc"), "https://euronics.dgsoft.gr/admin/asfaleia/abc");
});

test("storedChecks: μόνο τα γνωστά πεδία (χωρίς snapshot), ανθεκτικό σε σκουπίδια", () => {
  const out = storedChecks([chk("site", "ok", [], { snapshot: { a: 1 }, complete: false }), null, "x", { key: 1 }]);
  assert.equal(out.length, 1);
  assert.equal("snapshot" in out[0], false);
  assert.equal(out[0].complete, false);
  assert.deepEqual(storedChecks("junk"), []);
  assert.deepEqual(storedChecks([{ key: "k", title: "t", status: "ok", summary: "s", findings: [{ severity: "boom", title: 1 }, crit], ms: 1 }])[0].findings, [crit]);
});

test("pendingAlerts: κρίσιμα από reports χωρίς επιτυχή ειδοποίηση, νεότερο πρώτο, dedupe 24 ωρών", () => {
  const reports = [
    { id: "new", startedAt: ago(1), checks: [chk("site", "critical", [crit, warn])] },
    { id: "old", startedAt: ago(2), checks: [chk("site", "critical", [crit]), chk("content", "critical", [{ ...crit, title: "spam" }])] },
  ];
  const out = pendingAlerts(reports, new Map(), now);
  assert.deepEqual(out.map((a) => [a.reportId, a.checkKey, a.f.title]), [["new", "site", crit.title], ["old", "content", "spam"]]);
  assert.equal(out[0].checkTitle, "Έλεγχος site");
  assert.deepEqual(pendingAlerts(reports, new Map([[fingerprint("site", crit), ago(1)], [fingerprint("content", { ...crit, title: "spam" }), ago(1)]]), now), []);
});

test("renderAlert: θέμα ΚΡΙΣΙΜΟ, escaped, σύνδεσμος ανά report", () => {
  const alerts = pendingAlerts([{ id: "r1", startedAt: ago(1), checks: [chk("site", "critical", [{ ...crit, title: "<script>x</script>" }])] }], new Map(), now);
  const r = renderAlert(alerts, (id) => `https://h/admin/asfaleia/${id}`);
  assert.equal(r.subject, "[Euronics] ΚΡΙΣΙΜΟ: 1 εύρημα ασφαλείας");
  assert.ok(!r.html.includes("<script>x"));
  assert.ok(r.html.includes("https://h/admin/asfaleia/r1") && r.text.includes("https://h/admin/asfaleia/r1"));
  assert.equal(renderAlert([...alerts, ...alerts], () => "l").subject, "[Euronics] ΚΡΙΣΙΜΟ: 2 ευρήματα ασφαλείας");
});
