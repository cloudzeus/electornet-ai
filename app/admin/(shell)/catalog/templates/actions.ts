"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { brandOverview, type BrandOverview } from "@/lib/catalog/supplier-sheet";

/** Τι έχει κάθε επιλεγμένη μάρκα: τα προϊόντα της ανά ομάδα χαρακτηριστικών (κατηγορία). */
export async function loadBrandOverview(brandIds: string[]): Promise<BrandOverview[]> {
  await requirePermission("catalog.products.read");
  return brandOverview(brandIds.slice(0, 30));
}
