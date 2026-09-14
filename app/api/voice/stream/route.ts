import { NextResponse, after } from "next/server";
import { streamSpeech } from "@/lib/voice/tts";
import { PRESET_PHRASES } from "@/lib/voice/phrases";
import { captureEvidence } from "@/lib/gdpr/evidence";

const bucket = new Map<string, { n: number; at: number }>();
function limited(ip: string, max = 300) {
  const now = Date.now(); const b = bucket.get(ip);
  if (!b || now - b.at > 3600000) { bucket.set(ip, { n: 1, at: now }); return false; }
  b.n++; return b.n > max;
}

export const maxDuration = 60;

/**
 * POST { text } | { key }. Cache hit → JSON { url … }. Miss → a raw pcm16
 * mono stream (header `x-voice: stream`, `x-sample-rate`) that starts with
 * the model's first chunk; the take is cached after the response ends.
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { text?: string; key?: string };
  const ev = await captureEvidence();
  if (limited(ev.ipHash ?? "anon")) return NextResponse.json({ error: "rate" }, { status: 429 });
  const preset = b.key ? PRESET_PHRASES.find((p) => p.key === b.key) : null;
  const text = preset?.text ?? b.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const r = await streamSpeech(text, preset ? { key: preset.key } : {});
  if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (r.kind === "cached") return NextResponse.json(r.result);
  after(r.persist);
  return new Response(r.stream, { headers: { "content-type": "audio/L16", "x-voice": "stream", "x-sample-rate": String(r.sampleRate), "cache-control": "no-store", "x-accel-buffering": "no" } });
}
