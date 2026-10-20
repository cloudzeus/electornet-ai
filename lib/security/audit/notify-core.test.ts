import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, type Finding } from "./rules";
import type { StoredCheck } from "./types";
import { alertsToSend, escapeHtml, pendingAlerts, renderAlert, renderSummary, reportLink, storedChecks, athensDateTime, deliveryOutcome, nextRetry, parseRetry, alertsUndelivered, asSeverity, MAX_ALERT_ATTEMPTS, claimAll, deliverClaimed, alertRecipients, summaryRetryDue } from "./notify-core";

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

test("alertsToSend: dedupe 23 ωρών — το καθημερινό full (κάθε ~24 ώρες) ξαναστέλνει κρίσιμο που επιμένει", () => {
  const fp = fingerprint("site", crit);
  const items = [{ checkKey: "site", f: crit }];
  assert.equal(alertsToSend(items, new Map([[fp, ago(22.9)]]), now).length, 0);
  assert.equal(alertsToSend(items, new Map([[fp, ago(23)]]), now).length, 1);
  assert.equal(alertsToSend(items, new Map([[fp, ago(23.9)]]), now).length, 1);
});

test("asSeverity / renderSummary: άγνωστο status → «Σφάλμα ελέγχου», ποτέ «undefined»", () => {
  assert.equal(asSeverity("warning"), "error");
  assert.equal(asSeverity("critical"), "critical");
  const r = renderSummary({ status: "warning" as never, results: [], startedAt: now, mode: "full" }, "l");
  assert.match(r.subject, /: Σφάλμα ελέγχου$/);
  assert.ok(!/undefined/.test(r.subject + r.html + r.text));
  const c = renderSummary({ status: "ok", results: [{ ...chk("a", "ok"), status: "bogus" as never }], startedAt: now, mode: "full" }, "l");
  assert.ok(!/undefined/.test(c.html + c.text));
});

test("deliveryOutcome: παραδόθηκε αν έστω ένας πήρε το email· «uncertain» = στάλθηκε· αποτυχημένοι για νέα προσπάθεια", () => {
  assert.deepEqual(deliveryOutcome([{ to: "a@x.gr", ok: true }, { to: "b@x.gr", ok: false }]), { delivered: true, failed: ["b@x.gr"] });
  assert.deepEqual(deliveryOutcome([{ to: "a@x.gr", ok: false, kind: "uncertain" }, { to: "b@x.gr", ok: false, kind: "permanent" }]), { delivered: true, failed: ["b@x.gr"] });
  assert.deepEqual(deliveryOutcome([{ to: "a@x.gr", ok: false }, { to: "b@x.gr", ok: false, kind: "transient" }]), { delivered: false, failed: ["a@x.gr", "b@x.gr"] });
  assert.deepEqual(deliveryOutcome([]), { delivered: false, failed: [] });
});

test("nextRetry: μόνο οι αποτυχημένοι παραλήπτες, έως 3 προσπάθειες συνολικά, μετά καταγράφεται ότι εγκαταλείφθηκε", () => {
  const base = { fps: ["f1"], reportIds: ["r1"] };
  assert.equal(nextRetry(null, [], base, now), null);
  const r1 = nextRetry(null, ["b@x.gr"], base, now)!;
  assert.deepEqual({ to: r1.to, attempts: r1.attempts, gaveUp: r1.gaveUp }, { to: ["b@x.gr"], attempts: 1, gaveUp: false });
  const r2 = nextRetry(r1, ["b@x.gr"], base, now)!;
  assert.equal(r2.attempts, 2); assert.equal(r2.gaveUp, false);
  const r3 = nextRetry(r2, ["b@x.gr"], base, now)!;
  assert.equal(r3.attempts, MAX_ALERT_ATTEMPTS); assert.equal(r3.gaveUp, true);
  assert.equal(nextRetry(r2, [], base, now), null, "πέτυχε στη 2η → τίποτα εκκρεμές");
  assert.deepEqual(parseRetry(JSON.parse(JSON.stringify(r3))), r3);
  for (const junk of [null, "x", { to: "a" }, { to: [1], attempts: 1, fps: [], reportIds: [] }]) assert.equal(parseRetry(junk), null);
});

test("alertsUndelivered: report >2 ώρες (έως 48) χωρίς ειδοποίηση ή με παραλήπτες που δεν την πήραν", () => {
  const row = (h: number, alerted: boolean, alertRetry: unknown = null) => ({ startedAt: ago(h), alerted, alertRetry });
  assert.equal(alertsUndelivered([row(1, false), row(3, true)], now), false, "<2 ώρες: ίσως απλώς τρέχει");
  assert.equal(alertsUndelivered([row(3, false)], now), true);
  assert.equal(alertsUndelivered([row(49, false)], now), false, "εκτός 48 ωρών");
  const retry = nextRetry(null, ["b@x.gr"], { fps: ["f"], reportIds: ["r"] }, ago(3));
  assert.equal(alertsUndelivered([row(3, true, retry)], now), true);
  assert.equal(alertsUndelivered([row(3, true, null)], now), false);
});

