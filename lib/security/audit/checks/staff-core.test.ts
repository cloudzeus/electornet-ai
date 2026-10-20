import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStaffChanges, auditsFromFor, staffSnapshot, baselineFrom, sensitivePermission, staffSummary, type StaffRow, type RoleRow, type StaffAudit } from "./staff-core";

const since = new Date("2026-10-19T06:00:00Z");
const old = new Date("2026-01-01T00:00:00Z");
const inWin = new Date("2026-10-19T12:00:00Z");
const roles: RoleRow[] = [
  { id: "r-sa", key: "super-admin", permissions: ["*"] },
  { id: "r-ad", key: "admin", permissions: ["catalog.*", "staff.read", "settings.write"] },
  { id: "r-mk", key: "marketing", permissions: ["cms.zones.write"] },
];
const boss: StaffRow = { id: "s1", email: "boss@x.gr", active: true, createdAt: old, roles: ["super-admin"] };
const mary: StaffRow = { id: "s2", email: "mary@x.gr", active: true, createdAt: old, roles: ["marketing"] };
const base = staffSnapshot([boss, mary], roles, since);
const run = (over: Partial<Parameters<typeof classifyStaffChanges>[0]> = {}) => classifyStaffChanges({ since, staff: [boss, mary], roles, audits: [], baseline: base, ...over });
const audit = (a: Partial<StaffAudit>): StaffAudit => ({ action: "staff.update", entityId: "s2", staffId: "s1", createdAt: inWin, before: null, after: null, ...a });

test("sensitivePermission: staff.* / settings.* / * — όχι τα υπόλοιπα", () => {
  for (const k of ["*", "staff.*", "staff.write", "staff.roles.write", "settings.*", "settings.integrations.write"]) assert.ok(sensitivePermission(k), k);
  for (const k of ["catalog.*", "cms.zones.write", "security.read", "staffing.x"]) assert.ok(!sensitivePermission(k), k);
});

test("τίποτα δεν άλλαξε → κανένα εύρημα", () => {
  assert.deepEqual(run(), []);
  assert.deepEqual(run({ baseline: null }), []);
});

test("νέος λογαριασμός στο παράθυρο → critical· με/χωρίς εγγραφή staff.create στο ιστορικό", () => {
  const eve: StaffRow = { id: "s3", email: "eve@x.gr", active: true, createdAt: inWin, roles: [] };
  const a = run({ staff: [boss, mary, eve], audits: [audit({ action: "staff.create", entityId: "s3", after: { email: "eve@x.gr", roleIds: [] } })] });
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, "critical");
  assert.equal(a[0].evidence, "eve@x.gr");
  assert.match(a[0].detail, /boss@x\.gr/);
  const b = run({ staff: [boss, mary, eve], baseline: null });
  assert.equal(b[0].severity, "critical");
  assert.match(b[0].detail, /χωρίς εγγραφή/i);
});

test("νέος λογαριασμός με ρόλους: οι ρόλοι στο ίδιο εύρημα· με super-admin επιπλέον «Νέος super-admin»", () => {
  const eve: StaffRow = { id: "s3", email: "eve@x.gr", active: true, createdAt: inWin, roles: ["marketing"] };
  const a = run({ staff: [boss, mary, eve], audits: [audit({ action: "staff.create", entityId: "s3", after: { roleIds: ["r-mk"] } })] });
  assert.deepEqual(a.map((f) => f.title), ["Νέος λογαριασμός διαχείρισης"]);
  assert.match(a[0].detail, /marketing/);
  const b = run({ staff: [boss, mary, { ...eve, roles: ["super-admin"] }] });
  assert.deepEqual(b.map((f) => [f.severity, f.title]), [["critical", "Νέος λογαριασμός διαχείρισης"], ["critical", "Νέος super-admin"]]);
});

