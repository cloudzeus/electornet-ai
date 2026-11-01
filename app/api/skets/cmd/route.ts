import { NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { sendCmd, setState, type Cmd, type StageState } from "@/lib/skets/bus";

const CMDS = new Set(["next", "back", "reset", "goto", "store", "skipCall"]);

/** POST { cmd } από το τηλεχειριστήριο → σκηνή · POST { state } από τη σκηνή → τηλεχειριστήριο. */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { cmd?: Cmd; state?: StageState };
  if (b.cmd && CMDS.has(b.cmd.t)) { sendCmd(b.cmd); return NextResponse.json({ ok: true }); }
  if (b.state && typeof b.state.i === "number") { setState({ ...b.state, at: Date.now() }); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}
