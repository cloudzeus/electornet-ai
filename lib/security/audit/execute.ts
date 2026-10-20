import { worst, type Finding, type Severity } from "./rules";
import type { AuditCtx, AuditMode, Check, StoredCheck } from "./types";

/**
 * Εκτέλεση ελέγχων χωρίς βάση (ΚΑΘΑΡΟ αρχείο — τα tests το τρέχουν χωρίς server). Κάθε έλεγχος τρέχει παράλληλα με τους
 * άλλους, με δικό του χρονικό όριο: σφάλμα ή λήξη ορίου → status "error", ΠΟΤΕ "ok". Η κατάσταση ενός ελέγχου δεν είναι
 * ποτέ καλύτερη από το χειρότερο εύρημά του.
 */

const HOUR = 3_600_000;
/** Αρχή του παραθύρου χωρίς ιστορικό: full = τελευταίες 24 ώρες, light = τελευταία ώρα. */
export const sinceFor = (mode: AuditMode, now: Date) => new Date(now.getTime() - (mode === "full" ? 24 : 1) * HOUR);
export const LIGHT_OVERLAP_MS = 2 * 60_000;
/**
 * Αρχή του παραθύρου του light: η έναρξη του προηγούμενου report μείον 2′ επικάλυψη, ώστε καθυστέρηση του cron να μην
 * αφήνει κενό. Χωρίς προηγούμενο (ή με ημερομηνία στο μέλλον) → −1 ώρα· ποτέ πιο πίσω από 24 ώρες (τα παλαιότερα τα
 * καλύπτει ο full).
 */
export function lightSince(prevStartedAt: Date | null, now: Date): Date {
  if (!prevStartedAt || prevStartedAt.getTime() > now.getTime()) return sinceFor("light", now);
  return new Date(Math.max(prevStartedAt.getTime() - LIGHT_OVERLAP_MS, now.getTime() - 24 * HOUR));
}
/**
 * Αρχή του παραθύρου του full: η έναρξη του προηγούμενου full μείον 2′ — αν ο cron άργησε ή χάθηκε μία μέρα, ο επόμενος
 * καλύπτει και το κενό — αλλά ΠΑΝΤΑ τουλάχιστον οι τελευταίες 24 ώρες (ένα «Τρέξε τώρα» λίγο πριν δεν στενεύει τον
 * ημερήσιο έλεγχο) και ποτέ πιο πίσω από 72 ώρες. Χωρίς προηγούμενο (ή με ημερομηνία στο μέλλον) → −24 ώρες.
 */
export const FULL_MAX_BACK_MS = 72 * HOUR;
export function fullSince(prevFullStart: Date | null, now: Date): Date {
  const day = sinceFor("full", now).getTime();
  if (!prevFullStart || prevFullStart.getTime() > now.getTime()) return new Date(day);
  return new Date(Math.max(now.getTime() - FULL_MAX_BACK_MS, Math.min(day, prevFullStart.getTime() - LIGHT_OVERLAP_MS)));
}
/**
 * Οι έλεγχοι που διαβάζουν «από το since» (ιστορικό ενεργειών, συνδέσεις, αλλαγές, περιεχόμενο / αρχεία που άλλαξαν). ΜΟΝΟ
 * αυτοί κρίνουν αν το παράθυρο ενός report καλύφθηκε — ένα σφάλμα στο site ή στον φύλακα δεν αφήνει κενό στο ιστορικό.
 */
export const WINDOW_CHECKS: readonly string[] = ["staff", "logins", "settings-changes", "content", "bunny"];
export function windowKeys(checks: Pick<Check, "key" | "modes">[], mode: AuditMode): string[] {
  return checks.filter((c) => c.modes.includes(mode) && WINDOW_CHECKS.includes(c.key)).map((c) => c.key);
}
const STATUSES = new Set(["ok", "warn", "critical"]);
/**
 * Αν τα checks ενός report περιέχουν όλους τους ελέγχους `keys` ολοκληρωμένους: με status (όχι error) και όχι μερική
 * σάρωση (`complete: false`) — αλλιώς το παράθυρό του δεν καλύφθηκε.
 */
export function coversChecks(checks: unknown, keys: string[]): boolean {
  if (!Array.isArray(checks)) return false;
  const by = new Map(checks.filter((c) => c && typeof c === "object").map((c) => [(c as { key?: unknown }).key, c as { status?: unknown; complete?: unknown }]));
  return keys.every((k) => { const c = by.get(k); return !!c && typeof c.status === "string" && STATUSES.has(c.status) && c.complete !== false; });
}
/**
 * Σημάδι «πλήρης έλεγχος του mode» μέσα στο SecurityReport.checks (στοιχείο χωρίς key/status — το αγνοούν storedChecks,
 * coversChecks κ.λπ.). Το βάζει ο runner όταν έτρεξαν όλοι οι έλεγχοι του mode (όχι «Τρέξε τώρα» ενός ελέγχου). Έτσι το
 * heartbeat μετρά ως πλήρες ένα report και όταν μετά το deploy προστεθεί νέος έλεγχος (χωρίς ψευδές «δεν έτρεξε σήμερα»).
 */
