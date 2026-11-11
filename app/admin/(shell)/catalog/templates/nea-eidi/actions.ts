"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { approvePending, discardPending, updatePending, pendingSpecGaps, resolvePendingSpecs, type ApproveResult, type SpecGap, type SpecDecision } from "@/lib/catalog/foreign-import/pending";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { parseMoney } from "@/lib/catalog/pricing/markup";
import { db } from "@/lib/db";
import { suggestProductCategories, type CatGuess } from "@/lib/catalog/category-ai";
import { pendingFields } from "@/lib/catalog/foreign-import/pending-core";
import { groupOfCategory } from "@/lib/catalog/supplier-sheet";
import { UserError } from "@/lib/catalog/foreign-import/core";

const PATH = "/admin/catalog/templates/nea-eidi";
const ids = (list: string[]) => [...new Set(list.filter((x) => typeof x === "string" && x))].slice(0, 100);

/** Έγκριση: δημιουργία στο SoftOne (ανενεργά), όπως τα νέα είδη του template — χρειάζεται επεξεργασία προϊόντων ΚΑΙ εκτέλεση συγχρονισμού ERP. */
export async function approveItems(list: string[], webExcluded = false): Promise<ApproveResult[] | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!can(user.permissions, "catalog.sync.run")) return { error: "Για έγκριση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const res = await approvePending(ids(list), user.id, { webExcluded: webExcluded === true });
  if (res.some((r) => r.ok)) resetCatalogCache();
  await audit(user.id, "catalog.pending.approve", "PendingItem", null, null, { webExcluded: webExcluded === true, results: res.map((r) => ({ id: r.id, ok: r.ok, mtrl: r.mtrl })) });
  revalidatePath(PATH);
  return res;
}

/** Πριν από την έγκριση: χαρακτηριστικά του αρχείου που δεν υπάρχουν στην ομάδα του SoftOne (για να αποφασίσει ο χρήστης). */
export async function specGaps(list: string[]): Promise<SpecGap[] | { error: string }> {
  await requirePermission("catalog.products.write");
  try { return await pendingSpecGaps(ids(list)); } catch (e) { console.error("[pending/spec-gaps]", e); return { error: "Δεν ήταν δυνατός ο έλεγχος των χαρακτηριστικών — ξαναδοκίμασε." }; }
}

/** Οι αποφάσεις του χρήστη: νέα χαρακτηριστικά στην ομάδα του SoftOne (μόνο όσα επιβεβαίωσε) ή αντιστοίχιση σε υπάρχοντα. */
export async function resolveSpecGaps(list: string[], decisions: SpecDecision[]): Promise<{ created: number; mapped: number; errors: string[] } | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!can(user.permissions, "catalog.sync.run")) return { error: "Για νέα χαρακτηριστικά στο SoftOne χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const clean = (Array.isArray(decisions) ? decisions : []).slice(0, 200).map((d) => ({ groupS1Id: Number(d?.groupS1Id), label: String(d?.label ?? "").trim(), action: d?.action === "create" || d?.action === "use" ? d.action : "skip" as const, use: d?.use ? String(d.use) : undefined })).filter((d) => d.groupS1Id > 0 && d.label && d.action !== "skip");
  try {
    const r = await resolvePendingSpecs(ids(list), clean);
    await audit(user.id, "catalog.pending.specs", "PendingItem", null, null, { decisions: clean, ...r });
    revalidatePath(PATH);
    return r;
  } catch (e) { console.error("[pending/spec-resolve]", e); return { error: "Η αποθήκευση των χαρακτηριστικών απέτυχε — ξαναδοκίμασε." }; }
}

/** Απόρριψη: μόνο όσα δεν έχουν δημιουργηθεί· επιστρέφει πόσα απορρίφθηκαν. */
export async function discardItems(list: string[]): Promise<{ count: number }> {
  const user = await requirePermission("catalog.products.write");
  const count = await discardPending(ids(list));
  await audit(user.id, "catalog.pending.discard", "PendingItem", null, null, { ids: ids(list), count });
  revalidatePath(PATH);
  return { count };
}

export type PendingEdit = { code: string; name: string; brandId: string | null; specGroupS1Id: number | null; price: string };

