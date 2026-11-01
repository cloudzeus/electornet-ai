import { sketsReq } from "@/lib/skets/auth";
import { subscribe, lastState } from "@/lib/skets/bus";

/**
 * SSE του σκετς. role=stage: λαμβάνει τις εντολές του τηλεχειριστηρίου. role=remote: λαμβάνει την κατάσταση της σκηνής
 * (με την τελευταία γνωστή αμέσως μόλις συνδεθεί).
 */
export async function GET(req: Request) {
  if (!sketsReq(req)) return new Response("forbidden", { status: 403 });
  const role = new URL(req.url).searchParams.get("role") === "remote" ? "remote" : "stage";
  const enc = new TextEncoder();
  let off = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (data: unknown) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { off(); } };
      if (role === "remote") { const s = lastState(); if (s) send({ kind: "state", state: s }); }
      off = subscribe((ev) => { if ((role === "stage" && ev.kind === "cmd") || (role === "remote" && ev.kind === "state")) send(ev); });
      ping = setInterval(() => { try { ctrl.enqueue(enc.encode(": ping\n\n")); } catch { off(); } }, 15000);
      req.signal.addEventListener("abort", () => { off(); clearInterval(ping); try { ctrl.close(); } catch {} });
    },
    cancel() { off(); clearInterval(ping); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
