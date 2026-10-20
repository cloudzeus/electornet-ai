import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRunMarker, athensDay, dayStrip, stripStats, watcherState, overview, findingCounts, FULL_STALE_MS, LIGHT_STALE_MS, HISTORY_DAYS } from "./view";
import { WATCHER_STALE_MS } from "./checks/watcher-core";
import { CHECK_EXPLAIN, EXTRA_EXPLAIN } from "./explain";

const NOW = new Date("2026-10-20T07:30:00Z"); // 10:30 ώρα Ελλάδας
const H = 3_600_000;

test("athensDay: ημέρα σε ώρα Ελλάδας (όχι UTC)", () => {
  assert.equal(athensDay(new Date("2026-10-19T21:30:00Z")), "2026-10-20"); // 00:30 Αθήνα
  assert.equal(athensDay(new Date("2026-10-19T20:30:00Z")), "2026-10-19"); // 23:30 Αθήνα
  assert.equal(athensDay(new Date("2026-01-15T22:30:00Z")), "2026-01-16"); // χειμερινή ώρα (+2)
});

test("dayStrip: 90 κελιά, παλαιότερο πρώτο, το τελευταίο είναι σήμερα· ημέρες χωρίς report → null", () => {
  const cells = dayStrip([], NOW);
  assert.equal(HISTORY_DAYS, 90);
  assert.equal(cells.length, 90);
  assert.equal(cells.at(-1)!.day, "2026-10-20");
  assert.equal(cells[0].day, "2026-07-23");
  assert.equal(cells.at(-1)!.label, "20/10");
  assert.ok(cells.every((c) => c.status === null && c.reportId === null && c.count === 0));
  assert.equal(new Set(cells.map((c) => c.day)).size, 90);
});

test("dayStrip: συνεχόμενες ημέρες και στην αλλαγή ώρας (25/10/2026)", () => {
  const days = dayStrip([], new Date("2026-10-27T10:00:00Z"), 5).map((c) => c.day);
  assert.deepEqual(days, ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
  // λίγο μετά τα μεσάνυχτα Αθήνας (21:30 UTC με χειμερινή ώρα = 23:30 Αθήνα → ακόμα η 27η)
  assert.equal(dayStrip([], new Date("2026-10-27T21:30:00Z"), 1)[0].day, "2026-10-27");
  assert.equal(dayStrip([], new Date("2026-10-27T22:30:00Z"), 1)[0].day, "2026-10-28");
});

test("dayStrip: το χρώμα της ημέρας είναι το χειρότερο report· σύνδεσμος στο νεότερο από τα χειρότερα", () => {
  const cells = dayStrip([
    { id: "a", startedAt: new Date("2026-10-20T04:00:00Z"), status: "ok" },
    { id: "b", startedAt: new Date("2026-10-20T05:05:00Z"), status: "critical" },
    { id: "c", startedAt: new Date("2026-10-20T06:05:00Z"), status: "warn" },
    { id: "d", startedAt: new Date("2026-10-20T07:05:00Z"), status: "critical" },
    { id: "e", startedAt: new Date("2026-10-19T08:00:00Z"), status: "error" },
    { id: "f", startedAt: new Date("2026-10-19T09:00:00Z"), status: "warn" },
  ], NOW);
  const today = cells.at(-1)!;
  assert.equal(today.status, "critical");
  assert.equal(today.reportId, "d");
  assert.equal(today.count, 4);
  const y = cells.at(-2)!;
  assert.equal(y.status, "error"); // error > warn
  assert.equal(y.reportId, "e");
});

test("dayStrip: άγνωστο status → error (ποτέ ψευδές ΟΚ)· reports εκτός παραθύρου αγνοούνται", () => {
  const cells = dayStrip([
    { id: "x", startedAt: new Date("2026-10-20T05:00:00Z"), status: "running" },
    { id: "y", startedAt: new Date("2026-10-20T06:00:00Z"), status: "ok" },
    { id: "old", startedAt: new Date("2026-06-01T06:00:00Z"), status: "critical" },
    { id: "future", startedAt: new Date("2026-10-21T06:00:00Z"), status: "critical" },
  ], NOW);
  assert.equal(cells.at(-1)!.status, "error");
  assert.equal(cells.at(-1)!.reportId, "x");
  assert.ok(!cells.some((c) => c.reportId === "old" || c.reportId === "future"));
});

test("stripStats: πλήθη ανά κατάσταση και ημέρες χωρίς έλεγχο", () => {
  const cells = dayStrip([
    { id: "a", startedAt: new Date("2026-10-20T04:00:00Z"), status: "ok" },
    { id: "b", startedAt: new Date("2026-10-19T04:00:00Z"), status: "critical" },
    { id: "c", startedAt: new Date("2026-10-18T04:00:00Z"), status: "warn" },
  ], NOW);
  assert.deepEqual(stripStats(cells), { ok: 1, warn: 1, critical: 1, error: 0, none: 87 });
});

test("watcherState: κανένα σήμα → never· > 26 ώρες → stale· αλλιώς ok", () => {
  assert.deepEqual(watcherState(null, NOW), { kind: "never", ageMs: null });
  assert.equal(watcherState(new Date(NOW.getTime() - WATCHER_STALE_MS - 1000), NOW).kind, "stale");
  const ok = watcherState(new Date(NOW.getTime() - 2 * H), NOW);
  assert.equal(ok.kind, "ok");
  assert.equal(ok.ageMs, 2 * H);
  // ρολόι μπροστά: όχι αρνητική ηλικία
  assert.deepEqual(watcherState(new Date(NOW.getTime() + H), NOW), { kind: "ok", ageMs: 0 });
});

test("overview: χωρίς κανέναν πλήρη έλεγχο → error, ποτέ ΟΚ", () => {
  const o = overview({ full: null, light: null, now: NOW });
  assert.equal(o.status, "error");
  assert.ok(o.notes.some((n) => /πλήρης έλεγχος/.test(n.text)));
});

test("overview: φρέσκος πλήρης ΟΚ + νεότερος ωριαίος ΟΚ → ok χωρίς σημειώσεις", () => {
  const o = overview({ full: { startedAt: new Date(NOW.getTime() - 3 * H), status: "ok", partial: false }, light: { startedAt: new Date(NOW.getTime() - 0.4 * H), status: "ok", partial: false }, now: NOW });
  assert.equal(o.status, "ok");
  assert.deepEqual(o.notes, []);
});

test("overview: χειρότερο από πλήρη και νεότερο ωριαίο· ο ωριαίος που είναι παλαιότερος του πλήρους αγνοείται", () => {
  const full = { startedAt: new Date(NOW.getTime() - 3 * H), status: "warn", partial: false };
  assert.equal(overview({ full, light: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "critical", partial: false }, now: NOW }).status, "critical");
  // ωριαίος ΟΚ μετά από κρίσιμο πλήρη: μένει κρίσιμο (ο ωριαίος δεν καλύπτει όλους τους ελέγχους)
  assert.equal(overview({ full: { ...full, status: "critical" }, light: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "ok", partial: false }, now: NOW }).status, "critical");
  const older = overview({ full: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "ok", partial: false }, light: { startedAt: new Date(NOW.getTime() - 0.9 * H), status: "critical", partial: false }, now: NOW });
  assert.equal(older.status, "ok");
});

