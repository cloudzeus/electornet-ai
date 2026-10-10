import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentPagePath, settleViva } from "./order-payment";

/**
 * Επιστροφή του πελάτη από τη Viva (Success / Failure URL της πηγής πληρωμής). Η Viva προσθέτει t (συναλλαγή) και
 * s (payment order). Δεν εμπιστευόμαστε τη διεύθυνση: η κατάσταση επιβεβαιώνεται από το API της Viva.
 */
export async function vivaReturn(req: Request, failed: boolean) {
  const u = new URL(req.url);
  const t = u.searchParams.get("t"), s = u.searchParams.get("s");
  const to = (path: string) => NextResponse.redirect(new URL(path, u.origin), 303);
  let number: string | null = null, verdict = "unknown";
  if (t) ({ number, verdict } = await settleViva(t).catch(() => ({ number: null, verdict: "unknown" as const })));
  if (!number && s) number = (await db.payment.findFirst({ where: { psp: "viva", pspRef: { startsWith: s } }, select: { order: { select: { number: true } } } }))?.order.number ?? null;
  if (!number) return to("/checkout");
  if (verdict === "paid") return to(`/checkout/epityxia?no=${encodeURIComponent(number)}`);
  if (verdict === "pending" || (!failed && verdict === "unknown")) return to(paymentPagePath(number, "&s=pending"));
  return to(paymentPagePath(number, "&e=failed"));
}
