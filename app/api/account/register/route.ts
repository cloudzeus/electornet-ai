import { NextResponse } from "next/server";
import { registerCustomer } from "@/lib/account/session";

/** POST { firstName, lastName, email, mobile?, password, acceptTerms, source? } → νέος λογαριασμός + σύνδεση. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { firstName?: string; lastName?: string; email?: string; mobile?: string; password?: string; acceptTerms?: boolean; source?: string };
  const r = await registerCustomer({ firstName: b.firstName ?? "", lastName: b.lastName ?? "", email: b.email ?? "", mobile: b.mobile, password: b.password ?? "", acceptTerms: !!b.acceptTerms, source: b.source });
  return NextResponse.json(r, { status: r.ok ? 200 : "exists" in r && r.exists ? 409 : 400 });
}
