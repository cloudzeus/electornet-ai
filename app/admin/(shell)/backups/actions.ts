"use server";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { runBackup } from "@/lib/backup/run";

export async function backupNow() {
  const user = await requireSuperAdmin();
  const r = await runBackup("manual");
  await audit(user.id, "backup.run", "BackupRun", r.id, null, { ok: r.ok, bytes: r.bytes ?? null, encrypted: r.encrypted ?? null, error: r.error ?? null });
  revalidatePath("/admin/backups");
  return r;
}
