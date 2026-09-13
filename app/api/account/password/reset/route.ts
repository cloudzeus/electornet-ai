import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/account/password-reset";
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!b.token || !b.password) return NextResponse.json({ ok: false, error: "Λείπουν στοιχεία." }, { status: 400 });
  const r = await resetPassword(b.token, b.password);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
