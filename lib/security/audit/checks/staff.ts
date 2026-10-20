import { db } from "@/lib/db";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { auditsFromFor, baselineFrom, classifyStaffChanges, staffSnapshot, staffSummary, type StaffSnapshot } from "./staff-core";

const PAGE = 20;
const MAX_REPORTS = 500;
const MAX_AGE_MS = 7 * 86_400_000;

/**
 * Το πιο πρόσφατο έγκυρο στιγμιότυπο του ελέγχου staff, ανεξάρτητα από το since (ο προηγούμενος έλεγχος μπορεί να
 * ξεκίνησε λίγο μετά το since — τότε θα συγκρίναμε με τον προ-προηγούμενο και θα ξαναβγάζαμε όσα ήδη αναφέρθηκαν).
 * Σελιδοποίηση: τα reports με `only` ή με σφάλμα στο staff δεν έχουν στιγμιότυπο· έως 500 reports / 7 ημέρες πίσω.
 */
async function baseline(now: Date): Promise<StaffSnapshot | null> {
  const oldest = new Date(now.getTime() - MAX_AGE_MS);
  for (let skip = 0; skip < MAX_REPORTS; skip += PAGE) {
    const rows = await db.securityReport.findMany({ where: { startedAt: { gte: oldest } }, orderBy: { startedAt: "desc" }, skip, take: PAGE, select: { checks: true } });
    for (const r of rows) { const s = baselineFrom(r.checks); if (s) return s; }
    if (rows.length < PAGE) break;
  }
  return null;
}

export const staffCheck: Check = {
  key: "staff",
  title: "Λογαριασμοί διαχείρισης, ρόλοι και δικαιώματα",
  modes: ["full", "light"],
  timeoutMs: 30_000,
  async run({ since, now }) {
    const base = await baseline(now);
    const auditsFrom = auditsFromFor(since, base);
    const [staff, roles, audits] = await Promise.all([
      db.staff.findMany({ select: { id: true, email: true, active: true, createdAt: true, roles: { select: { role: { select: { key: true } } } } } }),
      db.role.findMany({ select: { id: true, key: true, permissions: { select: { permission: { select: { key: true } } } } } }),
      db.auditLog.findMany({ where: { createdAt: { gte: auditsFrom }, OR: [{ action: { startsWith: "staff." } }, { action: { startsWith: "role." } }] }, select: { action: true, entityId: true, staffId: true, createdAt: true, before: true, after: true } }),
    ]);
    const S = staff.map((s) => ({ id: s.id, email: s.email, active: s.active, createdAt: s.createdAt, roles: s.roles.map((r) => r.role.key) }));
    const R = roles.map((r) => ({ id: r.id, key: r.key, permissions: r.permissions.map((p) => p.permission.key) }));
    const input = { since, auditsFrom, staff: S, roles: R, audits, baseline: base };
    const findings = classifyStaffChanges(input);
    return { status: statusOf(findings), summary: staffSummary(input), findings, snapshot: staffSnapshot(S, R, now) };
  },
};
