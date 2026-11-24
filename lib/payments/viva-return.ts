import "server-only";
import { db } from "@/lib/db";
import { paymentPagePath, settleViva } from "./order-payment";
import { logPayment } from "./events";
import { devicePath } from "@/lib/warranty/link";

/**
 * Επιστροφή του πελάτη από τη Viva (Success / Failure URL της πηγής πληρωμής). Η Viva προσθέτει t (συναλλαγή) και
 * s (payment order). Δεν εμπιστευόμαστε τη διεύθυνση: η κατάσταση επιβεβαιώνεται από το API της Viva.
 * Το EventId (αιτία) της διεύθυνσης γράφεται μόνο στο ιστορικό πληρωμής, ως ένδειξη για το προσωπικό.
 */
export async function vivaReturn(req: Request, failed: boolean) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t"), s = u.searchParams.get("s"), eventId = u.searchParams.get("EventId") ?? u.searchParams.get("eventId");
  // σχετικό Location: πίσω από τον proxy το req.url είναι localhost:3000 και θα έστελνε τον πελάτη εκεί μετά την πληρωμή
  const to = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  let number: string | null = null, verdict = "unknown", kind: string | undefined;
  if (t) ({ number, verdict, kind } = await settleViva(t, { source: "return", eventId }).catch(() => ({ number: null, verdict: "unknown" as const, kind: undefined })));
  // αγορά επέκτασης εγγύησης → πίσω στη σελίδα της συσκευής (προσωπικός σύνδεσμος: λειτουργεί και χωρίς σύνδεση)
  const ext = kind === "order" || (!t && !s) ? null : await db.warrantyExtension.findFirst({ where: { psp: "viva", OR: [...(number ? [{ number }] : []), ...(s ? [{ pspRef: { startsWith: s } }] : [])] }, select: { deviceId: true } }).catch(() => null);
  if (ext) return to(devicePath(ext.deviceId, `?ext=${verdict === "paid" ? "ok" : verdict === "pending" || (!failed && verdict === "unknown") ? "pending" : "failed"}`));
  if (!number && s) {
    const p = await db.payment.findFirst({ where: { psp: "viva", pspRef: { startsWith: s } }, select: { orderId: true, status: true, order: { select: { number: true } } } });
    number = p?.order.number ?? null;
    // γύρισε με αποτυχία χωρίς συναλλαγή (π.χ. ακύρωσε στη σελίδα της Viva): μένει στο ιστορικό
    if (p && failed && !t && p.status !== "paid") await logPayment(p.orderId, "failed", { source: "return", psp: "viva", pspOrder: s, eventId });
  }
  if (!number) return to("/checkout");
  if (verdict === "paid") return to(`/checkout/epityxia?no=${encodeURIComponent(number)}`);
  if (verdict === "pending" || (!failed && verdict === "unknown")) return to(paymentPagePath(number, "&s=pending"));
  return to(paymentPagePath(number, "&e=failed"));
}
