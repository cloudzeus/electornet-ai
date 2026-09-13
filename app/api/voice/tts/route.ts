import { NextResponse } from "next/server";
import { speak } from "@/lib/voice/tts";
import { PRESET_PHRASES } from "@/lib/voice/phrases";
import { captureEvidence } from "@/lib/gdpr/evidence";

const bucket = new Map<string, { n: number; at: number }>();
function limited(ip: string, max = 60) {
  const now = Date.now(); const b = bucket.get(ip);
  if (!b || now - b.at > 3600000) { bucket.set(ip, { n: 1, at: now }); return false; }
  b.n++; return b.n > max;
}

export const maxDuration = 60;

/** POST { text } | { key } → { url, mime, durationMs, cached }. 60 phrases / hour / IP. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { text?: string; key?: string };
  const ev = await captureEvidence();
  if (limited(ev.ipHash ?? "anon")) return NextResponse.json({ error: "rate" }, { status: 429 });
  const preset = b.key ? PRESET_PHRASES.find((p) => p.key === b.key) : null;
  const text = preset?.text ?? b.text ?? "";
  if (!text.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const r = await speak(text, preset ? { key: preset.key } : {});
  if (!r) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.json(r);
}
