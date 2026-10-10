import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentPagePath, settleViva } from "./order-payment";
import { devicePath } from "@/lib/warranty/link";

/**
 * Επιστροφή του πελάτη από τη Viva (Success / Failure URL της πηγής πληρωμής). Η Viva προσθέτει t (συναλλαγή) και
 * s (payment order). Δεν εμπιστευόμαστε τη διεύθυνση: η κατάσταση επιβεβαιώνεται από το API της Viva.
 */
export async function vivaReturn(req: Request, failed: boolean) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t"), s = u.searchParams.get("s");
  const to = (path: string) => NextResponse.redirect(new URL(path, u.origin), 303);
  let number: string | null = null, verdict = "unknown", kind: string | undefined;
  if (t) ({ number, verdict, kind } = await settleViva(t).catch(() => ({ number: null, verdict: "unknown" as const, kind: undefined })));
  // αγορά επέκτασης εγγύησης → πίσω στη σελίδα της συσκευής (προσωπικός σύνδεσμος: λειτουργεί και χωρίς σύνδεση)
  const ext = kind === "order" || (!t && !s) ? null : await db.warrantyExtension.findFirst({ where: { psp: "viva", OR: [...(number ? [{ number }] : []), ...(s ? [{ pspRef: { startsWith: s } }] : [])] }, select: { deviceId: true } }).catch(() => null);
  if (ext) return to(devicePath(ext.deviceId, `?ext=${verdict === "paid" ? "ok" : verdict === "pending" || (!failed && verdict === "unknown") ? "pending" : "failed"}`));
  if (!number && s) number = (await db.payment.findFirst({ where: { psp: "viva", pspRef: { startsWith: s } }, select: { order: { select: { number: true } } } }))?.order.number ?? null;
  if (!number) return to("/checkout");
  if (verdict === "paid") return to(`/checkout/epityxia?no=${encodeURIComponent(number)}`);
  if (verdict === "pending" || (!failed && verdict === "unknown")) return to(paymentPagePath(number, "&s=pending"));
  return to(paymentPagePath(number, "&e=failed"));
}
