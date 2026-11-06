import { NextResponse } from "next/server";
import { publicQuote, quoteCart, type QuoteInput } from "@/lib/cart/server";

/** POST { coupon?, payment?, delivery?, zip?, email?, street?, number?, city? } → ο τελικός υπολογισμός του checkout, πάντα από τον server. */
const txt = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) || null : null);
const addr = (b: QuoteInput) => ({ street: txt(b.street), number: txt(b.number), city: txt(b.city) });

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as QuoteInput;
  const q = await quoteCart({ coupon: b.coupon ?? null, payment: b.payment ?? null, delivery: b.delivery ?? null, zip: b.zip ?? null, email: b.email ?? null, storeId: b.storeId ?? null, carrier: b.carrier ?? null, ...addr(b) });
  return NextResponse.json(publicQuote(q), { headers: { "cache-control": "no-store" } });
}
