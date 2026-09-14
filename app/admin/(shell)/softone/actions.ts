"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { syncLookup, syncAllLookups, updateLookupRow, createLookupRow, lookupByKind } from "@/lib/softone/lookups";

export async function syncKind(kind: string) {
  const user = await requirePermission("settings.integrations.write");
  const r = await syncLookup(kind, "manual");
  await audit(user.id, "softone.lookup.sync", "S1SyncRun", kind, null, r);
  revalidatePath("/admin/softone");
  revalidatePath(`/admin/softone/${kind}`);
  return r;
}

export async function syncAll() {
  const user = await requirePermission("settings.integrations.write");
  const r = await syncAllLookups("manual");
  await audit(user.id, "softone.lookup.sync-all", "S1SyncRun", "*", null, { ok: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).map((x) => x.kind) });
  revalidatePath("/admin/softone");
  return r;
}

export async function saveRow(kind: string, id: string, patch: Record<string, unknown>) {
  const user = await requirePermission("settings.integrations.write");
  const row = await updateLookupRow(kind, id, patch);
  await audit(user.id, "softone.lookup.edit", lookupByKind(kind)?.model ?? kind, id, null, patch);
  revalidatePath(`/admin/softone/${kind}`);
  return { ok: true, row: JSON.parse(JSON.stringify(row)) as Record<string, unknown> };
}

export async function addRow(kind: string, input: { code: string; name: string } & Record<string, unknown>) {
  const user = await requirePermission("settings.integrations.write");
  try {
    const row = await createLookupRow(kind, input);
    await audit(user.id, "softone.lookup.create", lookupByKind(kind)?.model ?? kind, String(row.id), null, input);
    revalidatePath(`/admin/softone/${kind}`);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message.includes("Unique") ? "Ο κωδικός υπάρχει ήδη." : (e as Error).message }; }
}

/** Καθαρισμός ιστορικού: είτε μόνο τα αποτυχημένα, είτε ό,τι είναι παλαιότερο από Χ ημέρες. */
export async function clearRuns(mode: "failed" | "old", days = 30) {
  const user = await requirePermission("settings.integrations.write");
  const where = mode === "failed" ? { ok: false } : { at: { lt: new Date(Date.now() - days * 86400000) } };
  const { count } = await db.s1SyncRun.deleteMany({ where });
  await audit(user.id, "softone.runs.clear", "S1SyncRun", mode, null, { deleted: count, days: mode === "old" ? days : undefined });
  revalidatePath("/admin/softone/sync");
  revalidatePath("/admin/softone");
  return { ok: true as const, deleted: count };
}
