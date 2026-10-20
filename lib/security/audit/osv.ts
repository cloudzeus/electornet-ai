import type { Finding, Severity } from "./rules";

/**
 * Βιβλιοθήκες με γνωστές ευπάθειες — καθαρή λογική (ΚΑΘΑΡΟ αρχείο: χωρίς Node / prisma). Πηγή: OSV (osv.dev, η επίσημη
 * δωρεάν βάση της Google/OpenSSF που ενώνει GitHub Advisories, NVD και τη λίστα κακόβουλων πακέτων της OpenSSF).
 *   1) parseLock: τα πακέτα του package-lock.json (lockfile v2/v3, πεδίο `packages`) — μόνο όσα μπαίνουν σε παραγωγή
 *      (χωρίς `dev: true`, χωρίς τη ρίζα, χωρίς links).
 *   2) toOsvQueries → POST /v1/querybatch (παρτίδες 1.000)· η απάντηση δίνει μόνο ids ευπαθειών ανά πακέτο.
 *   3) Λεπτομέρειες (/v1/vulns/{id}) μόνο για όσα ids βρέθηκαν → σοβαρότητα + έκδοση διόρθωσης.
 *   4) mapOsv: CRITICAL → critical, HIGH → warn, MODERATE/LOW → μόνο στη σύνοψη· κακόβουλο πακέτο (MAL-…) → critical·
 *      χωρίς λεπτομέρειες ή χωρίς βαθμολογία → warn «άγνωστη σοβαρότητα» (ποτέ σιωπηλό ok).
 */

export type LockPkg = { name: string; version: string };
export type OsvQuery = { package: { name: string; ecosystem: "npm" }; version: string };
export type OsvRange = { type?: string; events?: { introduced?: string; fixed?: string; last_affected?: string }[] };
export type OsvVuln = {
  id: string;
  summary?: string;
  aliases?: string[];
  withdrawn?: string | null;
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string } & Record<string, unknown>;
  affected?: { package?: { name?: string; ecosystem?: string }; ranges?: OsvRange[]; database_specific?: { severity?: string } & Record<string, unknown> }[];
};
/** Ένα πακέτο με τις ευπάθειές του: πλήρεις λεπτομέρειες ή μόνο `{ id }` όταν δεν διαβάστηκαν. */
export type OsvEntry = { pkg: LockPkg; vulns: OsvVuln[] };
export type Level = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export const OSV_BATCH = 1000;
/** Πόσες λεπτομέρειες ευπαθειών διαβάζονται το πολύ (οι υπόλοιπες → «άγνωστη σοβαρότητα»). */
export const OSV_MAX_DETAILS = 50;

/** Τα πακέτα παραγωγής του package-lock.json (μοναδικά name@version, ταξινομημένα). */
export function parseLock(lock: unknown): LockPkg[] {
  const pk = (lock && typeof lock === "object" ? (lock as { packages?: unknown }).packages : null) as Record<string, Record<string, unknown>> | null;
  if (!pk || typeof pk !== "object") throw new Error("Το package-lock.json δεν έχει πεδίο «packages» (χρειάζεται lockfile v2/v3).");
  const out = new Map<string, LockPkg>();
  for (const [path, p] of Object.entries(pk)) {
    if (!path || !p || typeof p !== "object") continue; // "" = το ίδιο το project
    if (p.dev === true || p.link === true) continue;
    const version = typeof p.version === "string" ? p.version : "";
    // ψευδώνυμο (npm:άλλο-πακέτο) → το πραγματικό όνομα είναι στο `name`
    const name = typeof p.name === "string" && p.name ? p.name : path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!name || !version) continue;
    out.set(`${name}@${version}`, { name, version });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export const toOsvQueries = (pkgs: LockPkg[]): OsvQuery[] => pkgs.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version }));

