import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks, sinceFor, lightSince, coversChecks, timeoutFor, capFindings, athens, MAX_FINDINGS, withRunMeta, isCompleteRun, RUN_META, windowKeys, fullSince } from "./execute";
import type { Check, AuditCtx } from "./types";
import type { Finding } from "./rules";

const now = new Date("2026-10-20T06:00:00Z");
const ctx: AuditCtx = { mode: "full", since: sinceFor("full", now), now };
const check = (key: string, run: Check["run"], timeoutMs = 200): Check => ({ key, title: `Έλεγχος ${key}`, modes: ["full"], timeoutMs, run });
const f = (severity: Finding["severity"], i = 0): Finding => ({ severity, title: `t${i}`, detail: "d", evidence: `e${i}` });

test("sinceFor: full = 24 ώρες πριν, light = 1 ώρα πριν", () => {
  assert.equal(sinceFor("full", now).toISOString(), "2026-10-19T06:00:00.000Z");
  assert.equal(sinceFor("light", now).toISOString(), "2026-10-20T05:00:00.000Z");
});

test("athens: ώρα Ελλάδας (UTC+3 τον Οκτώβριο)", () => {
  assert.equal(athens(now), "20/10 09:00");
});

test("runChecks: ok / ευρήματα / σφάλμα / χρονικό όριο — κάθε έλεγχος ανεξάρτητος, με τη σειρά του μητρώου", async () => {
  let aborted = false;
  const out = await runChecks([
    check("a", async () => ({ status: "ok", summary: "εξετάστηκαν 3", findings: [] })),
    check("b", async () => ({ status: "warn", summary: "s", findings: [f("warn")], snapshot: { x: 1 } })),
    check("c", async () => { throw new Error("βάση εκτός"); }),
    check("d", (c) => new Promise((r) => { c.signal?.addEventListener("abort", () => { aborted = true; }); setTimeout(() => r({ status: "ok", summary: "", findings: [] }), 1000); }), 50),
  ], ctx);
  assert.deepEqual(out.map((r) => [r.key, r.status]), [["a", "ok"], ["b", "warn"], ["c", "error"], ["d", "error"]]);
  assert.equal(out[0].title, "Έλεγχος a");
  assert.ok(out.every((r) => typeof r.ms === "number" && r.ms >= 0));
  assert.deepEqual(out[1].snapshot, { x: 1 });
  assert.match(out[2].summary, /βάση εκτός/);
  assert.equal(out[2].findings[0].severity, "error");
  assert.match(out[3].summary, /χρονικό όριο/);
  assert.ok(aborted, "το signal ακυρώνεται στο χρονικό όριο");
});

test("runChecks: η κατάσταση είναι πάντα τουλάχιστον όσο το χειρότερο εύρημα (κανένα ψευδές ok)", async () => {
  const [r] = await runChecks([check("a", async () => ({ status: "ok", summary: "", findings: [f("critical")] }))], ctx);
  assert.equal(r.status, "critical");
});

test("runChecks: μήνυμα σφάλματος κομμένο (όχι τεράστια dumps)", async () => {
  const [r] = await runChecks([check("a", async () => { throw new Error("x".repeat(5000)); })], ctx);
  assert.ok(r.summary.length < 400);
});

test("capFindings: κρατά τα σοβαρότερα, τα υπόλοιπα σε ένα εύρημα με τη χειρότερη σοβαρότητά τους", () => {
  const many = [...Array.from({ length: MAX_FINDINGS + 10 }, (_, i) => f("warn", i)), f("critical", 999)];
  const out = capFindings(many);
  assert.equal(out.length, MAX_FINDINGS + 1);
  assert.equal(out[0].severity, "critical");
  const rest = out[out.length - 1];
  assert.equal(rest.severity, "warn");
  assert.match(rest.title, /11 ακόμη/);
  assert.deepEqual(capFindings([f("warn")]), [f("warn")]);
});

test("lightSince: από το προηγούμενο report μείον 2′ επικάλυψη· χωρίς report → −1 ώρα· έως 24 ώρες πίσω", () => {
  assert.equal(lightSince(new Date("2026-10-20T05:00:30Z"), now).toISOString(), "2026-10-20T04:58:30.000Z");
  assert.equal(lightSince(null, now).toISOString(), "2026-10-20T05:00:00.000Z");
  assert.equal(lightSince(new Date("2026-10-10T00:00:00Z"), now).toISOString(), "2026-10-19T06:00:00.000Z");
  assert.equal(lightSince(new Date("2026-10-20T07:00:00Z"), now).toISOString(), "2026-10-20T05:00:00.000Z", "report «από το μέλλον» → −1 ώρα");
});

test("timeoutFor: αριθμός ή ανά mode", () => {
  assert.equal(timeoutFor({ timeoutMs: 5000 }, "light"), 5000);
  assert.equal(timeoutFor({ timeoutMs: { full: 200_000, light: 55_000 } }, "light"), 55_000);
  assert.equal(timeoutFor({ timeoutMs: { full: 200_000, light: 55_000 } }, "full"), 200_000);
});

test("runChecks: χρονικό όριο ανά mode", async () => {
  const slow = check("s", () => new Promise((r) => setTimeout(() => r({ status: "ok", summary: "", findings: [] }), 120)));
  slow.timeoutMs = { full: 1000, light: 30 };
  const [l] = await runChecks([slow], { ...ctx, mode: "light" });
  assert.equal(l.status, "error");
  const [f] = await runChecks([slow], ctx);
  assert.equal(f.status, "ok");
});

