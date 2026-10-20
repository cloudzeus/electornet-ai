import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, cmpVersion, cvss3Score, depsSummary, fixedVersion, mapOsv, parseLock, toOsvQueries, vulnLevel, type OsvVuln } from "./osv";

const LOCK = {
  name: "euronics-redesign", lockfileVersion: 3,
  packages: {
    "": { name: "euronics-redesign", version: "0.1.0", dependencies: { next: "16.2.0" }, devDependencies: { typescript: "5" } },
    "node_modules/next": { version: "16.2.0" },
    "node_modules/typescript": { version: "5.9.2", dev: true },
    "node_modules/@scope/pkg": { version: "1.0.0" },
    "node_modules/a/node_modules/@scope/pkg": { version: "2.0.0" },
    "node_modules/b/node_modules/next": { version: "16.2.0" },
    "node_modules/fsevents": { version: "2.3.3", devOptional: true, optional: true },
    "node_modules/alias": { name: "real-pkg", version: "3.1.0" },
    "node_modules/local": { resolved: "packages/local", link: true },
    "node_modules/eslint": { version: "9.0.0", dev: true, optional: true },
  },
};

test("parseLock: αγνοεί τη ρίζα, τα dev και τα links· κρατά devOptional (μπαίνει στην παραγωγή)· μοναδικά name@version", () => {
  assert.deepEqual(parseLock(LOCK), [
    { name: "@scope/pkg", version: "1.0.0" },
    { name: "@scope/pkg", version: "2.0.0" },
    { name: "fsevents", version: "2.3.3" },
    { name: "next", version: "16.2.0" },
    { name: "real-pkg", version: "3.1.0" },
  ]);
});

test("parseLock: lockfile χωρίς «packages» → σφάλμα (όχι κενή λίστα = ψευδές «καμία ευπάθεια»)", () => {
  assert.throws(() => parseLock({ lockfileVersion: 1, dependencies: {} }), /packages/);
  assert.throws(() => parseLock(null), /packages/);
});

test("toOsvQueries / chunks: ερωτήματα npm σε παρτίδες των 1.000", () => {
  assert.deepEqual(toOsvQueries([{ name: "next", version: "16.2.0" }]), [{ package: { name: "next", ecosystem: "npm" }, version: "16.2.0" }]);
  const parts = chunks(Array.from({ length: 2345 }, (_, i) => i));
  assert.deepEqual(parts.map((p) => p.length), [1000, 1000, 345]);
});

test("cvss3Score: γνωστά vectors", () => {
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"), 9.8);
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H"), 7.2);
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"), 10);
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"), 6.1);
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N"), 0);
  assert.equal(cvss3Score("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"), null);
  assert.equal(cvss3Score("garbage"), null);
});

test("vulnLevel: database_specific.severity πρώτα, μετά CVSS v3· αλλιώς null", () => {
  assert.equal(vulnLevel({ id: "x", database_specific: { severity: "MODERATE" }, severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] }), "MODERATE");
  assert.equal(vulnLevel({ id: "x", severity: [{ type: "CVSS_V3", score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }] }), "CRITICAL");
  assert.equal(vulnLevel({ id: "x", affected: [{ database_specific: { severity: "high" } }] }), "HIGH");
  assert.equal(vulnLevel({ id: "x", severity: [{ type: "CVSS_V4", score: "CVSS:4.0/AV:N" }] }), null);
});

test("cmpVersion / fixedVersion: η μικρότερη διόρθωση πάνω από την εγκατεστημένη", () => {
  assert.equal(cmpVersion("1.2.10", "1.2.9"), 1);
  assert.equal(cmpVersion("2.0.0-rc.1", "2.0.0"), -1);
  assert.equal(cmpVersion("16.2.0", "16.2.0"), 0);
  const v: OsvVuln = { id: "GHSA-1", affected: [
    { package: { name: "next", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "14.2.30" }] }, { type: "SEMVER", events: [{ introduced: "15.0.0" }, { fixed: "15.4.7" }] }, { type: "SEMVER", events: [{ introduced: "16.0.0" }, { fixed: "16.2.3" }] }] },
    { package: { name: "other", ecosystem: "npm" }, ranges: [{ events: [{ fixed: "16.2.1" }] }] },
  ] };
  assert.equal(fixedVersion(v, { name: "next", version: "16.2.0" }), "16.2.3");
  assert.equal(fixedVersion(v, { name: "next", version: "17.0.0" }), null);
});

