import { NextResponse } from "next/server";
import { verifyPasswordCode } from "@/lib/account/password-reset";
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  if (!b.email || !b.code) return NextResponse.json({ ok: false, error: "Συμπλήρωσε τον κωδικό." }, { status: 400 });
  const r = await verifyPasswordCode(b.email, b.code);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