export function chunks<T>(xs: T[], n = OSV_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// ── CVSS v3.x βαθμολογία από το vector (όταν η βάση δεν δίνει έτοιμη σοβαρότητα) ────────────────────────────────────────
const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }, AC: { L: 0.77, H: 0.44 }, UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;
const roundUp = (x: number) => { const i = Math.round(x * 100000); return i % 10000 === 0 ? i / 100000 : (Math.floor(i / 10000) + 1) / 10; };
/** Base score CVSS 3.0/3.1 (null αν το vector δεν είναι έγκυρο). */
export function cvss3Score(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m = Object.fromEntries(vector.split("/").slice(1).map((p) => p.split(":") as [string, string]));
  const av = W.AV[m.AV as keyof typeof W.AV], ac = W.AC[m.AC as keyof typeof W.AC], ui = W.UI[m.UI as keyof typeof W.UI];
  const c = W.CIA[m.C as keyof typeof W.CIA], i = W.CIA[m.I as keyof typeof W.CIA], a = W.CIA[m.A as keyof typeof W.CIA];
  const changed = m.S === "C";
  if (m.S !== "U" && m.S !== "C") return null;
  const pr = m.PR === "N" ? 0.85 : m.PR === "L" ? (changed ? 0.68 : 0.62) : m.PR === "H" ? (changed ? 0.5 : 0.27) : undefined;
  if ([av, ac, ui, c, i, a, pr].some((v) => v === undefined)) return null;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) return 0;
  const expl = 8.22 * av * ac * pr! * ui;
  return roundUp(Math.min((changed ? 1.08 : 1) * (impact + expl), 10));
}
const levelOfScore = (s: number): Level | null => (s >= 9 ? "CRITICAL" : s >= 7 ? "HIGH" : s >= 4 ? "MODERATE" : s > 0 ? "LOW" : null);
const LEVELS: Record<string, Level> = { CRITICAL: "CRITICAL", HIGH: "HIGH", MODERATE: "MODERATE", MEDIUM: "MODERATE", LOW: "LOW" };

/** Σοβαρότητα: `database_specific.severity` (GitHub) → του affected → CVSS v3 vector · null = άγνωστη. */
export function vulnLevel(v: OsvVuln): Level | null {
  const named = [v.database_specific?.severity, ...(v.affected ?? []).map((a) => a.database_specific?.severity)]
    .map((s) => (typeof s === "string" ? LEVELS[s.trim().toUpperCase()] : undefined)).filter((x): x is Level => !!x);
  if (named.length) return named.sort((a, b) => RANK[b] - RANK[a])[0];
  const scores = (v.severity ?? []).filter((s) => /^CVSS_V3/.test(s.type)).map((s) => cvss3Score(s.score)).filter((x): x is number => x !== null);
  return scores.length ? levelOfScore(Math.max(...scores)) : null;
}
const RANK: Record<Level, number> = { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };

/** Σύγκριση εκδόσεων semver (1.2.10 > 1.2.9· προέκδοση < τελικής). */
export function cmpVersion(a: string, b: string): number {
  const split = (v: string) => { const s = v.replace(/^v/, "").split("+")[0]; const i = s.indexOf("-"); return { core: (i < 0 ? s : s.slice(0, i)).split(".").map((x) => Number(x) || 0), pre: i < 0 ? null : s.slice(i + 1) }; };
  const x = split(a), y = split(b);
  for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) { const d = (x.core[i] ?? 0) - (y.core[i] ?? 0); if (d) return Math.sign(d); }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre.localeCompare(y.pre, "en", { numeric: true });
}
/** Η μικρότερη έκδοση διόρθωσης μεγαλύτερη από την εγκατεστημένη (για το πακέτο αυτό) — null αν δεν υπάρχει. */
export function fixedVersion(v: OsvVuln, pkg: LockPkg): string | null {
  const fixes = (v.affected ?? []).filter((a) => !a.package?.name || a.package.name === pkg.name)
    .flatMap((a) => (a.ranges ?? []).flatMap((r) => (r.events ?? []).map((e) => e.fixed).filter((f): f is string => !!f)))
    .filter((f) => cmpVersion(f, pkg.version) > 0).sort(cmpVersion);
  return fixes[0] ?? null;
}

export type OsvTally = { packages: number; vulnerable: number; byLevel: Record<Level | "UNKNOWN" | "MALICIOUS", number> };

/**
 * Ευρήματα: ένα ανά πακέτο@έκδοση με τη χειρότερη σοβαρότητα των ευπαθειών του. Τεκμήριο: «πακέτο@έκδοση: id (επίπεδο,
 * διόρθωση x.y.z) · …» — χωρίς ό,τι αλλάζει (ημερομηνίες), ώστε το ίδιο εύρημα να κρατά το ίδιο fingerprint.
 */
