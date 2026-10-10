"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { saveBulkyRules } from "@/lib/shipping/bulky-server";

/** Αποθήκευση των κανόνων «μεγάλων συσκευών» (κατηγορίες, όρια βάρους / μεγέθους, θυρίδα). */
export async function saveBulkyRulesAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await saveBulkyRules(raw, user.id);
  await audit(user.id, "shipping.bulky.save", "Setting", "shipping.bulky", before, after);
  revalidatePath("/admin/apostoles");
  return { ok: true as const, categories: Object.keys(after.categories).length };
}
