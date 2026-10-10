"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { allShippingFacts, saveBulkyRules, shippingFacts, tallyShipping } from "@/lib/shipping/bulky-server";
import { decideShipping, normalizeBulkyRules } from "@/lib/shipping/bulky";

/** Αποθήκευση των κανόνων «μεγάλων συσκευών» (κατηγορίες, όρια βάρους / μεγέθους, θυρίδα). */
export async function saveBulkyRulesAction(raw: unknown) {
  const user = await requirePermission("settings.write");
  const { before, after } = await saveBulkyRules(raw, user.id);
  await audit(user.id, "shipping.bulky.save", "Setting", "shipping.bulky", before, after);
  revalidatePath("/admin/apostoles");
  return { ok: true as const, categories: Object.keys(after.categories).length };
}

/** Τι θα γίνει με αυτούς τους κανόνες (πριν την αποθήκευση): πλήθη σε όλο τον ενεργό κατάλογο. */
export async function previewShippingAction(raw: unknown) {
  await requirePermission("catalog.products.read");
  const t = tallyShipping(await allShippingFacts(), normalizeBulkyRules(raw));
  return { courier: t.courier, store: t.store, locker: t.locker, unknown: t.unknown, storeByCat: t.storeByCat };
}

/** «Γιατί πάει έτσι;» — αναζήτηση προϊόντος (τίτλος, SKU, κωδικός ERP, barcode) και η απόφαση με αυτούς τους κανόνες. */
export async function checkShippingAction(q: string, raw: unknown) {
  await requirePermission("catalog.products.read");
  const term = q.trim();
  if (term.length < 2) return [];
  const found = await db.product.findMany({
    where: { active: true, OR: [{ title: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }, { erpCode: term }, { ean: term }] },
    take: 6, orderBy: { title: "asc" }, select: { id: true, title: true, sku: true },
  });
  const facts = new Map((await shippingFacts(found.map((p) => p.id))).map((f) => [f.id, f]));
  const rules = normalizeBulkyRules(raw);
  return found.map((p) => {
    const f = facts.get(p.id);
    const v = f ? decideShipping({ categoryPath: f.path, weightKg: f.weightKg, dimsCm: f.dimsCm }, rules) : null;
    return { id: p.id, title: p.title, sku: p.sku, courier: v?.courier ?? true, locker: v?.locker ?? false, reason: v?.reason ?? null, weightKg: f?.weightKg ?? null, dimsCm: f?.dimsCm ?? null };
  });
}
