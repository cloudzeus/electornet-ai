import { NextResponse } from "next/server";
import { getVoiceConfig } from "@/lib/voice/tts";
import { getAi } from "@/lib/ai/openrouter";

/** Storefront probe: is the voice advisor on (setting + key)? */
export async function GET() {
  const [cfg, ai] = await Promise.all([getVoiceConfig(), getAi()]);
  return NextResponse.json({ enabled: cfg.enabled && (cfg.provider === "elevenlabs" || !!ai), provider: cfg.provider, voice: cfg.voice, rate: cfg.rate }, { headers: { "cache-control": "private, max-age=60" } });
}
