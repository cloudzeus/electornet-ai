import { NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { startCall, callState } from "@/lib/skets/eleven";
import { getSetting } from "@/lib/settings/store";
import snapshot from "@/lib/skets/snapshot.json";
import type { Snapshot } from "@/lib/skets/types";
import { callItems } from "@/lib/skets/script";

export const maxDuration = 30;
const snap = snapshot as Snapshot;

/**
 * POST { store } → ο Ερμής καλεί το SKETS_CALL_TO (ή το SKETS_TEST_TO σε πρόβα) για το κατάστημα που διάλεξε ο
 * παρουσιαστής, με τα προϊόντα που μπήκαν στο σπίτι. GET ?id= → κατάσταση και απομαγνητοφώνηση για τους υπότιτλους.
 */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { store?: number; rehearsal?: boolean };
  const store = snap.stores[b.store ?? -1];
  const to = (b.rehearsal ? process.env.SKETS_TEST_TO : process.env.SKETS_CALL_TO) || process.env.SKETS_TEST_TO;
  if (!store || !to) return NextResponse.json({ error: !store ? "άγνωστο κατάστημα" : "λείπει SKETS_CALL_TO / SKETS_TEST_TO" }, { status: 400 });
  const { data } = await getSetting("ai");
  try {
    const r = await startCall(to, { store: store.spoken, customer: snap.presenter.genitive, items: callItems(snap) }, String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb"));
    return NextResponse.json({ id: r.conversationId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^conv_[a-z0-9]+$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  try { return NextResponse.json(await callState(id)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
