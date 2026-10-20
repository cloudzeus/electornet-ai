import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySettingsChanges, settingsSensitive, settingsSummary, type SettingsAudit } from "./settings-core";

const since = new Date("2026-10-19T06:00:00Z");
const inWin = new Date("2026-10-19T12:00:00Z");
const emailOf = { s1: "boss@x.gr", s2: "mary@x.gr" };
const upd = (section: string, o: Partial<SettingsAudit> = {}): SettingsAudit => ({ action: "settings.update", entityId: section, staffId: "s2", createdAt: inWin, before: { gtm: "GTM-OLD" }, after: { gtm: "GTM-NEW", _secretsSet: [] }, ...o });
const run = (over: Partial<Parameters<typeof classifySettingsChanges>[0]> = {}) => classifySettingsChanges({ since, audits: [], settings: [], apiKeys: [], emailOf, ...over });

test("settingsSensitive: analytics/πληρωμές critical-capable, οι άλλες ενότητες warn, δοκιμές/ανάκληση όχι", () => {
  assert.deepEqual(settingsSensitive("settings.update", "analytics"), { label: "Analytics & pixels", critical: true });
  assert.deepEqual(settingsSensitive("settings.update", "payments"), { label: "Πληρωμές", critical: true });
  for (const s of ["email", "softone", "shipping", "security", "social-login", "bunny"]) assert.equal(settingsSensitive("settings.update", s)?.critical, false, s);
  assert.equal(settingsSensitive("settings.update", "κάτι-νέο")?.critical, false);
  assert.deepEqual(settingsSensitive("apikey.create", "k1"), { label: "API keys", critical: false });
  assert.equal(settingsSensitive("settings.test", "email"), null);
  assert.equal(settingsSensitive("apikey.revoke", "k1"), null);
  assert.equal(settingsSensitive("cms.home.publish", "x"), null);
});

test("analytics από λογαριασμό χωρίς προηγούμενη αλλαγή analytics στις 90 ημέρες → critical, με τις τιμές πριν/μετά", () => {
  const out = run({ audits: [upd("analytics")] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.match(out[0].detail, /mary@x\.gr/);
  assert.match(out[0].detail, /GTM-OLD.*GTM-NEW/);
  assert.equal(out[0].evidence, "analytics · mary@x.gr · gtm");
});

test("analytics από λογαριασμό που το είχε ξανακάνει στις 90 ημέρες → warn· προηγούμενη ενέργεια άλλου λογαριασμού δεν μετρά", () => {
  const prev = upd("analytics", { createdAt: new Date("2026-09-10T10:00:00Z") });
  assert.deepEqual(run({ audits: [prev, upd("analytics")] }).map((f) => f.severity), ["warn"]);
  assert.deepEqual(run({ audits: [{ ...prev, staffId: "s1" }, upd("analytics")] }).map((f) => f.severity), ["critical"]);
});

test("δύο αλλαγές πληρωμών από τον ίδιο νέο λογαριασμό στο παράθυρο → ένα critical", () => {
  const out = run({ audits: [upd("payments", { before: { vivaMerchant: "a" }, after: { vivaMerchant: "b", _secretsSet: ["vivaApiKey"] } }), upd("payments", { createdAt: new Date("2026-10-19T13:00:00Z"), before: { vivaMerchant: "b" }, after: { vivaMerchant: "b", vivaEnv: "live", _secretsSet: [] } })] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.match(out[0].detail, /vivaApiKey/);
  assert.match(out[0].detail, /2 αλλαγές/);
  assert.doesNotMatch(out[0].detail, /"b"/, "τιμές μόνο για analytics");
});

test("άλλη ενότητα (email, SoftOne, couriers, ασφάλεια) → warn με τα κλειδιά που άλλαξαν και τα μυστικά", () => {
  const out = run({ audits: [upd("email", { before: { fromEmail: "a@x.gr" }, after: { fromEmail: "b@x.gr", _secretsSet: ["smtpPass"] } })] });
  assert.deepEqual(out.map((f) => [f.severity, f.evidence]), [["warn", "email · mary@x.gr · fromEmail"]]);
  assert.match(out[0].detail, /smtpPass/);
});

test("ενέργειες εκτός παραθύρου δεν είναι ευρήματα· δοκιμές σύνδεσης αγνοούνται", () => {
  assert.deepEqual(run({ audits: [upd("analytics", { createdAt: new Date("2026-10-01T00:00:00Z") }), upd("email", { action: "settings.test" })] }), []);
});

test("ρύθμιση που άλλαξε χωρίς εγγραφή στο ιστορικό → critical για analytics/πληρωμές, warn για τις άλλες· με εγγραφή → τίποτα επιπλέον", () => {
  const out = run({ settings: [{ section: "analytics", updatedAt: inWin, updatedById: null }, { section: "email", updatedAt: inWin, updatedById: "s1" }, { section: "bunny", updatedAt: new Date("2026-10-01T00:00:00Z"), updatedById: null }] });
  assert.deepEqual(out.map((f) => [f.severity, f.evidence]), [["critical", "analytics"], ["warn", "email"]]);
  assert.match(out[0].title, /χωρίς εγγραφή/);
  assert.match(out[1].detail, /boss@x\.gr/);
  const audited = run({ audits: [upd("analytics", { staffId: "s1", createdAt: new Date(inWin.getTime() + 300) })], settings: [{ section: "analytics", updatedAt: inWin, updatedById: "s1" }] });
  assert.equal(audited.length, 1);
  assert.doesNotMatch(audited[0].title, /χωρίς εγγραφή/);
});

test("API keys: νέο με εγγραφή → warn· νέο χωρίς εγγραφή → critical· ανάκληση → τίποτα", () => {
  const key = { id: "k1", name: "ERP", prefix: "ek_abc12", createdAt: inWin };
  const a = run({ audits: [{ action: "apikey.create", entityId: "k1", staffId: "s1", createdAt: inWin, before: null, after: { name: "ERP", scopes: ["orders.read"], prefix: "ek_abc12" } }], apiKeys: [key] });
  assert.deepEqual(a.map((f) => [f.severity, f.evidence]), [["warn", "ERP (ek_abc12)"]]);
  const b = run({ apiKeys: [key] });
  assert.deepEqual(b.map((f) => f.severity), ["critical"]);
  assert.deepEqual(run({ audits: [{ action: "apikey.revoke", entityId: "k1", staffId: "s1", createdAt: inWin, before: null, after: { name: "ERP", active: false } }] }), []);
});

test("settingsSummary: πλήθη αλλαγών, ενότητες και ιστορικό 90 ημερών", () => {
  const s = settingsSummary({ since, audits: [upd("analytics"), upd("email"), upd("analytics", { createdAt: new Date("2026-09-10T10:00:00Z") })], settings: [{ section: "analytics", updatedAt: inWin, updatedById: null }], apiKeys: [] });
  assert.match(s, /2 αλλαγές ρυθμίσεων/);
  assert.match(s, /analytics, email/);
  assert.match(s, /90 ημερών/);
});
