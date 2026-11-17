import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/account/oauth-flow";
import { confirmRegistration } from "@/lib/account/session";

/** GET ?token= — ο σύνδεσμος του email «account-welcome»: δημιουργεί τον λογαριασμό, συνδέει και γυρίζει στο `next` της εγγραφής. */
export async function GET(req: Request) {
  const r = await confirmRegistration(new URL(req.url).searchParams.get("token") ?? "");
  const to = r.status === "ok" ? r.next : r.status === "done" ? "/eisodos?verify=done" : "/eggrafi?verify=expired";
  return NextResponse.redirect(new URL(to, await publicOrigin(req)), 303);
}