test("overview: πλήρης παλαιότερος από 26 ώρες → error· ωριαίος παλαιότερος από 2 ώρες → warn· μερικός → warn", () => {
  assert.equal(FULL_STALE_MS, 26 * H);
  assert.equal(LIGHT_STALE_MS, 2 * H);
  const stale = overview({ full: { startedAt: new Date(NOW.getTime() - 27 * H), status: "ok", partial: false }, light: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "ok", partial: false }, now: NOW });
  assert.equal(stale.status, "error");
  assert.ok(stale.notes.some((n) => n.severity === "error" && /26 ώρες/.test(n.text)));
  const lightStale = overview({ full: { startedAt: new Date(NOW.getTime() - 3 * H), status: "ok", partial: false }, light: { startedAt: new Date(NOW.getTime() - 3 * H), status: "ok", partial: false }, now: NOW });
  assert.equal(lightStale.status, "warn");
  assert.ok(lightStale.notes.some((n) => /ωριαίος/.test(n.text)));
  const noLight = overview({ full: { startedAt: new Date(NOW.getTime() - 1 * H), status: "ok", partial: false }, light: null, now: NOW });
  assert.equal(noLight.status, "warn");
  const partial = overview({ full: { startedAt: new Date(NOW.getTime() - 3 * H), status: "ok", partial: true }, light: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "ok", partial: false }, now: NOW });
  assert.equal(partial.status, "warn");
  assert.ok(partial.notes.some((n) => /μερικός έλεγχος/.test(n.text)));
});

test("overview: άγνωστο status στη βάση → error", () => {
  assert.equal(overview({ full: { startedAt: new Date(NOW.getTime() - 3 * H), status: "running", partial: false }, light: { startedAt: new Date(NOW.getTime() - 0.5 * H), status: "ok", partial: false }, now: NOW }).status, "error");
});

test("findingCounts: πλήθη ευρημάτων ανά σοβαρότητα", () => {
  assert.deepEqual(findingCounts([
    { key: "a", title: "A", status: "critical", summary: "", ms: 0, findings: [{ severity: "critical", title: "x", detail: "" }, { severity: "warn", title: "y", detail: "" }] },
    { key: "b", title: "B", status: "warn", summary: "", ms: 0, findings: [{ severity: "warn", title: "z", detail: "" }, { severity: "error", title: "w", detail: "" }] },
  ]), { critical: 1, error: 1, warn: 2 });
});

test("explain: ένα στοιχείο για κάθε έλεγχο του μητρώου + ο εξωτερικός φύλακας και ο dead man's switch", () => {
  const keys = ["site", "staff", "logins", "settings-changes", "content", "bunny", "cert", "deps", "watcher"];
  assert.deepEqual(CHECK_EXPLAIN.map((c) => c.key).sort(), [...keys].sort());
  for (const c of [...CHECK_EXPLAIN, ...EXTRA_EXPLAIN]) {
    assert.ok(c.title && c.what.length > 40 && c.why.length > 30 && c.when, c.key);
  }
  assert.deepEqual(EXTRA_EXPLAIN.map((c) => c.key), ["external-watcher", "dead-mans-switch"]);
});

test("hasRunMarker: μόνο με την εγγραφή {meta:'run', allChecks:true}", () => {
  assert.equal(hasRunMarker([{ key: "site", status: "ok" }, { meta: "run", allChecks: true }]), true);
  assert.equal(hasRunMarker([{ key: "site", status: "ok" }]), false);
  assert.equal(hasRunMarker([{ meta: "run", allChecks: false }, null, "x"]), false);
  assert.equal(hasRunMarker(null), false);
});