export function mapOsv(entries: OsvEntry[]): { findings: Finding[]; tally: OsvTally } {
  const tally: OsvTally = { packages: entries.length, vulnerable: 0, byLevel: { CRITICAL: 0, HIGH: 0, MODERATE: 0, LOW: 0, UNKNOWN: 0, MALICIOUS: 0 } };
  const findings: Finding[] = [];
  for (const { pkg, vulns } of entries) {
    const live = vulns.filter((v) => !v.withdrawn);
    if (!live.length) continue;
    tally.vulnerable++;
    type Row = { id: string; level: Level | "UNKNOWN" | "MALICIOUS"; fix: string | null; summary?: string; known: boolean };
    const rows: Row[] = live.map((v) => {
      const known = !!(v.affected || v.severity || v.database_specific || v.summary);
      const level = /^MAL-/.test(v.id) ? "MALICIOUS" : (known ? vulnLevel(v) : null) ?? "UNKNOWN";
      return { id: v.id, level, fix: known ? fixedVersion(v, pkg) : null, summary: v.summary, known };
    });
    for (const r of rows) tally.byLevel[r.level]++;
    const sev = (r: Row): Severity => (r.level === "MALICIOUS" || r.level === "CRITICAL" ? "critical" : r.level === "HIGH" || r.level === "UNKNOWN" ? "warn" : "ok");
    const shown = rows.filter((r) => sev(r) !== "ok").sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.id.localeCompare(b.id));
    if (!shown.length) continue;
    const top = shown[0];
    const lbl = (r: Row) => `${r.id} (${LABEL[r.level]}${r.fix ? `, διόρθωση ${r.fix}` : r.known ? ", χωρίς διορθωμένη έκδοση" : ""})`;
    const id = `${pkg.name}@${pkg.version}`;
    const title = top.level === "MALICIOUS" ? "Κακόβουλο πακέτο στις βιβλιοθήκες"
      : top.level === "CRITICAL" ? "Βιβλιοθήκη με κρίσιμη ευπάθεια"
        : top.level === "HIGH" ? "Βιβλιοθήκη με σοβαρή ευπάθεια (High)" : "Βιβλιοθήκη με ευπάθεια άγνωστης σοβαρότητας";
    const fixes = [...new Set(shown.map((r) => r.fix).filter((f): f is string => !!f))].sort(cmpVersion);
    const detail = top.level === "MALICIOUS"
      ? `Το ${id} είναι καταχωρημένο ως κακόβουλο πακέτο (OpenSSF Malicious Packages, ${top.id}). Αφαιρέστε το αμέσως, ελέγξτε πώς μπήκε στο package-lock.json και θεωρήστε τον server εκτεθειμένο.`
      : `${id}: ${shown.map((r) => `${lbl(r)}${r.summary ? ` — ${r.summary}` : ""}`).join(" · ")}.${fixes.length ? ` Αναβάθμιση τουλάχιστον στην ${fixes[fixes.length - 1]}.` : ""}${shown.some((r) => r.level === "UNKNOWN") ? " Οι λεπτομέρειες κάποιων ευπαθειών δεν διαβάστηκαν ή δεν έχουν βαθμολογία — ελέγξτε τις στο osv.dev." : ""}`;
    findings.push({ severity: sev(top) as Finding["severity"], title, detail, evidence: `${id}: ${shown.map(lbl).join(" · ")}` });
  }
  return { findings, tally };
}
const ORDER: Record<string, number> = { MALICIOUS: 0, CRITICAL: 1, HIGH: 2, UNKNOWN: 3, MODERATE: 4, LOW: 5 };
const LABEL: Record<string, string> = { MALICIOUS: "κακόβουλο", CRITICAL: "Critical", HIGH: "High", UNKNOWN: "άγνωστη σοβαρότητα", MODERATE: "Moderate", LOW: "Low" };

const n = (x: number) => x.toLocaleString("el-GR");
/** Σύνοψη: τι εξετάστηκε και τι βρέθηκε (και τα Moderate/Low, που δεν γίνονται ευρήματα). */
export function depsSummary(t: OsvTally, extra: { lockPath: string; detailsRead: number; detailsWanted: number }): string {
  const b = t.byLevel;
  return [
    `${n(t.packages)} πακέτα παραγωγής από ${extra.lockPath} ελέγχθηκαν στο OSV (osv.dev)`,
    t.vulnerable ? `${n(t.vulnerable)} με γνωστές ευπάθειες: ${n(b.CRITICAL)} Critical, ${n(b.HIGH)} High, ${n(b.MODERATE)} Moderate, ${n(b.LOW)} Low${b.UNKNOWN ? `, ${n(b.UNKNOWN)} άγνωστης σοβαρότητας` : ""}${b.MALICIOUS ? `, ${n(b.MALICIOUS)} κακόβουλα` : ""}` : "καμία γνωστή ευπάθεια",
    ...(extra.detailsWanted > extra.detailsRead ? [`λεπτομέρειες για ${n(extra.detailsRead)} από ${n(extra.detailsWanted)} ευπάθειες (οι υπόλοιπες ως «άγνωστη σοβαρότητα»)`] : []),
    "τα devDependencies δεν περιλαμβάνονται· Moderate/Low μόνο στη σύνοψη",
  ].join(" · ");
}
