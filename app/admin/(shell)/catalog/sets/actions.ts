"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";

/** Ετικέτα μέλους στο «Περιλαμβάνει» του site (κενή = το όνομα του ERP). Δεν γράφει στο SoftOne. */
export async function setMemberLabelAction(spcs: number, lineNum: number, label: string) {
  const user = await requirePermission("catalog.products.write");
  const v = label.trim().slice(0, 120) || null;
  const prev = await db.s1SetLine.findUnique({ where: { spcs_lineNum: { spcs, lineNum } }, select: { label: true } });
  if (!prev) return { ok: false as const, error: "Το μέλος δεν βρέθηκε." };
  await db.s1SetLine.update({ where: { spcs_lineNum: { spcs, lineNum } }, data: { label: v } });
  await audit(user.id, "catalog.set.label", "S1SetLine", `${spcs}:${lineNum}`, { label: prev.label }, { label: v });
  revalidatePath("/admin/catalog/[id]", "page");
  return { ok: true as const, label: v };
}

/** Ανάγνωση των σετ από το SoftOne (μόνο GetTable) και προβολή τους ως προϊόντα (τιμή, απόθεμα, «Πωλείται και μόνο του»). */
export async function syncSetsAction() {
  const user = await requirePermission("catalog.sync.run");
  const { syncSets, projectSetStock } = await import("@/lib/softone/sets");
  const r = await syncSets("manual");
  const stockUpdated = r.ok ? await projectSetStock() : 0;
  await audit(user.id, "catalog.sets.sync", "S1Set", null, null, { ...r, stockUpdated });
  if (r.ok) (await import("@/lib/data/db-catalog")).resetCatalogCache();
  revalidatePath("/admin/catalog");
  return { ...r, stockUpdated };
}
