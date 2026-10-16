"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { isOrderStatus } from "@/lib/orders/model";
import { addNote, changeStatus, deleteNote, pinNote, recordRefund, resendConfirmation, setReturnStatus } from "@/lib/orders/ops";

const done = (number?: string) => { revalidatePath("/admin/orders"); if (number) revalidatePath(`/admin/orders/${number}`); };
const staffOf = (u: { id: string; name?: string | null }) => ({ id: u.id, name: u.name ?? null });

export async function changeStatusAction(orderId: string, number: string, to: string, opts: { notify: boolean; reason?: string }) {
  const u = await requirePermission("orders.write");
  if (!isOrderStatus(to)) return { ok: false as const, error: "Άγνωστη κατάσταση." };
  const r = await changeStatus(orderId, to, opts, staffOf(u));
  done(number);
  return r;
}

/** Ίδια αλλαγή σε πολλές παραγγελίες (μπάρα επιλογής) — όσες δεν επιτρέπεται, μένουν ως έχουν και αναφέρονται. */
export async function bulkStatusAction(ids: string[], to: string, notify: boolean) {
  const u = await requirePermission("orders.write");
  if (!isOrderStatus(to)) return { ok: false as const, error: "Άγνωστη κατάσταση." };
  let ok = 0; const failed: string[] = [];
  for (const id of ids.slice(0, 100)) {
    const r = await changeStatus(id, to, { notify }, staffOf(u));
    if (r.ok) ok++; else failed.push(r.error);
  }
  done();
  return { ok: true as const, message: `${ok} άλλαξαν${failed.length ? ` · ${failed.length} δεν επιτρέπεται (${[...new Set(failed)].slice(0, 2).join(" ")})` : ""}.` };
}

export async function resendConfirmationAction(orderId: string, number: string) {
  const u = await requirePermission("orders.write");
  const r = await resendConfirmation(orderId, staffOf(u));
  done(number);
  return r;
}

export async function addNoteAction(orderId: string, number: string, text: string) {
  const u = await requirePermission("orders.write");
  const r = await addNote(orderId, text, staffOf(u));
  done(number);
  return r;
}
export async function pinNoteAction(noteId: string, number: string, pinned: boolean) {
  await requirePermission("orders.write");
  const r = await pinNote(noteId, pinned);
  done(number);
  return r;
}
export async function deleteNoteAction(noteId: string, number: string) {
  const u = await requirePermission("orders.write");
  const r = await deleteNote(noteId, staffOf(u));
  done(number);
  return r;
}

export async function returnStatusAction(returnId: string, number: string, to: string, opts: { notify: boolean; refund?: number | null }) {
  const u = await requirePermission("orders.write");
  const r = await setReturnStatus(returnId, to, opts, staffOf(u));
  done(number);
  return r;
}

export async function refundAction(orderId: string, number: string, amount: number, method: string) {
  const u = await requirePermission("orders.refund");
  const r = await recordRefund(orderId, amount, method, staffOf(u));
  done(number);
  return r;
}

/** «Έλεγχος στο SoftOne»: calculate χωρίς αποθήκευση — το σύνολο του SoftOne πρέπει να ταιριάζει με την παραγγελία. */
export async function erpCheckAction(orderId: string) {
  await requirePermission("orders.write");
  const { checkSaldocInSoftone } = await import("@/lib/softone/order-doc");
  return checkSaldocInSoftone(orderId).catch((e) => ({ ok: false, message: e instanceof Error ? e.message : "Σφάλμα σύνδεσης με το SoftOne." }));
}
