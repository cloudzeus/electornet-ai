"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { captureEvidence } from "@/lib/gdpr/evidence";

export async function createGdprRequest(input: { email: string; type: string; channel: string; description: string; identityMethod: string }) {
  const user = await requirePermission("customers.write");
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false as const, error: "Δώσε email." };
  const customer = await db.customer.findUnique({ where: { email } });
  const n = await db.gdprRequest.count();
  const ev = await captureEvidence();
  const requestedAt = new Date();
  const row = await db.gdprRequest.create({ data: { number: `GDPR-${String(n + 1).padStart(5, "0")}`, email, customerId: customer?.id ?? null, type: input.type, channel: input.channel, description: input.description || null, identityMethod: input.identityMethod || null, identityVerifiedAt: input.identityMethod ? new Date() : null, requestedAt, dueAt: new Date(requestedAt.getTime() + 30 * 86400000), staffId: user.id, evidence: { by: user.name, ip: ev.ip, userAgent: ev.userAgent }, timeline: [{ at: requestedAt.toISOString(), status: "open", by: user.name }] } });
  if (customer) await db.customerEvent.create({ data: { customerId: customer.id, kind: "gdpr-request", meta: { number: row.number, type: input.type }, staffId: user.id } });
  await audit(user.id, "gdpr.request.create", "GdprRequest", row.id, null, { number: row.number, type: input.type, email });
  revalidatePath("/admin/gdpr");
  return { ok: true as const, id: row.id };
}

export async function updateGdprRequest(id: string, patch: { status: string; note: string; outcome: string; identityMethod: string }) {
  const user = await requirePermission("customers.write");
  const r = await db.gdprRequest.findUniqueOrThrow({ where: { id } });
  const timeline = [...((r.timeline as { at: string; status: string; note?: string; by?: string }[] | null) ?? []), { at: new Date().toISOString(), status: patch.status, note: patch.note, by: user.name ?? "staff" }];
  await db.gdprRequest.update({ where: { id }, data: { status: patch.status, outcome: patch.outcome || r.outcome, identityMethod: patch.identityMethod || r.identityMethod, identityVerifiedAt: patch.identityMethod && !r.identityVerifiedAt ? new Date() : r.identityVerifiedAt, completedAt: ["done", "rejected"].includes(patch.status) ? new Date() : null, timeline, staffId: user.id } });
  await audit(user.id, "gdpr.request.update", "GdprRequest", id, { status: r.status }, { status: patch.status, outcome: patch.outcome });
  revalidatePath("/admin/gdpr");
  return { ok: true as const };
}
