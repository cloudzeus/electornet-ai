import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { worst, type CheckResult, type Severity } from "./rules";
import { coversChecks, lightSince, runChecks, sinceFor } from "./execute";
import { CHECKS } from "./checks";
import type { AuditMode } from "./types";

const RETENTION_DAYS = 180;

/**
 * Τρέχει τους ελέγχους του mode παράλληλα (χρονικό όριο ανά έλεγχο → "error"), αποθηκεύει ένα SecurityReport και σβήνει
 * όσα είναι παλαιότερα από 180 ημέρες. Οι έλεγχοι κάνουν ΜΟΝΟ αναγνώσεις· οι μόνες εγγραφές είναι το report και η
 * διαγραφή των παλιών. `only`: μόνο αυτά τα κλειδιά (για δοκιμές / «Τρέξε τώρα» ενός ελέγχου).
 * Το status αποθηκεύεται όπως το Severity: ok | warn | critical | error.
 */
/**
 * Έναρξη του τελευταίου report (light ή full) που κάλυψε όλους τους ελέγχους του light χωρίς σφάλμα — το light ξεκινά
 * από εκεί (μείον 2′), ώστε να μη μένει κενό όταν ο cron αργήσει. Χειροκίνητα reports ενός ελέγχου δεν μετρούν.
 */
async function previousStart(keys: string[]): Promise<Date | null> {
  const rows = await db.securityReport.findMany({ orderBy: { startedAt: "desc" }, take: 24, select: { startedAt: true, checks: true } });
  return rows.find((r) => coversChecks(r.checks, keys))?.startedAt ?? null;
}

export async function runAudit(mode: AuditMode, opts: { only?: string[] } = {}): Promise<{ reportId: string; status: Severity; results: CheckResult[] }> {
  const now = new Date();
  const checks = CHECKS.filter((c) => c.modes.includes(mode) && (!opts.only || opts.only.includes(c.key)));
  const since = mode === "full" ? sinceFor("full", now) : lightSince(await previousStart(CHECKS.filter((c) => c.modes.includes("light")).map((c) => c.key)), now);
  const results = await runChecks(checks, { mode, since, now });
  const status = worst(results.map((r) => r.status));
  const report = await db.securityReport.create({ data: { mode, startedAt: now, finishedAt: new Date(), status, checks: results as unknown as Prisma.InputJsonValue } });
  await db.securityReport.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } } });
  return { reportId: report.id, status, results };
}
