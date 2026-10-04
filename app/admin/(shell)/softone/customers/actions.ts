"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { syncPurchases } from "@/lib/softone/purchases";

/** Ξεκινά τον συγχρονισμό αγορών στο παρασκήνιο (ο πλήρης θέλει λεπτά). Μόνο αναγνώσεις από το SoftOne. */
export async function startPurchaseSync(full: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await requirePermission("settings.integrations.write");
  const running = await db.s1SyncRun.findFirst({ where: { kind: "cust-purchases", ok: false, ms: 0, error: null, at: { gt: new Date(Date.now() - 60 * 60_000) } }, select: { id: true } }).catch(() => null);
  if (running) return { ok: false, error: "Τρέχει ήδη συγχρονισμός — περίμενε να τελειώσει." };
  await audit(user.id, "softone.purchases.sync", "S1SyncRun", full ? "full" : "delta", null, null);
  after(async () => { await syncPurchases({ since: full ? new Date("2020-01-01") : undefined, trigger: "manual" }); });
  revalidatePath("/admin/softone/customers");
  return { ok: true };
}
