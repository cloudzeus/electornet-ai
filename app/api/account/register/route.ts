import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/account/oauth-flow";
import { registerCustomer } from "@/lib/account/session";

/** POST { firstName, lastName, email, mobile?, password, acceptTerms, source?, next? } → email με σύνδεσμο επιβεβαίωσης· ο λογαριασμός δημιουργείται στο GET /api/account/verify. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { firstName?: string; lastName?: string; email?: string; mobile?: string; password?: string; acceptTerms?: boolean; source?: string; next?: string };
  const r = await registerCustomer({ firstName: b.firstName ?? "", lastName: b.lastName ?? "", email: b.email ?? "", mobile: b.mobile, password: b.password ?? "", acceptTerms: !!b.acceptTerms, source: b.source, next: b.next, origin: await publicOrigin(req) });
  return NextResponse.json(r, { status: r.ok ? 200 : "exists" in r && r.exists ? 409 : 400 });
}
