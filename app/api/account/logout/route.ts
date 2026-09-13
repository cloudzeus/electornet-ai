import { NextResponse } from "next/server";
import { destroyCustomerSession } from "@/lib/account/session";
export async function POST(req: Request) {
  await destroyCustomerSession();
  return NextResponse.redirect(new URL("/", new URL(req.url).origin));
}
