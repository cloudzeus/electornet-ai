import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Writes one audit row; never throws (auditing must not break the action). */
export async function audit(staffId: string | null, action: string, entity: string, entityId?: string | null, before?: unknown, after?: unknown) {
  try {
    await db.auditLog.create({ data: { staffId, action, entity, entityId: entityId ?? null, before: (before ?? undefined) as Prisma.InputJsonValue | undefined, after: (after ?? undefined) as Prisma.InputJsonValue | undefined } });
  } catch (e) {
    console.error("[audit]", e);
  }
}
