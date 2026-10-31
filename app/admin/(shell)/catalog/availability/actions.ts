"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { parseConds, isAvailState, resolveAvailability, type AvailRule } from "@/lib/catalog/availability-core";
import { explainAvailability, loadAvailRules, projectAvailability, tallyAvailability } from "@/lib/catalog/availability";
import { resetCatalogCache } from "@/lib/data/db-catalog";

export interface RuleInput { id?: string; name?: string; active: boolean; conditions: unknown; label: string; state: string; publish: boolean }

/** Κανόνες από τη φόρμα → καθαροί (άγνωστες συνθήκες πετιούνται, κενή φράση = σφάλμα). */
function clean(raw: RuleInput[]): { rules: AvailRule[]; error?: string } {
  if (!Array.isArray(raw) || raw.length > 200) return { rules: [], error: "Μη έγκυρη λίστα κανόνων." };
  const rules: AvailRule[] = [];
  for (const [i, r] of raw.entries()) {
    const label = String(r?.label ?? "").replace(/\s+/g, " ").trim();
    if (!label) return { rules: [], error: `Ο κανόνας ${i + 1} δεν έχει φράση.` };
    if (label.length > 120) return { rules: [], error: `Ο κανόνας ${i + 1}: η φράση είναι έως 120 χαρακτήρες.` };
    rules.push({ id: r.id || `new-${i}`, active: !!r.active, conditions: parseConds(r.conditions), label, state: isAvailState(r.state) ? r.state : "order", publish: !!r.publish });
  }
  return { rules };
}

/** Επίπτωση των (μη αποθηκευμένων) κανόνων σε όλα τα ενεργά προϊόντα. */
export async function previewAvailabilityAction(raw: RuleInput[]) {
  await requirePermission("catalog.products.read");
  const { rules, error } = clean(raw);
  if (error) return { ok: false as const, error };
  return { ok: true as const, tally: await tallyAvailability(rules) };
}

/** Αποθήκευση όλης της λίστας (η σειρά της = προτεραιότητα) και άμεση εφαρμογή στη βιτρίνα. */
export async function saveAvailabilityAction(raw: RuleInput[]) {
  const user = await requirePermission("catalog.products.write");
  const { rules, error } = clean(raw);
  if (error) return { ok: false as const, error };
  const before = await loadAvailRules();
  const names = new Map(raw.map((r, i) => [i, String(r.name ?? "").trim().slice(0, 80) || null]));
  await db.$transaction([
    db.availabilityRule.deleteMany({}),
    db.availabilityRule.createMany({ data: rules.map((r, i) => ({ position: i, active: r.active, name: names.get(i) ?? null, conditions: r.conditions as object[], label: r.label, state: r.state, publish: r.publish })) }),
  ]);
  await audit(user.id, "catalog.availability.save", "AvailabilityRule", "all", before, rules);
  const changed = await projectAvailability();
  resetCatalogCache();
  revalidatePath("/admin/catalog/availability");
  return { ok: true as const, changed };
}

/** «Δοκιμή για προϊόν»: αναζήτηση και τι βγαίνει με τους κανόνες της φόρμας (όχι τους αποθηκευμένους). */
export async function testAvailabilityAction(q: string, raw: RuleInput[]) {
  await requirePermission("catalog.products.read");
  const term = q.trim();
  if (term.length < 2) return [];
  const { rules } = clean(raw);
  const found = await db.product.findMany({
    where: { OR: [{ title: { contains: term, mode: "insensitive" } }, { sku: { contains: term, mode: "insensitive" } }, { erpCode: term }, { ean: term }] },
    take: 6, orderBy: { title: "asc" }, select: { id: true },
  });
  const out = [];
  for (const f of found) {
    const e = await explainAvailability(f.id);
    if (!e) continue;
    // ξανά με τους κανόνες της φόρμας: το explain φορτώνει τους αποθηκευμένους
    const result = resolveAvailability(e.input, rules);
    out.push({ ...e.product, result });
  }
  return out;
}
