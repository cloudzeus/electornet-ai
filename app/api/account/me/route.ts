import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
/** Lightweight session probe for client components (name/email only). */
export async function GET() {
  const c = await getCustomerSession();
  return NextResponse.json(c ? { authenticated: true, id: c.id, firstName: c.firstName, email: c.email } : { authenticated: false }, { headers: { "cache-control": "no-store" } });
}