test("λογαριασμός που δεν υπήρχε στο στιγμιότυπο (δημιουργία παλαιότερη από το παράθυρο) → critical", () => {
  const eve: StaffRow = { id: "s3", email: "eve@x.gr", active: true, createdAt: new Date("2026-10-18T00:00:00Z"), roles: [] };
  const out = run({ staff: [boss, mary, eve] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
});

test("νέος super-admin από το στιγμιότυπο (αλλαγή απευθείας στη βάση) → critical, ένα εύρημα", () => {
  const out = run({ staff: [boss, { ...mary, roles: ["marketing", "super-admin"] }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.equal(out[0].evidence, "mary@x.gr → super-admin");
  assert.match(out[0].detail, /χωρίς εγγραφή/i);
});

test("νέος super-admin από το ιστορικό (χωρίς στιγμιότυπο) και από τα δύο μαζί → ένα critical", () => {
  const a = audit({ before: { roleIds: ["r-mk"], active: true }, after: { roleIds: ["r-mk", "r-sa"], active: true } });
  const viaAudit = run({ baseline: null, audits: [a] });
  assert.equal(viaAudit.length, 1);
  assert.equal(viaAudit[0].severity, "critical");
  const both = run({ staff: [boss, { ...mary, roles: ["marketing", "super-admin"] }], audits: [a] });
  assert.equal(both.length, 1);
  assert.match(both[0].detail, /boss@x\.gr/);
  assert.doesNotMatch(both[0].detail, /χωρίς εγγραφή/i);
});

test("νέος (μη super-admin) ρόλος σε χρήστη → warn", () => {
  const out = run({ staff: [boss, { ...mary, roles: ["marketing", "admin"] }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "warn");
  assert.equal(out[0].evidence, "mary@x.gr → admin");
});

test("δικαίωμα staff.*/settings.* σε ρόλο → critical· άλλο δικαίωμα → warn· από ιστορικό ή στιγμιότυπο, ένα εύρημα ανά ρόλο", () => {
  const r2 = roles.map((r) => (r.key === "marketing" ? { ...r, permissions: ["cms.zones.write", "settings.write", "catalog.read"] } : r));
  const out = run({ roles: r2, audits: [audit({ action: "role.permissions.update", entityId: "r-mk", before: { key: "marketing", permissions: ["cms.zones.write"] }, after: { key: "marketing", permissions: ["catalog.read", "cms.zones.write", "settings.write"] } })] });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.equal(out[0].evidence, "marketing: +catalog.read, +settings.write");
  const mild = run({ roles: roles.map((r) => (r.key === "marketing" ? { ...r, permissions: ["cms.zones.write", "catalog.read"] } : r)) });
  assert.equal(mild.length, 1);
  assert.equal(mild[0].severity, "warn");
  assert.match(mild[0].detail, /χωρίς εγγραφή/i);
});

test("νέος ρόλος → warn (και critical αν φέρνει ευαίσθητο δικαίωμα)· διαγραφή ρόλου → warn", () => {
  const withNew = [...roles, { id: "r-x", key: "ops", permissions: ["orders.read"] }];
  const a = run({ roles: withNew, audits: [audit({ action: "role.create", entityId: "r-x", after: { key: "ops", name: "Ops" } })] });
  assert.deepEqual(a.map((f) => f.severity), ["warn"]);
  const b = run({ roles: [...roles, { id: "r-y", key: "ghost", permissions: ["staff.read"] }] });
  assert.ok(b.some((f) => f.severity === "critical" && f.evidence === "ghost: +staff.read"));
  const del = run({ audits: [audit({ action: "role.delete", entityId: "r-z", before: { key: "old", name: "Old" } })] });
  assert.deepEqual(del.map((f) => [f.severity, f.evidence]), [["warn", "old"]]);
});

test("επανενεργοποίηση → warn· αλλαγή κωδικού από άλλον → warn, από τον ίδιο → τίποτα", () => {
  const re = run({ baseline: staffSnapshot([boss, { ...mary, active: false }], roles, since) });
  assert.deepEqual(re.map((f) => [f.severity, f.evidence]), [["warn", "mary@x.gr"]]);
  const pw = run({ audits: [audit({ before: { roleIds: ["r-mk"], active: true }, after: { roleIds: ["r-mk"], active: true, passwordChanged: true } })] });
  assert.equal(pw.length, 1);
  assert.equal(pw[0].severity, "warn");
  assert.match(pw[0].title, /κωδικ/i);
  const self = run({ audits: [audit({ staffId: "s2", before: { roleIds: ["r-mk"], active: true }, after: { roleIds: ["r-mk"], active: true, passwordChanged: true } })] });
  assert.deepEqual(self, []);
});

test("αφαιρέσεις (ρόλων, δικαιωμάτων, λογαριασμών) δεν είναι ευρήματα", () => {
  const out = run({ staff: [boss, { ...mary, roles: [] }], roles: roles.map((r) => (r.key === "admin" ? { ...r, permissions: [] } : r)) });
  assert.deepEqual(out, []);
});

test("ενέργειες εκτός παραθύρου αγνοούνται", () => {
  const out = run({ baseline: null, audits: [audit({ createdAt: old, before: { roleIds: [] }, after: { roleIds: ["r-sa"] } })] });
  assert.deepEqual(out, []);
});

test("baselineFrom: βρίσκει το snapshot του ελέγχου staff στα checks ενός report, αλλιώς null", () => {
  const snap = staffSnapshot([boss], roles, since);
  assert.deepEqual(baselineFrom([{ key: "logins" }, { key: "staff", snapshot: snap }]), snap);
  assert.equal(baselineFrom([{ key: "staff" }]), null);
  assert.equal(baselineFrom(null), null);
  assert.equal(baselineFrom([{ key: "staff", snapshot: { staff: "x" } }]), null);
});

test("staffSummary: πλήθη, super-admin, παράθυρο και βάση σύγκρισης", () => {
  const s = staffSummary({ since, staff: [boss, mary, { ...mary, id: "s9", email: "off@x.gr", active: false }], roles, audits: [audit({})], baseline: base });
  assert.match(s, /3 λογαριασμοί \(2 ενεργοί\)/);
  assert.match(s, /super-admin: boss@x\.gr/);
  assert.match(s, /3 ρόλοι/);
  assert.match(s, /1 ενέργειες/);
  assert.match(s, /στιγμιότυπο/);
  assert.match(staffSummary({ since, staff: [boss], roles, audits: [], baseline: null }), /χωρίς προηγούμενο στιγμιότυπο/);
});

test("C-1 drift: super-admin που δημιουργήθηκε 09:30 και αναφέρθηκε στις 10:00 → ο έλεγχος των 11:00 δεν το ξαναβγάζει", () => {
  const eve: StaffRow = { id: "s3", email: "eve@x.gr", active: true, createdAt: new Date("2026-10-20T06:30:00Z"), roles: ["super-admin"] };
  const snap10 = staffSnapshot([boss, mary, eve], roles, new Date("2026-10-20T07:00:00.250Z")); // report των 10:00 (+250 ms)
  const since = new Date("2026-10-20T06:58:00Z"); // light: 10:00 − 2′
  const out = classifyStaffChanges({
    since, auditsFrom: since, staff: [boss, mary, eve], roles, baseline: snap10,
    audits: [audit({ action: "staff.create", entityId: "s3", createdAt: new Date("2026-10-20T06:30:00Z"), after: { roleIds: ["r-sa"] } })],
  });
  assert.deepEqual(out, []);
});

test("C-1: audits από το νωρίτερο του (since, στιγμιότυπο) — αλλαγή μετά το στιγμιότυπο αλλά πριν από το since έχει εγγραφή, όχι «εκτός διαχείρισης»", () => {
  const since = new Date("2026-10-20T07:00:00Z");
  const snap = staffSnapshot([boss, mary], roles, new Date("2026-10-20T06:00:00Z"));
  const out = classifyStaffChanges({
    since, auditsFrom: new Date("2026-10-20T06:00:00Z"), roles, baseline: snap,
    staff: [boss, { ...mary, roles: ["marketing", "super-admin"] }],
    audits: [audit({ createdAt: new Date("2026-10-20T06:30:00Z"), before: { roleIds: ["r-mk"] }, after: { roleIds: ["r-mk", "r-sa"] } })],
  });
  assert.equal(out.length, 1);
  assert.doesNotMatch(out[0].detail, /χωρίς εγγραφή/i);
  assert.match(out[0].detail, /boss@x\.gr/);
});

test("I-3: δικαιώματα στον super-admin → warn (έχει ήδη «*»)", () => {
  const out = run({ roles: roles.map((r) => (r.key === "super-admin" ? { ...r, permissions: ["*", "settings.write", "security.audit"] } : r)) });
  assert.deepEqual(out.map((f) => f.severity), ["warn"]);
  assert.match(out[0].title, /super-admin/);
});

test("I-3: κλειδί που δεν είχε κανένας ρόλος (νέο δικαίωμα της εφαρμογής, από seed) → warn «ενημέρωση εφαρμογής»", () => {
  const out = run({ roles: roles.map((r) => (r.key === "admin" ? { ...r, permissions: [...r.permissions, "settings.backup.write"] } : r)) });
  assert.deepEqual(out.map((f) => [f.severity, f.title]), [["warn", "Νέο δικαίωμα από ενημέρωση εφαρμογής"]]);
});

test("I-3: υπάρχον ευαίσθητο κλειδί σε ρόλο (όχι super-admin) χωρίς εγγραφή → critical· μαζί με νέο κλειδί → ένα critical", () => {
  const out = run({ roles: roles.map((r) => (r.key === "marketing" ? { ...r, permissions: [...r.permissions, "settings.write", "settings.backup.write"] } : r)) });
  assert.equal(out.length, 1);
  assert.equal(out[0].severity, "critical");
  assert.match(out[0].detail, /settings\.write/);
  assert.match(out[0].detail, /ενημέρωση/);
});

test("auditsFromFor: το νωρίτερο από since και στιγμιότυπο", () => {
  const snap = staffSnapshot([boss], roles, new Date("2026-10-19T05:00:00Z"));
  assert.equal(auditsFromFor(since, snap).toISOString(), "2026-10-19T05:00:00.000Z");
  assert.equal(auditsFromFor(since, staffSnapshot([boss], roles, new Date("2026-10-19T07:00:00Z"))).toISOString(), since.toISOString());
  assert.equal(auditsFromFor(since, null).toISOString(), since.toISOString());
});
