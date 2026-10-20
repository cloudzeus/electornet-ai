"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { approvePending, discardPending, updatePending, type ApproveResult } from "@/lib/catalog/foreign-import/pending";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { parseMoney } from "@/lib/catalog/pricing/markup";

const PATH = "/admin/catalog/templates/nea-eidi";
const ids = (list: string[]) => [...new Set(list.filter((x) => typeof x === "string" && x))].slice(0, 100);

/** Έγκριση: δημιουργία στο SoftOne (ανενεργά), όπως τα νέα είδη του template — χρειάζεται επεξεργασία προϊόντων ΚΑΙ εκτέλεση συγχρονισμού ERP. */
export async function approveItems(list: string[]): Promise<ApproveResult[] | { error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!can(user.permissions, "catalog.sync.run")) return { error: "Για έγκριση χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP»." };
  const res = await approvePending(ids(list), user.id);
  if (res.some((r) => r.ok)) resetCatalogCache();
  await audit(user.id, "catalog.pending.approve", "PendingItem", null, null, { results: res.map((r) => ({ id: r.id, ok: r.ok, mtrl: r.mtrl })) });
  revalidatePath(PATH);
  return res;
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
