import { NextResponse } from "next/server";
import { publicQuote, quoteCart, syncCart, type CartItemIn } from "@/lib/cart/server";

/** GET: το καλάθι υπολογισμένο από τον server (τιμές, προσφορές, μεταφορικά). PUT: ο browser καθρεφτίζει όλο το καλάθι του. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = await quoteCart({ coupon: u.searchParams.get("coupon"), delivery: (u.searchParams.get("delivery") as "courier" | null) ?? null });
  return NextResponse.json(publicQuote(q), { headers: { "cache-control": "no-store" } });
}
export async function PUT(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { lines?: CartItemIn[] };
  if (!Array.isArray(b.lines)) return NextResponse.json({ ok: false, error: "lines required" }, { status: 400 });
  const r = await syncCart(b.lines);
  return NextResponse.json({ ok: !!r, ...r });
}
