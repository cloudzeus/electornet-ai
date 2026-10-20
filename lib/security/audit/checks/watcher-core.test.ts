import { test } from "node:test";
import assert from "node:assert/strict";
import { WATCHER_STALE_MS, watcherOutcome } from "./watcher-core";

const NOW = new Date("2026-10-20T07:00:00Z");

test("watcherOutcome: πρόσφατο σήμα → ok, η σύνοψη λέει πότε", () => {
  const r = watcherOutcome(new Date("2026-10-20T06:15:00Z"), NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.findings, []);
  assert.match(r.summary, /20\/10\/2026 09:15/);
});

test("watcherOutcome: σήμα παλιότερο από 26 ώρες → warn «δεν έχει επικοινωνήσει από …»", () => {
  assert.equal(WATCHER_STALE_MS, 26 * 3_600_000);
  const r = watcherOutcome(new Date(NOW.getTime() - WATCHER_STALE_MS - 60_000), NOW);
  assert.equal(r.status, "warn");
  assert.match(r.findings[0].title, /Ο εξωτερικός φύλακας δεν έχει επικοινωνήσει από/);
  assert.equal(watcherOutcome(new Date(NOW.getTime() - WATCHER_STALE_MS + 60_000), NOW).status, "ok");
});

test("watcherOutcome: κανένα σήμα → warn", () => {
  const r = watcherOutcome(null, NOW);
  assert.equal(r.status, "warn");
  assert.match(r.findings[0].title, /Ο εξωτερικός φύλακας δεν έχει επικοινωνήσει/);
  assert.match(r.summary, /κανένα/);
});
