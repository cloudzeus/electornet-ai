"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { saveExtPricing } from "@/lib/warranty/pricing";

/** Αποθήκευση των κλιμάκων τιμών της επέκτασης εγγύησης επί πληρωμή. Δεν γράφει στο SoftOne. */
export async function saveExtPricingAction(raw: unknown) {
  const user = await requirePermission("catalog.promos.write");
  const { before, after } = await saveExtPricing(raw, user.id);
  await audit(user.id, "warranty.pricing.save", "Setting", "warranty.extension", before, after);
  revalidatePath("/admin/epektasi-eggyisis");
  return { ok: true as const, tiers: after.tiers.length, enabled: after.enabled };
}
