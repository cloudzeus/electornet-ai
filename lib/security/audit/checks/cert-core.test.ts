import { test } from "node:test";
import assert from "node:assert/strict";
import { certOutcome, issuerName } from "./cert-core";

const NOW = new Date("2026-10-20T07:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000 + 3_600_000).toUTCString().replace(/^\w+, /, "");
const base = { host: "euronics.dgsoft.gr", issuer: "Google Trust Services (WE1)", authorized: true, validFrom: "Oct  1 00:00:00 2026 GMT" };

test("certOutcome: > 21 ημέρες → ok, με εκδότη και ημέρες στη σύνοψη", () => {
  const r = certOutcome({ ...base, validTo: at(60) }, NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.findings, []);
  assert.match(r.summary, /Google Trust Services \(WE1\).*60 ημέρες ακόμη.*έγκυρο/);
});

test("certOutcome: < 21 ημέρες → warn· < 7 → critical· έληξε → critical (ένα εύρημα)", () => {
  assert.equal(certOutcome({ ...base, validTo: at(20) }, NOW).status, "warn");
  assert.equal(certOutcome({ ...base, validTo: at(7) }, NOW).status, "warn");
  assert.equal(certOutcome({ ...base, validTo: at(6) }, NOW).status, "critical");
  const exp = certOutcome({ ...base, validTo: at(-2), authorized: false, authError: "CERT_HAS_EXPIRED" }, NOW);
  assert.equal(exp.status, "critical");
  assert.deepEqual(exp.findings.map((f) => f.title), ["Το πιστοποιητικό έχει λήξει"]);
});

test("certOutcome: μη έγκυρη αλυσίδα / όνομα → critical ακόμη και με πολλές ημέρες", () => {
  const r = certOutcome({ ...base, validTo: at(80), authorized: false, authError: "ERR_TLS_CERT_ALTNAME_INVALID" }, NOW);
  assert.equal(r.status, "critical");
  assert.equal(r.findings[0].title, "Μη έγκυρο πιστοποιητικό");
  assert.match(r.summary, /ΜΗ έγκυρο/);
});

test("certOutcome: άκυρη ημερομηνία → error (όχι ok)", () => {
  assert.equal(certOutcome({ ...base, validTo: "κάτι" }, NOW).status, "error");
});

test("issuerName: O (CN)", () => {
  assert.equal(issuerName({ O: "Google Trust Services", CN: "WE1" }), "Google Trust Services (WE1)");
  assert.equal(issuerName({ CN: "R11" }), "R11");
  assert.equal(issuerName(undefined), "άγνωστος εκδότης");
});
