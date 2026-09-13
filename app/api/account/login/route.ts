import { NextResponse } from "next/server";
import { loginCustomer } from "@/lib/account/session";
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!b.email || !b.password) return NextResponse.json({ ok: false, error: "Συμπλήρωσε email και κωδικό." }, { status: 400 });
  const r = await loginCustomer(b.email, b.password);
  return NextResponse.json(r, { status: r.ok ? 200 : 401 });
}
