import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { worst, type CheckResult, type Severity } from "./rules";
import { coversChecks, fullSince, hasRunMarker, lightSince, runChecks, windowKeys, withRunMeta, RUN_META } from "./execute";
import { CHECKS } from "./checks";
import type { AuditMode } from "./types";

const RETENTION_DAYS = 180;

/**
 * Έναρξη του νεότερου report που κάλυψε το παράθυρο: όλοι οι έλεγχοι που διαβάζουν «από το since» (windowKeys — όχι site
 * / watcher) ολοκληρωμένοι χωρίς σφάλμα. light: οποιοδήποτε report (light ή full)· full: μόνο πλήρη full (σημάδι run).
 * Χειροκίνητα reports ενός ελέγχου δεν μετρούν.
 */
async function previousStart(mode: AuditMode): Promise<Date | null> {
  const keys = windowKeys(CHECKS, mode);
  const rows = await db.securityReport.findMany({ where: mode === "full" ? { mode: "full" } : {}, orderBy: { startedAt: "desc" }, take: 24, select: { startedAt: true, checks: true } });
  return rows.find((r) => (mode === "light" || hasRunMarker(r.checks)) && coversChecks(r.checks, keys))?.startedAt ?? null;
}

/** Το νεότερο ΠΛΗΡΕΣ full (με το σημάδι run — όχι δοκιμή ενός ελέγχου): «Αποστολή report τώρα», σελίδα «Ασφάλεια». */
export const FULL_RUN_WHERE = { mode: "full", checks: { array_contains: [RUN_META] } } satisfies Prisma.SecurityReportWhereInput;

/**
 * Τρέχει τους ελέγχους του mode παράλληλα (χρονικό όριο ανά έλεγχο → "error"), αποθηκεύει ένα SecurityReport και σβήνει
 * όσα είναι παλαιότερα από 180 ημέρες. Οι έλεγχοι κάνουν ΜΟΝΟ αναγνώσεις· οι μόνες εγγραφές είναι το report και η
 * διαγραφή των παλιών. `only`: μόνο αυτά τα κλειδιά (για δοκιμές / «Τρέξε τώρα» ενός ελέγχου).
 * Το status αποθηκεύεται όπως το Severity: ok | warn | critical | error.
 */
export async function runAudit(mode: AuditMode, opts: { only?: string[] } = {}): Promise<{ reportId: string; status: Severity; results: CheckResult[] }> {
  const now = new Date();
  const checks = CHECKS.filter((c) => c.modes.includes(mode) && (!opts.only || opts.only.includes(c.key)));
  const prev = await previousStart(mode);
  const since = mode === "full" ? fullSince(prev, now) : lightSince(prev, now);
  const results = await runChecks(checks, { mode, since, now });
  const status = worst(results.map((r) => r.status));
  const report = await db.securityReport.create({ data: { mode, startedAt: now, finishedAt: new Date(), status, checks: withRunMeta(results, opts.only) as unknown as Prisma.InputJsonValue } });
  await db.securityReport.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
  return { reportId: report.id, status, results };
}
