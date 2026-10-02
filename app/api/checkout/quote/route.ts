import { NextResponse } from "next/server";
import { publicQuote, quoteCart, type QuoteInput } from "@/lib/cart/server";

/** POST { coupon?, payment?, delivery?, zip?, email? } → ο τελικός υπολογισμός του checkout, πάντα από τον server. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as QuoteInput;
  const q = await quoteCart({ coupon: b.coupon ?? null, payment: b.payment ?? null, delivery: b.delivery ?? null, zip: b.zip ?? null, email: b.email ?? null });
  return NextResponse.json(publicQuote(q), { headers: { "cache-control": "no-store" } });
}
