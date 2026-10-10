import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkoutUrl, judgeTransaction, type VivaPay, type VivaTransaction } from "@/lib/payments/viva-core";
import { createVivaOrder, vivaConfig } from "@/lib/payments/viva";
import { addMonths, EXTENSION_MONTHS, LEGAL_WARRANTY_MONTHS } from "./policy";
import { extOffers } from "./server";

/**
 * Επέκταση εγγύησης επί πληρωμή, από «Οι συσκευές μου» (συσκευές χωρίς δωρεάν επέκταση):
 * 1. ο server ξαναϋπολογίζει όρους και τιμή (ποτέ από τον browser) → WarrantyExtension «pending» + payment order Viva
 * 2. ο πελάτης πληρώνει στη Viva
 * 3. επιστροφή ή webhook → η συναλλαγή επιβεβαιώνεται από το API της Viva (κωδικός + ποσό) → +24 μήνες στη συσκευή
 */
const cents = (d: unknown) => Math.round(Number(d) * 100);

export async function startPaidExtension(customerId: string, deviceId: string, pay: VivaPay = "card"): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const c = await vivaConfig();
  if (!c) return { ok: false, error: "Οι online πληρωμές δεν είναι διαθέσιμες αυτή τη στιγμή. Κάλεσέ μας ή πέρασε από ένα κατάστημα." };
  const d = await db.customerDevice.findFirst({ where: { id: deviceId, customerId }, select: { id: true, title: true, brand: true, productId: true, registeredBy: true, warrantyUntil: true, warrantyMonths: true, purchasedAt: true, createdAt: true, extendedUntil: true, orderLineId: true, purchaseLineId: true, customer: { select: { email: true, firstName: true, lastName: true, mobile: true, phone: true } } } });
  if (!d) return { ok: false, error: "Η συσκευή δεν βρέθηκε." };
  const until = d.warrantyUntil ?? addMonths(d.purchasedAt ?? d.createdAt, d.warrantyMonths || LEGAL_WARRANTY_MONTHS);
  const offer = (await extOffers([{ ...d, warrantyUntil: until }])).get(d.id);
  if (offer?.kind === "free") return { ok: false, error: "Αυτή η συσκευή παίρνει την επέκταση δωρεάν." };
  if (offer?.kind !== "paid") return { ok: false, error: offer?.reason ?? "Δεν γίνεται επέκταση για αυτή τη συσκευή." };
  if (!d.customer.email) return { ok: false, error: "Πρόσθεσε email στα στοιχεία σου για να λάβεις την απόδειξη." };
  // μία ενεργή πληρωμή τη φορά για κάθε συσκευή: οι παλιές εκκρεμείς ακυρώνονται
  await db.warrantyExtension.updateMany({ where: { deviceId: d.id, status: "pending" }, data: { status: "cancelled" } });
  const number = `EXT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(randomInt(1000, 9999))}`;
  const ext = await db.warrantyExtension.create({ data: { number, customerId, deviceId: d.id, months: EXTENSION_MONTHS, amount: offer.price, tier: offer.tier as unknown as Prisma.InputJsonValue, psp: "viva" } });
  try {
    const code = await createVivaOrder(c, { amount: cents(offer.price), number, customer: { email: d.customer.email, fullName: `${d.customer.firstName} ${d.customer.lastName}`.trim(), phone: d.customer.mobile ?? d.customer.phone } });
    await db.warrantyExtension.update({ where: { id: ext.id }, data: { pspRef: code } });
    return { ok: true, url: checkoutUrl(c.mode, code, pay) };
  } catch {
    await db.warrantyExtension.update({ where: { id: ext.id }, data: { status: "failed" } });
    return { ok: false, error: "Η σύνδεση με τη Viva απέτυχε. Δοκίμασε ξανά σε λίγο." };
  }
}

/**
 * Συναλλαγή Viva που δεν ανήκει σε παραγγελία: ψάχνει αγορά επέκτασης με τον ίδιο κωδικό. Ιδεμπότητη.
 * null = δεν είναι επέκταση εγγύησης.
 */
export async function settleExtension(t: VivaTransaction, transactionId: string): Promise<{ number: string; verdict: ReturnType<typeof judgeTransaction> } | null> {
  const ext = await db.warrantyExtension.findFirst({ where: { psp: "viva", pspRef: { startsWith: String(t.orderCode) } }, select: { id: true, number: true, status: true, amount: true, pspRef: true, months: true, deviceId: true, customerId: true } });
  if (!ext) return null;
  const code = ext.pspRef!.split(":")[0];
  if (ext.status === "paid") return { number: ext.number, verdict: "paid" };
  const verdict = judgeTransaction(t, { orderCode: code, totalCents: cents(ext.amount) });
  if (verdict !== "paid") {
    await db.warrantyExtension.update({ where: { id: ext.id }, data: { status: verdict === "pending" ? "processing" : verdict === "mismatch" ? "review" : "failed" } });
    return { number: ext.number, verdict };
  }
  const n = await db.warrantyExtension.updateMany({ where: { id: ext.id, status: { not: "paid" } }, data: { status: "paid", pspRef: `${code}:${transactionId}`, paidAt: new Date() } });
  if (n.count === 1) {
    const d = await db.customerDevice.findUnique({ where: { id: ext.deviceId }, select: { title: true, warrantyUntil: true, warrantyMonths: true, purchasedAt: true, createdAt: true, extendedUntil: true } });
    if (d && !d.extendedUntil) {
      const base = d.warrantyUntil ?? addMonths(d.purchasedAt ?? d.createdAt, d.warrantyMonths || LEGAL_WARRANTY_MONTHS);
      const extendedUntil = addMonths(base, ext.months);
      await db.customerDevice.update({ where: { id: ext.deviceId }, data: { warrantyUntil: base, extendedUntil, extendedPlan: `paid-${ext.months}` } });
      await db.customerEvent.create({ data: { customerId: ext.customerId, kind: "device", meta: { by: "customer", id: ext.deviceId, title: d.title, action: "warranty-extended-paid", number: ext.number, amount: Number(ext.amount), until: extendedUntil.toISOString().slice(0, 10) } } }).catch(() => null);
    } else {
      // πληρώθηκε, αλλά η συσκευή απέκτησε στο μεταξύ επέκταση: θέλει επιστροφή χρημάτων από τη διαχείριση
      await db.warrantyExtension.update({ where: { id: ext.id }, data: { status: "review" } });
    }
  }
  return { number: ext.number, verdict };
}
