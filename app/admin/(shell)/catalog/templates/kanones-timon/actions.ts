"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import type { Rounding } from "@/lib/catalog/pricing/markup";

const PATH = "/admin/catalog/templates/kanones-timon";
const ROUNDING = new Set<Rounding>(["none", "int", "90", "99"]);

export type RuleInput = { id?: string | null; brandId: string | null; categoryId: string | null; percent: number; rounding: string; active: boolean };
type Res = { ok: boolean; error?: string };

/** Νέος κανόνας ή αλλαγή υπάρχοντος. Ποσοστό 0–500, στρογγύλεμα από τη λίστα· ένας ενεργός κανόνας ανά εμβέλεια. */
export async function saveRule(r: RuleInput): Promise<Res> {
  const user = await requirePermission("catalog.products.write");
  const percent = Number(r.percent);
  if (!Number.isFinite(percent) || percent < 0 || percent > 500) return { ok: false, error: "Το ποσοστό πρέπει να είναι από 0 έως 500." };
  if (!ROUNDING.has(r.rounding as Rounding)) return { ok: false, error: "Μη έγκυρο στρογγύλεμα." };
  const brandId = r.brandId || null, categoryId = r.categoryId || null;
  if (brandId && !(await db.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) return { ok: false, error: "Η μάρκα δεν βρέθηκε." };
  if (categoryId && !(await db.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return { ok: false, error: "Η κατηγορία δεν βρέθηκε." };
  const active = !!r.active;
  // Δύο ενεργοί κανόνες για την ίδια μάρκα/κατηγορία θα έδιναν τυχαίο αποτέλεσμα (κερδίζει ο παλαιότερος)
  if (active) {
    const clash = await db.markupRule.findFirst({ where: { brandId, categoryId, active: true, ...(r.id ? { id: { not: r.id } } : {}) }, select: { id: true } });
    if (clash) return { ok: false, error: "Υπάρχει ήδη ενεργός κανόνας για αυτή την εμβέλεια — άλλαξε εκείνον ή απενεργοποίησέ τον." };
  }
  const data = { brandId, categoryId, percent: Math.round(percent * 100) / 100, rounding: r.rounding, active };
  if (r.id) {
    const before = await db.markupRule.findUnique({ where: { id: r.id } });
    if (!before) return { ok: false, error: "Ο κανόνας δεν βρέθηκε." };
    await db.markupRule.update({ where: { id: r.id }, data });
    await audit(user.id, "catalog.markup.update", "MarkupRule", r.id, before, data);
  } else {
    const row = await db.markupRule.create({ data });
    await audit(user.id, "catalog.markup.create", "MarkupRule", row.id, null, data);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Ενεργοποίηση / απενεργοποίηση (με τον ίδιο έλεγχο μοναδικότητας). */
export async function setRuleActive(id: string, active: boolean): Promise<Res> {
  await requirePermission("catalog.products.write");
  const r = await db.markupRule.findUnique({ where: { id } });
  if (!r) return { ok: false, error: "Ο κανόνας δεν βρέθηκε." };
  return saveRule({ id, brandId: r.brandId, categoryId: r.categoryId, percent: r.percent, rounding: r.rounding, active });
}

export async function deleteRule(id: string): Promise<Res> {
  const user = await requirePermission("catalog.products.write");
  const before = await db.markupRule.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "Ο κανόνας δεν βρέθηκε." };
  await db.markupRule.delete({ where: { id } });
  await audit(user.id, "catalog.markup.delete", "MarkupRule", id, before, null);
  revalidatePath(PATH);
  return { ok: true };
}
