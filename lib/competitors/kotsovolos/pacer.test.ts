import { test } from "node:test";
import assert from "node:assert/strict";
import { createPacer, KotStopError } from "./pacer";

function rig(o: { budget?: number; hours?: number; seed?: number } = {}) {
  let t = Date.UTC(2026, 10, 12, 1, 0, 0), s = o.seed ?? 7;
  const sleeps: number[] = [], starts: number[] = [];
  const p = createPacer({
    budget: o.budget ?? 1800, until: new Date(t + (o.hours ?? 5) * 3600_000),
    rand: () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296),
    sleep: async (ms) => { sleeps.push(ms); t += ms; }, now: () => new Date(t),
  });
  const call = async (r: { status?: number; ms?: number; retryAfterS?: number } = {}) => {
    await p.wait(); starts.push(t); t += r.ms ?? 300;
    await p.record({ status: r.status ?? 200, ms: r.ms ?? 300, retryAfterS: r.retryAfterS });
  };
  return { p, call, sleeps, starts };
};
const stop = (reason: string) => (e: unknown) => e instanceof KotStopError && e.reason === reason;

test("200 κλήσεις: παύσεις 3–7″ ή διάλειμμα 60–120″, ≥1 διάλειμμα ανά 120, ≤20 ανά 60″", async () => {
  const { call, sleeps, starts } = rig();
  for (let i = 0; i < 200; i++) await call();
  assert.equal(sleeps.length, 199);
  const brk = sleeps.map((x, i) => (x >= 60000 ? i : -1)).filter((i) => i >= 0);
  for (const x of sleeps) assert.ok((x >= 3000 && x <= 7000) || (x >= 60000 && x <= 120000), String(x));
  assert.ok(brk.length >= 1 && brk[0] < 120 && 199 - brk[brk.length - 1] <= 120);
  for (let i = 0; i < brk.length - 1; i++) assert.ok(brk[i + 1] - brk[i] <= 120);
  for (let i = 0; i < starts.length; i++) assert.ok(starts.filter((x) => x >= starts[i] && x < starts[i] + 60000).length <= 20);
});

test("η 1.801η κλήση ρίχνει budget", async () => {
  const { p, call } = rig({ hours: 100 });
  for (let i = 0; i < 1800; i++) await call();
  assert.equal(p.used, 1800);
  await assert.rejects(p.wait(), stop("budget"));
});

test("κλήση μετά το until ρίχνει window", async () => {
  const { call } = rig({ hours: 1 });
  await assert.rejects(async () => { for (let i = 0; i < 1000; i++) await call(); }, stop("window"));
});

test("429 Retry-After 30: μία αναμονή 30″, το δεύτερο 429 blocked", async () => {
  const { call, sleeps } = rig();
  await call();
  await call({ status: 429, retryAfterS: 30 });
  assert.equal(sleeps.filter((x) => x === 30000).length, 1);
  await call();
  await assert.rejects(call({ status: 429, retryAfterS: 30 }), stop("blocked"));
});

test("Retry-After 3600: blocked αμέσως", async () => {
  const { call } = rig();
  await assert.rejects(call({ status: 403, retryAfterS: 3600 }), stop("blocked"));
});

test("3 διαδοχικά 500 → errors· 2 και μετά 200 όχι", async () => {
  const a = rig();
  await a.call({ status: 500 }); await a.call({ status: 500 }); await a.call(); await a.call({ status: 500 }); await a.call({ status: 0 });
  await assert.rejects(a.call({ status: 502 }), stop("errors"));
});

test("404 δεν μετρά ως σφάλμα", async () => {
  const { call } = rig();
  for (let i = 0; i < 5; i++) await call({ status: 404 });
});

test("απόκριση 3,5× του μέσου → παύσεις 6–14″", async () => {
  const { call, sleeps } = rig();
  for (let i = 0; i < 10; i++) await call({ ms: 200 });
  await call({ ms: 700 });
  const n = sleeps.length;
  for (let i = 0; i < 5; i++) await call({ ms: 200 });
  for (const x of sleeps.slice(n, n + 1)) assert.ok(x >= 6000 && x <= 14000, String(x));
});