// δείγμα όπως το επιστρέφει το OSV (/v1/vulns/{id}), περικομμένο
const CRIT: OsvVuln = { id: "GHSA-crit-0000-0001", summary: "RCE", aliases: ["CVE-2026-1"], database_specific: { severity: "CRITICAL" }, affected: [{ package: { name: "next", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced: "16.0.0" }, { fixed: "16.2.3" }] }] }] };
const HIGH: OsvVuln = { id: "GHSA-high-0000-0002", summary: "Prototype pollution", database_specific: { severity: "HIGH" }, affected: [{ package: { name: "lodash", ecosystem: "npm" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }] };
const LOW: OsvVuln = { id: "GHSA-low-0000-0003", summary: "ReDoS", database_specific: { severity: "LOW" }, affected: [{ package: { name: "ms", ecosystem: "npm" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "2.0.0" }] }] }] };

test("mapOsv: CRITICAL → critical, HIGH → warn, LOW → κανένα εύρημα (μόνο στη σύνοψη)· τεκμήριο με id + έκδοση διόρθωσης", () => {
  const { findings, tally } = mapOsv([
    { pkg: { name: "next", version: "16.2.0" }, vulns: [CRIT] },
    { pkg: { name: "lodash", version: "4.17.15" }, vulns: [HIGH] },
    { pkg: { name: "ms", version: "1.0.0" }, vulns: [LOW] },
    { pkg: { name: "react", version: "19.2.0" }, vulns: [] },
  ]);
  assert.deepEqual(findings.map((f) => f.severity), ["critical", "warn"]);
  assert.equal(findings[0].evidence, "next@16.2.0: GHSA-crit-0000-0001");
  assert.match(findings[0].detail, /GHSA-crit-0000-0001 \(Critical, διόρθωση 16\.2\.3\)/);
  assert.match(findings[0].detail, /Αναβάθμιση τουλάχιστον στην 16\.2\.3/);
  assert.equal(findings[1].evidence, "lodash@4.17.15: GHSA-high-0000-0002");
  assert.deepEqual(tally, { packages: 4, vulnerable: 3, byLevel: { CRITICAL: 1, HIGH: 1, MODERATE: 0, LOW: 1, UNKNOWN: 0, MALICIOUS: 0 } });
  assert.match(depsSummary(tally, { lockPath: "package-lock.json", detailsRead: 3, detailsWanted: 3 }), /4 πακέτα παραγωγής.*3 με γνωστές ευπάθειες: 1 Critical, 1 High, 0 Moderate, 1 Low/);
});

test("mapOsv: ένα εύρημα ανά πακέτο με τη χειρότερη σοβαρότητα· χωρίς λεπτομέρειες → warn «άγνωστη σοβαρότητα»· withdrawn αγνοείται", () => {
  const { findings, tally } = mapOsv([
    { pkg: { name: "next", version: "16.2.0" }, vulns: [{ ...HIGH, affected: CRIT.affected }, CRIT] },
    { pkg: { name: "x", version: "1.0.0" }, vulns: [{ id: "GHSA-nodetails-1" }] },
    { pkg: { name: "y", version: "1.0.0" }, vulns: [{ ...CRIT, id: "GHSA-gone", withdrawn: "2026-01-01T00:00:00Z" }] },
  ]);
  assert.equal(findings.length, 2);
  assert.equal(findings[0].severity, "critical");
  assert.equal(findings[0].evidence, "next@16.2.0: GHSA-crit-0000-0001");
  assert.match(findings[0].detail, /GHSA-crit-0000-0001 \(Critical, διόρθωση 16\.2\.3\).* · GHSA-high-0000-0002 \(High, διόρθωση 16\.2\.3\)/);
  assert.equal(findings[1].severity, "warn");
  assert.match(findings[1].title, /άγνωστης σοβαρότητας/);
  assert.equal(findings[1].evidence, "x@1.0.0: GHSA-nodetails-1");
  assert.equal(tally.vulnerable, 2);
});

test("mapOsv: κακόβουλο πακέτο (MAL-…) → critical", () => {
  const { findings } = mapOsv([{ pkg: { name: "evil", version: "0.0.1" }, vulns: [{ id: "MAL-2026-1234", summary: "Malicious code in evil (npm)" }] }]);
  assert.equal(findings[0].severity, "critical");
  assert.match(findings[0].title, /Κακόβουλο πακέτο/);
});

test("mapOsv: το τεκμήριο (→ fingerprint) δεν αλλάζει όταν αλλάζουν επίπεδα / διορθώσεις / δευτερεύουσες ευπάθειες", () => {
  const a = mapOsv([{ pkg: { name: "next", version: "16.2.0" }, vulns: [CRIT] }]).findings[0];
  const b = mapOsv([{ pkg: { name: "next", version: "16.2.0" }, vulns: [CRIT, HIGH] }]).findings[0];
  assert.equal(a.evidence, b.evidence);
});
