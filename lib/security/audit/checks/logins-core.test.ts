import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLogins, loginsSummary, uaFamily, FAIL_BURST, GUESS_FAILS, type LoginRow } from "./logins-core";

const since = new Date("2026-10-19T06:00:00Z"); // 09:00 Ελλάδας
const at = (iso: string) => new Date(iso);
const WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ev = (o: Partial<LoginRow>): LoginRow => ({ staffId: "s1", email: "boss@x.gr", success: true, reason: null, ip: "1.1.1.1", country: null, userAgent: WIN_CHROME, os: null, browser: null, at: at("2026-10-19T08:00:00Z"), ...o });
const hist = (o: Partial<LoginRow> = {}) => ev({ at: at("2026-09-01T08:00:00Z"), ...o });
const run = (events: LoginRow[], staffEmails = ["boss@x.gr", "mary@x.gr"]) => classifyLogins({ since, events, staffEmails });
const fails = (n: number, start: string, o: Partial<LoginRow> = {}, stepMin = 1) => Array.from({ length: n }, (_, i) => ev({ success: false, reason: "bad-password", at: new Date(at(start).getTime() + i * stepMin * 60_000), ...o }));

test("uaFamily: λειτουργικό + browser από τα πεδία ή το user agent", () => {
  assert.equal(uaFamily({ userAgent: WIN_CHROME, os: null, browser: null }), "Windows / Chrome");
  assert.equal(uaFamily({ userAgent: MAC_SAFARI, os: null, browser: null }), "macOS / Safari");
  assert.equal(uaFamily({ userAgent: IPHONE, os: null, browser: null }), "iOS / Safari");
  assert.equal(uaFamily({ userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0", os: null, browser: null }), "Windows / Edge");
  assert.equal(uaFamily({ userAgent: null, os: "Windows 11", browser: "Firefox 130" }), "Windows / Firefox");
  assert.equal(uaFamily({ userAgent: null, os: null, browser: null }), null);
});

test("γνωστή IP → κανένα εύρημα (ούτε χωρίς χώρα)", () => {
  assert.deepEqual(run([hist(), ev({})]), []);
});

test("νέα IP, ίδια συσκευή → warn· νέα IP και νέα συσκευή/browser → warn με ισχυρότερη διατύπωση", () => {
  const a = run([hist(), ev({ ip: "2.2.2.2" })]);
  assert.deepEqual(a.map((f) => [f.severity, f.title, f.evidence]), [["warn", "Σύνδεση από νέα IP", "boss@x.gr · 2.2.2.2"]]);
  const b = run([hist(), ev({ ip: "2.2.2.2", userAgent: IPHONE })]);
  assert.equal(b.length, 1);
  assert.equal(b[0].severity, "warn");
  assert.match(b[0].title, /νέα IP και νέα συσκευή/);
  assert.match(b[0].detail, /iOS \/ Safari/);
});

test("πρώτη σύνδεση λογαριασμού στις 90 ημέρες → warn νέα IP", () => {
  const out = run([ev({})]);
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "warn");
  assert.match(out[0].detail, /πρώτη/i);
});

test("με δεδομένα χώρας: επιτυχία από νέα χώρα → critical· γνωστή IP με άλλη χώρα → τίποτα", () => {
  const a = run([hist({ country: "GR" }), ev({ ip: "9.9.9.9", country: "NG" })]);
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, "critical");
  assert.match(a[0].title, /νέα χώρα/);
  assert.deepEqual(run([hist({ country: "GR" }), ev({ country: "NL" })]), []);
});

test("αποτυχίες που δεν μετρούν ως ιστορικό «γνωστής» IP", () => {
  const out = run([hist({ success: false, ip: "2.2.2.2" }), hist(), ev({ ip: "2.2.2.2" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Σύνδεση από νέα IP");
});

test(`> ${FAIL_BURST} αποτυχίες σε μία ώρα σε λογαριασμό διαχείρισης → critical· σε ανύπαρκτο λογαριασμό → warn· ${FAIL_BURST} → τίποτα`, () => {
  const a = run(fails(FAIL_BURST + 1, "2026-10-19T10:00:00Z", { ip: null }));
  assert.deepEqual(a.map((f) => [f.severity, f.evidence]), [["critical", "boss@x.gr"]]);
  assert.match(a[0].detail, /21 αποτυχίες/);
  const b = run(fails(FAIL_BURST + 1, "2026-10-19T10:00:00Z", { staffId: null, email: "admin@x.gr", reason: "unknown", ip: null }));
  assert.deepEqual(b.map((f) => f.severity), ["warn"]);
  assert.deepEqual(run(fails(FAIL_BURST, "2026-10-19T10:00:00Z", { ip: null })), []);
});

test("αποτυχίες απλωμένες σε > 1 ώρα δεν είναι έκρηξη· έκρηξη που τελείωσε πριν από το παράθυρο δεν αναφέρεται ξανά", () => {
  assert.deepEqual(run(fails(30, "2026-10-19T10:00:00Z", { ip: null }, 5)), []);
  assert.deepEqual(run(fails(30, "2026-10-18T10:00:00Z", { ip: null })), []);
});

test(`> ${FAIL_BURST} αποτυχίες από μία IP σε πολλούς λογαριασμούς → warn`, () => {
  const spray = Array.from({ length: FAIL_BURST + 1 }, (_, i) => ev({ success: false, staffId: null, email: `u${i}@x.gr`, reason: "unknown", ip: "6.6.6.6", at: new Date(at("2026-10-19T10:00:00Z").getTime() + i * 60_000) }));
  const out = run(spray);
  assert.deepEqual(out.map((f) => [f.severity, f.evidence]), [["warn", "6.6.6.6"]]);
});

test(`επιτυχία αμέσως μετά από ≥ ${GUESS_FAILS} αποτυχίες → critical· ${GUESS_FAILS - 1} → τίποτα· αποτυχίες πριν από προηγούμενη επιτυχία δεν μετρούν`, () => {
  const a = run([hist(), ...fails(GUESS_FAILS, "2026-10-19T10:00:00Z"), ev({ at: at("2026-10-19T10:10:00Z") })]);
  assert.deepEqual(a.map((f) => f.severity), ["critical"]);
  assert.match(a[0].title, /μετά από/);
  assert.match(a[0].detail, /γνωστή IP/);
  assert.deepEqual(run([hist(), ...fails(GUESS_FAILS - 1, "2026-10-19T10:00:00Z"), ev({ at: at("2026-10-19T10:10:00Z") })]), []);
  assert.deepEqual(run([hist(), ...fails(GUESS_FAILS, "2026-10-19T10:00:00Z"), ev({ at: at("2026-10-19T10:06:00Z") }), ev({ at: at("2026-10-19T10:20:00Z") })]).length, 1);
  // αποτυχίες πάνω από μία ώρα πριν → δεν μετρούν
  assert.deepEqual(run([hist(), ...fails(GUESS_FAILS, "2026-10-19T08:00:00Z"), ev({ at: at("2026-10-19T10:00:00Z") })]), []);
});

test("σύνδεση 23:00–07:00 ώρα Ελλάδας → warn, ένα εύρημα ανά λογαριασμό", () => {
  const out = run([hist(), ev({ at: at("2026-10-19T21:30:00Z") }), ev({ at: at("2026-10-20T03:00:00Z") })]); // 00:30 και 06:00 Ελλάδας
  assert.deepEqual(out.map((f) => [f.severity, f.evidence]), [["warn", "boss@x.gr"]]);
  assert.match(out[0].detail, /20\/10 00:30/);
  assert.deepEqual(run([hist(), ev({ at: at("2026-10-19T19:59:00Z") })]), []); // 22:59
});

test("loginsSummary: πλήθη, παράθυρο, ιστορικό και σημείωση όταν δεν καταγράφεται χώρα", () => {
  const events = [hist(), ev({}), ...fails(2, "2026-10-19T10:00:00Z")];
  const s = loginsSummary({ since, events });
  assert.match(s, /1 επιτυχείς και 2 αποτυχημένες/);
  assert.match(s, /90 ημερών: 1 επιτυχείς/);
  assert.match(s, /Δεν καταγράφεται χώρα — ο έλεγχος γίνεται ανά IP/);
  assert.doesNotMatch(loginsSummary({ since, events: [hist({ country: "GR" }), ev({ country: "GR" })] }), /Δεν καταγράφεται χώρα/);
});
