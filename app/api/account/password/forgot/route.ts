import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/account/password-reset";
/** POST { email } — always 200 so the response never reveals whether the account exists. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string };
  if (!b.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const r = await requestPasswordReset(b.email);
  return NextResponse.json({ ok: true, throttled: r.throttled });
}
