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

/** «Αποστολή στο SoftOne»: καταχωρεί το παραστατικό (setData SALDOC). Οι δικλείδες είναι στο lib/softone/order-doc. */
export async function erpSendAction(orderId: string, number: string) {
  const u = await requirePermission("orders.write");
  const { sendSaldoc } = await import("@/lib/softone/order-doc");
  const r = await sendSaldoc(orderId, u.id).catch((e) => ({ ok: false, message: e instanceof Error ? e.message : "Σφάλμα σύνδεσης με το SoftOne." }));
  done(number);
  return r;
}

/** Πορεία της παραγγελίας στο SoftOne (μόνο αναγνώσεις) — φορτώνει όταν ανοίξει η καρτέλα. */
export async function orderChainAction(orderId: string) {
  await requirePermission("orders.read");
  const { orderChain } = await import("@/lib/softone/order-chain");
  return orderChain(orderId);
}

/** Πορεία στο SoftOne μιας παραγγελίας του παλιού eshop. Το FINDOC από τη βάση μας, όχι από τον browser. Μόνο αναγνώσεις. */
export async function legacyChainAction(purchaseId: string) {
  await requirePermission("orders.read");
  const { db } = await import("@/lib/db");
  const p = await db.purchase.findFirst({ where: { id: purchaseId, source: "softone", kind: "order" }, select: { s1Findoc: true } });
  if (!p?.s1Findoc) return { ok: false as const, reason: "not-sent" as const };
  const { chainFor } = await import("@/lib/softone/order-chain");
  return chainFor(p.s1Findoc);
}

/** Παραγγελίες → Ρυθμίσεις ενημέρωσης: ποιο στάδιο (τύπος παραστατικού SoftOne) στέλνει email και με ποιο κείμενο. */
export async function saveStageSettingAction(docTypeId: string, input: { notify: boolean; title: string; message: string }) {
  const u = await requirePermission("orders.write");
  const title = input.title.trim().slice(0, 140), message = input.message.trim().slice(0, 4000);
  if (input.notify && !message) return { ok: false as const, error: "Γράψε το κείμενο του email πριν ενεργοποιήσεις την ενημέρωση." };
  const { db } = await import("@/lib/db");
  const { audit } = await import("@/lib/rbac/audit");
  const before = await db.docType.findUnique({ where: { id: docTypeId }, select: { eshop: true, notifyCustomer: true, customerTitle: true, customerMessage: true } });
  if (!before?.eshop) return { ok: false as const, error: "Ο τύπος παραστατικού δεν βρέθηκε." };
  const data = { notifyCustomer: input.notify, customerTitle: title || null, customerMessage: message || null };
  await db.docType.update({ where: { id: docTypeId }, data });
  await audit(u.id, "orders.stage-setting", "DocType", docTypeId, before, data);
  revalidatePath("/admin/orders/enimerosi");
  return { ok: true as const };
}

/** Ροή παραγγελίας: «Μετασχηματισμός» — προεπισκόπηση και υπολογισμός στο SoftOne, χωρίς αποθήκευση. */
export async function transformPreviewAction(orderId: string, findoc: number) {
  await requirePermission("orders.write");
  const { transformPreview } = await import("@/lib/softone/transform");
  return transformPreview(orderId, Number(findoc)).catch((e) => { console.error("[transform-preview]", e); return { ok: false as const, error: "Δεν διαβάστηκε το παραστατικό από το SoftOne. Δοκίμασε ξανά σε λίγο." }; });
}

/** Ροή παραγγελίας: email στον πελάτη για ένα στάδιο του SoftOne, με το κείμενο των Ρυθμίσεων ενημέρωσης. */
export async function stageMailAction(orderId: string, number: string, findoc: number) {
  const u = await requirePermission("orders.write");
  const { sendStageMail } = await import("@/lib/orders/erp-stages");
  const r = await sendStageMail(orderId, Number(findoc)).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "Σφάλμα email." }));
  if (r.ok) { const { audit } = await import("@/lib/rbac/audit"); await audit(u.id, "order.email", "Order", orderId, null, { template: "order-erp-stage", findoc }); }
  done(number);
  return r;
}