test("alertsToSend: lastSentAt στο μέλλον (λάθος ρολόι) δεν μπλοκάρει την αποστολή για πάντα", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const f: Finding = { severity: "critical", title: "X", detail: "d", evidence: "e" };
  const fp = fingerprint("site", f);
  assert.equal(alertsToSend([{ checkKey: "site", f }], new Map([[fp, new Date("2026-10-21T10:00:00Z")]]), now).length, 1);
  assert.equal(alertsToSend([{ checkKey: "site", f }], new Map([[fp, new Date("2026-10-20T09:00:00Z")]]), now).length, 0);
});

// ── τελική αναθεώρηση ────────────────────────────────────────────────────────────────────────────────────────────────
test("claimAll (F-1): σφάλμα στο 2ο κλείδωμα → αναίρεση του 1ου (δικά του μερικά κλειδώματα) και το σφάλμα προωθείται", async () => {
  const released: string[][] = [];
  const tryOne = async (x: string) => { if (x === "b") throw new Error("db down"); return true; };
  await assert.rejects(claimAll(["a", "b", "c"], tryOne, async (won) => { released.push(won); }), /db down/);
  assert.deepEqual(released, [["a"]]);
  // χωρίς σφάλμα: όσα κλειδώθηκαν (τα χαμένα από ταυτόχρονη εκτέλεση παραλείπονται), καμία αναίρεση
  const r2: string[][] = [];
  assert.deepEqual(await claimAll(["a", "b", "c"], async (x) => x !== "b", async (won) => { r2.push(won); }), ["a", "c"]);
  assert.deepEqual(r2, []);
  // αποτυχία και της αναίρεσης: προωθείται το αρχικό σφάλμα
  await assert.rejects(claimAll(["a", "b"], tryOne, async () => { throw new Error("release failed"); }), /db down/);
});

test("deliverClaimed (F-1): σφάλμα πριν/κατά την αποστολή → αναίρεση· κανείς δεν το πήρε → αναίρεση· παραδόθηκε → όχι", async () => {
  let rel = 0;
  const release = async () => { rel++; };
  await assert.rejects(deliverClaimed(async () => { throw new Error("render"); }, release), /render/);
  assert.equal(rel, 1);
  assert.deepEqual(await deliverClaimed(async () => ({ delivered: false, failed: ["a@x.gr"] }), release), { delivered: false, failed: ["a@x.gr"] });
  assert.equal(rel, 2);
  assert.deepEqual(await deliverClaimed(async () => ({ delivered: true, failed: ["b@x.gr"] }), release), { delivered: true, failed: ["b@x.gr"] });
  assert.equal(rel, 2);
});

test("storedChecks (F-14): άγνωστη / χωρίς κατάσταση → κρατιέται ως «error» με «άγνωστη κατάσταση», ποτέ δεν χάνεται από το email", () => {
  const out = storedChecks([{ key: "bunny", title: "Bunny", status: "running", summary: "x", findings: [], ms: 1 }, { key: "deps", title: "Deps", findings: [crit] }, { meta: "run", allChecks: true }]);
  assert.deepEqual(out.map((c) => [c.key, c.status]), [["bunny", "error"], ["deps", "error"]]);
  assert.match(out[0].summary, /άγνωστη κατάσταση/);
  assert.deepEqual(out[1].findings, [crit]);
  const mail = renderSummary({ status: "ok", results: out, startedAt: now, mode: "full" }, "https://x/r");
  assert.match(mail.text, /\[Σφάλμα ελέγχου\] Bunny/);
  assert.match(mail.text, /\[Σφάλμα ελέγχου\] Deps/);
});

test("storedChecks / alertRecipients (F-16): οι προηγούμενοι παραλήπτες του ευρήματος κρατιούνται (μόνο έγκυρα email) και προστίθενται στους τρέχοντες", () => {
  const f: Finding = { severity: "critical", title: "Άλλαξαν οι παραλήπτες των ειδοποιήσεων ασφαλείας", detail: "d", evidence: "e", notify: ["old@x.gr", "NEW@x.gr", "junk"] };
  const [c] = storedChecks([chk("settings-changes", "critical", [f])]);
  assert.deepEqual(c.findings[0].notify, ["old@x.gr", "new@x.gr"]);
  const alerts = pendingAlerts([{ id: "r1", startedAt: now, checks: [c] }], new Map(), now);
  assert.deepEqual(alertRecipients(["new@x.gr", "boss@x.gr"], alerts), ["new@x.gr", "boss@x.gr", "old@x.gr"]);
  assert.deepEqual(alertRecipients(["boss@x.gr"], []), ["boss@x.gr"]);
  // χωρίς notify: το εύρημα δεν αλλάζει σχήμα
  assert.equal("notify" in storedChecks([chk("site", "critical", [crit])])[0].findings[0], false);
});

test("summaryRetryDue (F-7): μόνο πλήρη reports (σημάδι run) με αποτυχημένη σύνοψη των τελευταίων 24 ωρών, νεότερο πρώτο", () => {
  const marked = [{ key: "site", status: "ok" }, { meta: "run", allChecks: true }];
  const row = (id: string, h: number, summarySent: boolean | null, o: Partial<{ mode: string; checks: unknown }> = {}) => ({ id, mode: "full", startedAt: ago(h), summarySent, checks: marked, ...o });
  assert.deepEqual(summaryRetryDue([
    row("old", 25, false), row("a", 2, false), row("b", 1, false), row("sent", 1, true), row("na", 1, null),
    row("light", 1, false, { mode: "light" }), row("only", 1, false, { checks: [{ key: "site", status: "ok" }] }),
  ], now), ["b", "a"]);
});
