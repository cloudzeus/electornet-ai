import { NextResponse } from "next/server";
import { emailCart, loadSavedCart, markRestored } from "@/lib/cart/email";

/** POST { email?, lines, reason?, source? } → sends the cart · GET ?token= → lines to restore (marks restored). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; lines?: { productId: string; qty: number; variant?: string; addons?: { slug: string; title: string; price: number }[] }[]; reason?: string; source?: string };
  const r = await emailCart({ email: b.email, lines: b.lines ?? [], reason: b.reason, source: b.source });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const c = await loadSavedCart(token);
  if (!c) return NextResponse.json({ ok: false, error: "Ο σύνδεσμος έληξε ή δεν ισχύει." }, { status: 404 });
  await markRestored(c.id);
  return NextResponse.json({ ok: true, lines: c.lines }, { headers: { "cache-control": "no-store" } });
}
