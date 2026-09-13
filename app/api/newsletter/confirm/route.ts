import { NextResponse } from "next/server";
import { confirm } from "@/lib/newsletter";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const r = await confirm(u.searchParams.get("token") ?? "", u.toString());
  return NextResponse.redirect(new URL(r.ok ? `/newsletter?ok=${r.already ? "already" : "confirmed"}` : "/newsletter?ok=invalid", u.origin));
}
