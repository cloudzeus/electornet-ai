import { NextResponse } from "next/server";
import { sketsKeyOk } from "@/lib/skets/auth";
import { addTranscript, setStatus } from "@/lib/skets/live";

/**
 * Webhook του Vapi για την κλήση του σκετς: transcript (πρόχειρο/τελικό, ανά ρόλο), status-update, end-of-call-report.
 * Το Vapi στέλνει το server.secret στο header x-vapi-secret — εδώ είναι το SKETS_KEY.
 */
interface VapiMsg { type?: string; role?: string; transcriptType?: string; transcript?: string; status?: string; endedReason?: string; call?: { id?: string } }

export async function POST(req: Request) {
  if (!sketsKeyOk(req.headers.get("x-vapi-secret"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { message: m } = (await req.json().catch(() => ({}))) as { message?: VapiMsg };
  const id = m?.call?.id;
  if (!m || !id) return NextResponse.json({ ok: true });
  if (m.type === "transcript" && m.transcript) addTranscript(id, m.role === "user" ? "store" : "hermes", m.transcript, m.transcriptType === "final");
  else if (m.type === "status-update" && m.status) setStatus(id, m.status, m.endedReason);
  else if (m.type === "end-of-call-report") setStatus(id, "ended", m.endedReason);
  return NextResponse.json({ ok: true });
}
