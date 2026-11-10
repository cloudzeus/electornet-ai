"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { deactivateItems, type DeactResult } from "@/lib/catalog/deactivate";
import type { DeactMode } from "@/lib/catalog/deactivate-core";

/**
 * Μία παρτίδα (έως 20 είδη) της απενεργοποίησης από Excel. Γράφει στο SoftOne — «Εξαίρεση Web» ή «ανενεργό είδος» — άρα
 * θέλει και το δικαίωμα συγχρονισμού ERP, όπως κάθε άλλη εγγραφή προς το ERP. Κάθε εκτέλεση καταγράφεται.
 */
export async function runDeactivation(mtrls: number[], mode: DeactMode, fileName: string): Promise<DeactResult[] | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!can(user.permissions, "catalog.sync.run")) return { error: "Για απενεργοποίηση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const m: DeactMode = mode === "erp" ? "erp" : "web";
  const list = [...new Set((Array.isArray(mtrls) ? mtrls : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 20);
  if (!list.length) return { error: "Δεν επιλέχθηκε κανένα είδος." };
  try {
    const res = await deactivateItems(list, m);
    if (res.some((r) => r.ok)) resetCatalogCache();
    await audit(user.id, "catalog.deactivate.excel", "S1Item", null, null, { mode: m, file: String(fileName ?? "").slice(0, 200), results: res });
    return res;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[deactivate/run]", e);
    return { error: "Κάτι πήγε στραβά στην απενεργοποίηση." };
  }
}
