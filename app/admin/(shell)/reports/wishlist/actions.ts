"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { runWishlistAlerts } from "@/lib/wishlist/notify";

export async function runAlertsNow(dryRun: boolean) {
  const user = await requirePermission("marketing.newsletter.write");
  const r = await runWishlistAlerts({ dryRun });
  await audit(user.id, "wishlist.alerts.run", "WishlistItem", "*", null, { ...r, dryRun });
  revalidatePath("/admin/reports/wishlist");
  return r;
}