/** Διόρθωση στοιχείων πριν την έγκριση (κωδικός, όνομα, μάρκα, ομάδα χαρακτηριστικών, τιμή web με ΦΠΑ). */
export async function editItem(id: string, e: PendingEdit): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("catalog.products.write");
  const raw = String(e.price ?? "").trim();
  const price = raw ? parseMoney(raw) : null;
  if (raw && price == null) return { ok: false, error: "Η τιμή πρέπει να είναι ποσό μεγαλύτερο από 0 (ή κενή)." };
  const name = String(e.name ?? "").trim();
  if (name.length > 128) return { ok: false, error: "Το όνομα έχει έως 128 χαρακτήρες." };
  const r = await updatePending(String(id), { code: String(e.code ?? ""), fields: { name }, brandId: e.brandId || null, specGroupS1Id: e.specGroupS1Id == null ? null : Number(e.specGroupS1Id), price });
  if (r.ok) revalidatePath(PATH);
  return r;
}

export type CategoryAiResult = { guesses: CatGuess[]; asked: number; left: number; options: { id: string; name: string }[] } | { error: string };
const aiError = (tag: string, e: unknown) => { if (e instanceof UserError) return { error: e.message }; console.error(`[category-ai/${tag}]`, e); return { error: "Κάτι πήγε στραβά με τις προτάσεις κατηγορίας — ξαναδοκίμασε." }; };

/**
 * «Πρότεινε κατηγορία (AI)» για νέα είδη σε αναμονή — από όποιον δρόμο κι αν ήρθαν (Excel, XML, Keyvoto). Μόνο πρόταση:
 * τίποτα δεν αλλάζει μέχρι ο χρήστης να πατήσει «Εφαρμογή». Το `key` κάθε πρότασης είναι το id του είδους.
 */
export async function suggestPendingCategories(list: string[]): Promise<CategoryAiResult> {
  const user = await requirePermission("catalog.products.write");
  try {
    const rows = await db.pendingItem.findMany({ where: { id: { in: ids(list) }, status: { in: ["pending", "error"] }, mtrl: null }, select: { id: true, code: true, fields: true, specs: true, brandId: true } });
    const brands = new Map((await db.brand.findMany({ where: { id: { in: rows.map((r) => r.brandId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
    const asks = rows.map((r) => {
      const f = pendingFields(r.fields);
      const specs = r.specs && typeof r.specs === "object" && !Array.isArray(r.specs) ? Object.entries(r.specs as Record<string, unknown>).slice(0, 6).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : "";
      return { key: r.id, name: f.name ?? r.code, brand: r.brandId ? brands.get(r.brandId) : undefined, extra: [f.shortDesc, f.descText?.slice(0, 120), specs].filter(Boolean).join(" · ") };
    });
    const res = await suggestProductCategories(asks);
    await audit(user.id, "catalog.pending.category-ai", "PendingItem", null, null, { asked: res.asked, guesses: res.guesses.length });
    return res;
  } catch (e) { return aiError("pending", e); }
}

/** Εφαρμογή των προτάσεων που δέχτηκε ο χρήστης: κατηγορία site και η ομάδα χαρακτηριστικών της. Μόνο σε είδη που δεν έχουν δημιουργηθεί. */
export async function applyPendingCategories(list: { id: string; categoryId: string }[]): Promise<{ ok: number; errors: string[] } | { error: string }> {
  await requirePermission("catalog.products.write");
  try {
    const picks = (Array.isArray(list) ? list : []).slice(0, 400).map((x) => ({ id: String(x?.id ?? ""), categoryId: String(x?.categoryId ?? "") })).filter((x) => x.id && x.categoryId);
    const cats = new Map((await db.category.findMany({ where: { id: { in: picks.map((p) => p.categoryId) } }, select: { id: true, erpCode: true } })).map((c) => [c.id, groupOfCategory(c.erpCode)]));
    let ok = 0; const errors: string[] = [];
    for (const p of picks) {
      const group = cats.get(p.categoryId);
      if (group == null) { errors.push("Κατηγορία χωρίς ομάδα χαρακτηριστικών — παραλείφθηκε."); continue; }
      const r = await updatePending(p.id, { webCategoryId: p.categoryId, specGroupS1Id: group });
      if (r.ok) ok++; else if (r.error) errors.push(r.error);
    }
    if (ok) revalidatePath(PATH);
    return { ok, errors: [...new Set(errors)] };
  } catch (e) { return aiError("pending-apply", e); }
}