test("coversChecks: το προηγούμενο report μετρά ως βάση του light μόνο αν έτρεξαν όλοι οι έλεγχοι χωρίς σφάλμα", () => {
  const rep = (xs: [string, string][]) => xs.map(([key, status]) => ({ key, status, title: "", summary: "", findings: [], ms: 1 }));
  assert.ok(coversChecks(rep([["staff", "ok"], ["logins", "warn"], ["bunny", "ok"]]), ["staff", "logins"]));
  assert.ok(!coversChecks(rep([["staff", "ok"]]), ["staff", "logins"]), "χειροκίνητο report ενός ελέγχου");
  assert.ok(!coversChecks(rep([["staff", "ok"], ["logins", "error"]]), ["staff", "logins"]));
  assert.ok(!coversChecks(null, ["staff"]));
});

test("coversChecks: μερική σάρωση (complete: false) ή εγγραφή χωρίς status δεν καλύπτει το παράθυρο", () => {
  const ok = { key: "staff", status: "ok", title: "", summary: "", findings: [], ms: 1 };
  assert.ok(!coversChecks([ok, { ...ok, key: "content", status: "warn", complete: false }], ["staff", "content"]));
  assert.ok(!coversChecks([ok, { key: "content" }], ["staff", "content"]));
  assert.ok(coversChecks([ok, { ...ok, key: "content", status: "warn", complete: true }], ["staff", "content"]));
});

test("runChecks: το complete του ελέγχου αποθηκεύεται", async () => {
  const [r] = await runChecks([check("c", async () => ({ status: "warn", summary: "", findings: [], complete: false }))], ctx);
  assert.equal(r.complete, false);
  const [o] = await runChecks([check("o", async () => ({ status: "ok", summary: "", findings: [] }))], ctx);
  assert.equal("complete" in o, false);
});

test("withRunMeta: ο πλήρης έλεγχος του mode σημειώνεται (meta)· χειροκίνητος ενός ελέγχου όχι", () => {
  const results = [{ key: "staff", title: "S", status: "ok" as const, summary: "", findings: [], ms: 1 }];
  assert.deepEqual(withRunMeta(results), [...results, RUN_META]);
  assert.deepEqual(withRunMeta(results, ["staff"]), results);
});

test("isCompleteRun: σημειωμένο report μετρά ακόμη κι αν προστέθηκε μετά νέος έλεγχος· παλιά reports χωρίς meta με όλα τα κλειδιά", () => {
  const rep = (keys: string[], meta = false) => [...keys.map((key) => ({ key, status: "ok" })), ...(meta ? [RUN_META] : [])];
  assert.ok(isCompleteRun(rep(["staff", "logins"], true), ["staff", "logins", "watcher"]), "νέος έλεγχος μετά το deploy");
  assert.ok(isCompleteRun(rep(["staff", "logins"]), ["staff", "logins"]), "παλιό report χωρίς meta");
  assert.ok(!isCompleteRun(rep(["staff"]), ["staff", "logins"]), "χειροκίνητο ενός ελέγχου");
  assert.ok(!isCompleteRun({ meta: "run", allChecks: true }, ["staff"]));
  assert.ok(!isCompleteRun(null, ["staff"]));
});

test("windowKeys (F-5): η κάλυψη του παραθύρου μετρά μόνο τους ελέγχους που χρησιμοποιούν το since (όχι site / watcher)", () => {
  const c = (key: string, modes: Check["modes"]): Check => ({ key, title: key, modes, timeoutMs: 1, run: async () => ({ status: "ok", summary: "", findings: [] }) });
  const reg = ["site", "staff", "logins", "settings-changes", "content", "cert", "deps", "watcher"].map((k) => c(k, ["full", "light"])).concat([c("bunny", ["full"])]);
  assert.deepEqual(windowKeys(reg, "light"), ["staff", "logins", "settings-changes", "content"]);
  assert.deepEqual(windowKeys(reg, "full"), ["staff", "logins", "settings-changes", "content", "bunny"]);
  // report με site / watcher σε error καλύπτει ακόμη το παράθυρο του light· με staff σε error όχι
  const rep = (staff: string) => [["site", "error"], ["staff", staff], ["logins", "warn"], ["settings-changes", "ok"], ["content", "ok"], ["watcher", "error"]].map(([key, status]) => ({ key, status }));
  assert.ok(coversChecks(rep("ok"), windowKeys(reg, "light")));
  assert.ok(!coversChecks(rep("error"), windowKeys(reg, "light")));
});

test("fullSince (F-6): min(−24 ώρες, προηγούμενος full − 2′), έως 72 ώρες πίσω· χωρίς προηγούμενο / στο μέλλον → −24 ώρες", () => {
  assert.equal(fullSince(null, now).toISOString(), "2026-10-19T06:00:00.000Z");
  assert.equal(fullSince(new Date("2026-10-19T04:00:00Z"), now).toISOString(), "2026-10-19T03:58:00.000Z", "ο cron άργησε: από τον προηγούμενο full");
  assert.equal(fullSince(new Date("2026-10-19T08:00:00Z"), now).toISOString(), "2026-10-19T06:00:00.000Z", "πρόσφατος full (π.χ. Τρέξε τώρα): πάντα τουλάχιστον 24 ώρες");
  assert.equal(fullSince(new Date("2026-10-10T00:00:00Z"), now).toISOString(), "2026-10-17T06:00:00.000Z", "έως 72 ώρες πίσω");
  assert.equal(fullSince(new Date("2026-10-21T00:00:00Z"), now).toISOString(), "2026-10-19T06:00:00.000Z");
});
