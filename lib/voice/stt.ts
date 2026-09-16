import "server-only";
import { db } from "@/lib/db";
import { getAi } from "@/lib/ai/openrouter";
import { markupFor, billed } from "@/lib/ai/pricing";
import { usdEurRate } from "@/lib/fx";
import { getVoiceConfig } from "./tts";

const today = () => new Date().toISOString().slice(0, 10);

/** Customer speech → text through OpenRouter's /audio/transcriptions (Whisper large v3, Greek). Cost per second of audio, logged with markup. */
export type Transcribed = { ok: true; text: string; seconds: number; costUsd: number } | { ok: false; status: number; error: string };

export async function transcribe(bytes: Buffer, mime: string, filename = "speech.webm"): Promise<Transcribed> {
  const [cfg, ai] = await Promise.all([getVoiceConfig(), getAi()]);
  if (!cfg.enabled || !ai) return { ok: false, status: 0, error: "Η φωνή είναι ανενεργή στις ρυθμίσεις." };
  const t0 = Date.now();
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  fd.append("model", cfg.sttModel);
  fd.append("language", "el");
  fd.append("prompt", "Euronics, Ερμής, πλυντήριο, ψυγείο, τηλεόραση, κλιματιστικό, δόσεις, κατάστημα.");
  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${ai.apiKey}` }, body: fd, signal: AbortSignal.timeout(30000) }).catch(() => null);
  const j = res ? ((await res.json().catch(() => null)) as { text?: string; usage?: { seconds?: number; cost?: number }; error?: { message?: string } } | null) : null;
  const ms = Date.now() - t0;
  const [markupPct, fxRate] = await Promise.all([markupFor(cfg.sttModel), usdEurRate().catch(() => null)]);
  const costUsd = j?.usage?.cost ?? 0;
  const billedUsd = billed(costUsd, markupPct);
  const ok = !!(res?.ok && j?.text !== undefined);
  // Η αιτία μένει στο ledger: «402 requires at least $0.50 in balance for audio» λέει ακριβώς τι να κάνει ο διαχειριστής
  const error = ok ? undefined : `${res?.status ?? "network"}: ${j?.error?.message ?? (res ? "χωρίς κείμενο στην απάντηση" : "δεν απάντησε")}`.slice(0, 300);
  await db.aiUsage.create({ data: { day: today(), feature: "stt", model: cfg.sttModel, tokensIn: Math.round(j?.usage?.seconds ?? 0), costUsd, markupPct, billedUsd, fxRate, billedEur: fxRate ? billedUsd * fxRate : null, ms, ok, error } }).catch(() => null);
  if (!ok || !j || j.text === undefined) return { ok: false, status: res?.status ?? 0, error: error ?? "" };
  return { ok: true, text: j.text.trim(), seconds: j.usage?.seconds ?? 0, costUsd };
}
