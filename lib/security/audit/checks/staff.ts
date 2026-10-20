import { db } from "@/lib/db";
import { statusOf } from "../rules";
import type { Check } from "../types";
import { baselineFrom, classifyStaffChanges, staffSnapshot, staffSummary, type StaffSnapshot } from "./staff-core";

/** Το στιγμιότυπο του ελέγχου staff από το τελευταίο report πριν από την αρχή του παραθύρου (αλλιώς το παλαιότερο μετά). */
async function baseline(since: Date): Promise<StaffSnapshot | null> {
  const select = { checks: true } as const;
  const before = await db.securityReport.findMany({ where: { startedAt: { lte: since } }, orderBy: { startedAt: "desc" }, take: 10, select });
  const after = before.some((r) => baselineFrom(r.checks)) ? [] : await db.securityReport.findMany({ where: { startedAt: { gt: since } }, orderBy: { startedAt: "asc" }, take: 10, select });
  for (const r of [...before, ...after]) { const s = baselineFrom(r.checks); if (s) return s; }
  return null;
}

export const staffCheck: Check = {
  key: "staff",
  title: "Λογαριασμοί διαχείρισης, ρόλοι και δικαιώματα",
  modes: ["full", "light"],
  timeoutMs: 30_000,
  async run({ since, now }) {
    const [staff, roles, audits, base] = await Promise.all([
      db.staff.findMany({ select: { id: true, email: true, active: true, createdAt: true, roles: { select: { role: { select: { key: true } } } } } }),
      db.role.findMany({ select: { id: true, key: true, permissions: { select: { permission: { select: { key: true } } } } } }),
      db.auditLog.findMany({ where: { createdAt: { gte: since }, OR: [{ action: { startsWith: "staff." } }, { action: { startsWith: "role." } }] }, select: { action: true, entityId: true, staffId: true, createdAt: true, before: true, after: true } }),
      baseline(since),
    ]);
    const S = staff.map((s) => ({ id: s.id, email: s.email, active: s.active, createdAt: s.createdAt, roles: s.roles.map((r) => r.role.key) }));
    const R = roles.map((r) => ({ id: r.id, key: r.key, permissions: r.permissions.map((p) => p.permission.key) }));
    const input = { since, staff: S, roles: R, audits, baseline: base };
    const findings = classifyStaffChanges(input);
    return { status: statusOf(findings), summary: staffSummary(input), findings, snapshot: staffSnapshot(S, R, now) };
  },
};
