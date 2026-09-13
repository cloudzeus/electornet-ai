import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/newsletter";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const r = await unsubscribe(u.searchParams.get("token") ?? "", u.searchParams.get("reason"), u.toString());
  return NextResponse.redirect(new URL(r.ok ? "/newsletter?ok=unsubscribed" : "/newsletter?ok=invalid", u.origin));
}
