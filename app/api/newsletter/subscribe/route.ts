import { NextResponse } from "next/server";
import { subscribe } from "@/lib/newsletter";

/** POST { email, firstName?, source?, url?, timezone?, consentText? } → double opt-in email. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; firstName?: string; source?: string; url?: string; timezone?: string; consentText?: string };
  if (!b.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const r = await subscribe({ email: b.email, firstName: b.firstName ?? null, source: b.source ?? "footer", url: b.url ?? null, timezone: b.timezone ?? null, consentText: b.consentText });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
