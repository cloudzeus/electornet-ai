import { NextResponse } from "next/server";
import { transcribe } from "@/lib/voice/stt";
import { captureEvidence } from "@/lib/gdpr/evidence";

const bucket = new Map<string, { n: number; at: number }>();
function limited(ip: string, max = 60) {
  const now = Date.now(); const b = bucket.get(ip);
  if (!b || now - b.at > 3600000) { bucket.set(ip, { n: 1, at: now }); return false; }
  b.n++; return b.n > max;
}

export const maxDuration = 60;

/** POST multipart { audio } (webm/opus, mp4, wav ≤ 4 MB) → { text }. Audio is processed in memory only. 60 clips / hour / IP. */
export async function POST(req: Request) {
  const ev = await captureEvidence();
  if (limited(ev.ipHash ?? "anon")) return NextResponse.json({ error: "rate" }, { status: 429 });
  const fd = await req.formData().catch(() => null);
  const f = fd?.get("audio");
  if (!(f instanceof File)) return NextResponse.json({ error: "audio required" }, { status: 400 });
  if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("wav") ? "wav" : f.type.includes("ogg") ? "ogg" : "webm";
  const r = await transcribe(Buffer.from(await f.arrayBuffer()), f.type || "audio/webm", `speech.${ext}`);
  // 503 = ο πάροχος δεν δέχεται audio (π.χ. χωρίς υπόλοιπο)· ο browser το ξεχωρίζει από «δεν ακούστηκε τίποτα»
  if (!r.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json({ text: r.text, seconds: r.seconds, costUsd: r.costUsd });
}