export const RUN_META = { meta: "run", allChecks: true } as const;
export function withRunMeta<T>(results: T[], only?: string[]): (T | typeof RUN_META)[] {
  return only ? results : [...results, RUN_META];
}
/**
 * Πλήρες report: έχει το σημάδι RUN_META, ή (παλιά reports, πριν από το σημάδι) περιέχει όλους τους ελέγχους `keys`.
 * Το ίδιο κριτήριο εφαρμόζει σε SQL το /api/security/heartbeat.
 */
/** Το report έχει το σημάδι «έτρεξαν όλοι οι έλεγχοι του είδους» (RUN_META — εγγραφή χωρίς key, που αλλιώς αγνοείται). */
export function hasRunMarker(checks: unknown): boolean {
  return Array.isArray(checks) && checks.some((c) => !!c && typeof c === "object" && (c as Record<string, unknown>).meta === RUN_META.meta && (c as Record<string, unknown>).allChecks === true);
}
export function isCompleteRun(checks: unknown, keys: string[]): boolean {
  if (!Array.isArray(checks)) return false;
  if (hasRunMarker(checks)) return true;
  const have = new Set(checks.map((c) => (c && typeof c === "object" ? (c as { key?: unknown }).key : undefined)));
  return keys.every((k) => have.has(k));
}
export const timeoutFor = (c: Pick<Check, "timeoutMs">, mode: AuditMode) => (typeof c.timeoutMs === "number" ? c.timeoutMs : c.timeoutMs[mode]);

const ATHENS = new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** «20/10 09:00» σε ώρα Ελλάδας. */
export function athens(d: Date): string {
  const p = Object.fromEntries(ATHENS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}
/** Ώρα (0–23) σε ώρα Ελλάδας. */
export function athensHour(d: Date): number {
  return Number(ATHENS.formatToParts(d).find((x) => x.type === "hour")?.value ?? 0);
}

/** Μέγιστο πλήθος ευρημάτων ανά έλεγχο στο report· τα υπόλοιπα συνοψίζονται σε ένα. */
export const MAX_FINDINGS = 100;
const RANK: Record<Finding["severity"], number> = { warn: 1, error: 2, critical: 3 };

export function capFindings(findings: Finding[], max = MAX_FINDINGS): Finding[] {
  if (findings.length <= max) return findings;
  const sorted = [...findings].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const rest = sorted.slice(max);
  const sev = worst(rest.map((f) => f.severity)) as Finding["severity"];
  const titles = [...new Set(rest.map((f) => f.title))].slice(0, 5).join(" · ");
  return [...sorted.slice(0, max), { severity: sev, title: `… και ${rest.length} ακόμη ευρήματα`, detail: `Δεν χωρούν στην αναφορά (όριο ${max}). Είδη: ${titles}.` }];
}

const short = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function runOne(check: Check, ctx: AuditCtx): Promise<StoredCheck> {
  const t0 = Date.now();
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const base = { key: check.key, title: check.title };
  const limit = timeoutFor(check, ctx.mode);
  const fail = (summary: string): StoredCheck => ({ ...base, status: "error", summary, findings: [{ severity: "error", title: "Ο έλεγχος δεν ολοκληρώθηκε", detail: summary }], ms: Date.now() - t0 });
  try {
    const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), limit); });
    const out = await Promise.race([check.run({ ...ctx, signal: ac.signal }), timeout]);
    if (out === "timeout") {
      ac.abort();
      return fail(`Ξεπεράστηκε το χρονικό όριο (${Math.round(limit / 1000)}″) — ο έλεγχος δεν ολοκληρώθηκε.`);
    }
    const findings = capFindings(out.findings);
    const status: Severity = worst([out.status, ...findings.map((f) => f.severity)]);
    return { ...base, status, summary: out.summary, findings, ms: Date.now() - t0, ...(out.snapshot !== undefined ? { snapshot: out.snapshot } : {}), ...(out.complete !== undefined ? { complete: out.complete } : {}) };
  } catch (e) {
    ac.abort();
    return fail(`Σφάλμα: ${short(e instanceof Error ? e.message : String(e))}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Τρέχει τους ελέγχους παράλληλα· τα αποτελέσματα με τη σειρά του μητρώου. */
export function runChecks(checks: Check[], ctx: AuditCtx): Promise<StoredCheck[]> {
  return Promise.all(checks.map((c) => runOne(c, ctx)));
}
