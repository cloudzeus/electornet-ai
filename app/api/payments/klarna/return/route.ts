import { paymentPagePath, validPaymentKey } from "@/lib/payments/order-payment";
import { settleKlarna } from "@/lib/payments/klarna-order";

/**
 * Επιστροφή του πελάτη από τη σελίδα της Klarna (success / cancel / back / failure / error). Δεν εμπιστευόμαστε τη
 * διεύθυνση: η κατάσταση επιβεβαιώνεται από το API της Klarna.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const no = u.searchParams.get("no") ?? "", r = u.searchParams.get("r") ?? "";
  // σχετικό Location: πίσω από τον proxy το req.url είναι localhost:3000 και θα έστελνε τον πελάτη εκεί μετά την πληρωμή
  const to = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  if (!no || !validPaymentKey(no, u.searchParams.get("k"))) return to("/checkout");
  const v = await settleKlarna(no).catch(() => "unknown" as const);
  if (v === "paid") return to(`/checkout/epityxia?no=${encodeURIComponent(no)}`);
  if (v === "pending" || (r === "ok" && (v === "waiting" || v === "unknown"))) return to(paymentPagePath(no, "&s=pending"));
  return to(paymentPagePath(no, "&e=failed"));
}
