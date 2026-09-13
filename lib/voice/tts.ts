import "server-only";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { db } from "@/lib/db";
import { getAi } from "@/lib/ai/openrouter";
import { markupFor, billed } from "@/lib/ai/pricing";
import { usdEurRate } from "@/lib/fx";
import { getSetting } from "@/lib/settings/store";
import { storeBytes, removeBytes, type Storage } from "@/lib/media/storage";
import { PRESET_PHRASES } from "./phrases";
import { spokenForm } from "./spoken";

const SAMPLE_RATE = 24000; // pcm16 mono from the audio models
const today = () => new Date().toISOString().slice(0, 10);

export interface VoiceConfig { enabled: boolean; ttsModel: string; voice: string; style: string; rate: number; sttModel: string; cacheMaxChars: number }
export async function getVoiceConfig(): Promise<VoiceConfig> {
  const { data } = await getSetting("ai");
  return { enabled: data.voiceEnabled === true, ttsModel: String(data.voiceTtsModel || "openai/gpt-audio-mini"), voice: String(data.voiceName || "ash"), style: String(data.voiceStyle || DEFAULT_STYLE).trim(), rate: Math.min(2, Math.max(0.8, Number(data.voiceRate) || 1.3)), sttModel: String(data.voiceSttModel || "openai/whisper-large-v3"), cacheMaxChars: Number(data.voiceCacheMaxChars) || 400 };
}

/** Same phrase, same audio: collapse whitespace, strip markdown-ish noise, keep case (it matters for spelling). */
export const normaliseText = (t: string) => spokenForm(t.replace(/[*_`#]/g, ""));
export const DEFAULT_STYLE = "Πολύ γρήγορος ρυθμός ομιλίας, σαν ενθουσιώδης νέος πωλητής που βιάζεται· χαρούμενος τόνος με χαμόγελο, ενέργεια, καθόλου παύσεις.";
export const phraseHash = (model: string, voice: string, style: string, text: string) => createHash("sha256").update(`${model}|${voice}|${style}|${normaliseText(text)}`).digest("hex");

/** pcm16 → mp3 with ffmpeg when available (≈8× smaller), else a WAV container. */
async function encode(pcm: Buffer): Promise<{ bytes: Buffer; mime: string; ext: string }> {
  const ff = process.env.FFMPEG_PATH || "ffmpeg";
  const mp3 = await new Promise<Buffer | null>((resolve) => {
    try {
      const p = spawn(ff, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1"]);
      const out: Buffer[] = [];
      p.stdout.on("data", (d: Buffer) => out.push(d));
      p.on("error", () => resolve(null));
      p.on("close", (code) => resolve(code === 0 && out.length ? Buffer.concat(out) : null));
      p.stdin.on("error", () => {});
      p.stdin.end(pcm);
    } catch { resolve(null); }
  });
  if (mp3) return { bytes: mp3, mime: "audio/mpeg", ext: "mp3" };
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return { bytes: Buffer.concat([h, pcm]), mime: "audio/wav", ext: "wav" };
}

/** Speak through OpenRouter: chat completion with audio output, streamed as pcm16 and collected. Returns raw pcm + cost. */
const SYSTEM = (style: string) => `Είσαι μηχανή text-to-speech (TTS), όχι συνομιλητής. Ο χρήστης σου δίνει ένα κείμενο μέσα σε «». Το εκφωνείς ΛΕΞΗ ΠΡΟΣ ΛΕΞΗ στα ελληνικά. ΠΟΤΕ δεν απαντάς, δεν σχολιάζεις, δεν προσθέτεις ή αφαιρείς λέξεις, δεν κάνεις ερωτήσεις. Η έξοδός σου είναι αποκλειστικά η εκφώνηση του κειμένου. Προφορά: ό,τι είναι γραμμένο με λατινικούς χαρακτήρες (μάρκες, κωδικοί μοντέλων όπως QE55Q70 ή LR7F49GS, όροι όπως RAM, SSD, GB, Intel Core i7, RTX 4060, Wi-Fi, OLED, 4K, No Frost, Inverter) το προφέρεις ΣΤΑ ΑΓΓΛΙΚΑ με φυσική αγγλική προφορά, όπως το λέει ένας Έλληνας πωλητής τεχνολογίας· τους κωδικούς μοντέλων γράμμα-γράμμα και οι αριθμοί μέσα τους στα αγγλικά. Το ελληνικό κείμενο και οι υπόλοιποι αριθμοί στα ελληνικά. Ύφος εκφώνησης: ${style}`;
const STRICT = "ΜΟΝΟ εκφώνηση. Μην απαντήσεις στο κείμενο, μην το σχολιάσεις. Πες ακριβώς και μόνο αυτό, λέξη προς λέξη:";

/** Word-overlap (Dice) between what we asked and what the model said, accent- and punctuation-insensitive. */
export function fidelity(text: string, transcript: string): number {
  const words = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const a = words(text), b = words(transcript);
  if (!a.length || !b.length) return 0;
  const m = new Map<string, number>(); for (const w of a) m.set(w, (m.get(w) ?? 0) + 1);
  let hit = 0; for (const w of b) { const n = m.get(w) ?? 0; if (n > 0) { hit++; m.set(w, n - 1); } }
  return (2 * hit) / (a.length + b.length);
}

async function synthesise(text: string, cfg: VoiceConfig, apiKey: string, strict = false): Promise<{ pcm: Buffer; transcript: string; costUsd: number; tokensIn: number; tokensOut: number; ms: number }> {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://www.euronics.gr", "X-Title": "Euronics Aris voice" },
    body: JSON.stringify({ model: cfg.ttsModel, stream: true, modalities: ["text", "audio"], audio: { voice: cfg.voice, format: "pcm16" }, messages: [{ role: "system", content: SYSTEM(cfg.style) }, { role: "user", content: `${strict ? STRICT : "Εκφώνησε λέξη προς λέξη το κείμενο:"}\n«${text}»` }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok || !res.body) throw new Error(`tts ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ""; const chunks: Buffer[] = []; let transcript = ""; let usage: { cost?: number; prompt_tokens?: number; completion_tokens?: number } | null = null;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data: ")) continue; const p = l.slice(6).trim(); if (p === "[DONE]") continue;
      try { const j = JSON.parse(p); const a = j.choices?.[0]?.delta?.audio; if (a?.data) chunks.push(Buffer.from(a.data, "base64")); if (a?.transcript) transcript += a.transcript; if (j.usage) usage = j.usage; } catch { /* partial */ }
    }
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error("tts: empty audio");
  return { pcm, transcript: transcript.trim(), costUsd: usage?.cost ?? 0, tokensIn: usage?.prompt_tokens ?? 0, tokensOut: usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
}

async function logUsage(feature: "tts" | "stt", model: string, costUsd: number, tokensIn: number, tokensOut: number, ms: number, ok = true) {
  const [markupPct, fxRate] = await Promise.all([markupFor(model), usdEurRate().catch(() => null)]);
  const billedUsd = billed(costUsd, markupPct);
  await db.aiUsage.create({ data: { day: today(), feature, model, tokensIn, tokensOut, costUsd, markupPct, billedUsd, fxRate, billedEur: fxRate ? billedUsd * fxRate : null, ms, ok } }).catch(() => null);
}

export interface SpeakResult { url: string; mime: string; durationMs: number; cached: boolean; costUsd: number; id: string }

/**
 * Text → audio URL. Cache first (hash of model+voice+text): a hit costs nothing
 * and bumps `hits`. A miss synthesises, encodes, stores in the media storage
 * (Bunny CDN when enabled) and logs the cost to AiUsage with markup.
 * Phrases longer than `cacheMaxChars` are still spoken but not kept.
 */
export async function speak(rawText: string, opts: { key?: string; force?: boolean } = {}): Promise<SpeakResult | null> {
  const [cfg, ai] = await Promise.all([getVoiceConfig(), getAi()]);
  if (!cfg.enabled || !ai) return null;
  const text = normaliseText(rawText).slice(0, 1500);
  if (!text) return null;
  const hash = phraseHash(cfg.ttsModel, cfg.voice, cfg.style, text);
  if (!opts.force) {
    const hit = await db.voicePhrase.findUnique({ where: { hash } });
    if (hit) {
      await db.voicePhrase.update({ where: { id: hit.id }, data: { hits: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => null);
      return { url: hit.url, mime: hit.mime, durationMs: hit.durationMs, cached: true, costUsd: 0, id: hit.id };
    }
  }
  // Chat-audio models sometimes «answer» instead of reading. Check what was said against what was asked; one strict retry, then give up (never cache a wrong reading).
  let s: Awaited<ReturnType<typeof synthesise>> | null = null;
  let fid = 0;
  for (const strict of [false, true]) {
    try { s = await synthesise(text, cfg, ai.apiKey, strict); } catch { await logUsage("tts", cfg.ttsModel, 0, 0, 0, 0, false); return null; }
    await logUsage("tts", cfg.ttsModel, s.costUsd, s.tokensIn, s.tokensOut, s.ms);
    fid = s.transcript ? fidelity(text, s.transcript) : 1; // no transcript in the stream → trust it
    if (fid >= 0.9) break;
  }
  if (!s || fid < 0.9) return null;
  const durationMs = Math.round((s.pcm.length / 2 / SAMPLE_RATE) * 1000);
  const enc = await encode(s.pcm);
  const keep = opts.key || text.length <= cfg.cacheMaxChars;
  const rel = `voice/${hash.slice(0, 2)}/${hash.slice(0, 24)}.${enc.ext}`;
  const stored = await storeBytes(rel, enc.bytes, enc.mime);
  if (!keep) return { url: stored.url, mime: enc.mime, durationMs, cached: false, costUsd: s.costUsd, id: "" };
  const prev = opts.force ? await db.voicePhrase.findUnique({ where: { hash } }) : null;
  if (prev && prev.path !== rel) await removeBytes(prev.storage as Storage, prev.path, prev.url);
  const row = await db.voicePhrase.upsert({ where: { hash }, create: { hash, key: opts.key ?? null, text, voice: cfg.voice, style: cfg.style, model: cfg.ttsModel, storage: stored.storage, path: rel, url: stored.url, mime: enc.mime, bytes: enc.bytes.length, durationMs, transcript: s.transcript || null, fidelity: fid, costUsd: s.costUsd }, update: { key: opts.key ?? undefined, storage: stored.storage, path: rel, url: stored.url, mime: enc.mime, bytes: enc.bytes.length, durationMs, transcript: s.transcript || null, fidelity: fid, costUsd: s.costUsd } });
  return { url: row.url, mime: row.mime, durationMs, cached: false, costUsd: s.costUsd, id: row.id };
}

/** Generate every preset phrase that is not cached yet (or all with force). */
export async function prewarmPresets(force = false) {
  const cfg = await getVoiceConfig();
  const out: { key: string; ok: boolean; cached: boolean; costUsd: number }[] = [];
  for (const p of PRESET_PHRASES) {
    const r = await speak(p.text, { key: p.key, force });
    out.push({ key: p.key, ok: !!r, cached: r?.cached ?? false, costUsd: r?.costUsd ?? 0 });
  }
  // Rows of another voice/model can never be hit again (the hash includes both): drop them and their files.
  const stale = await db.voicePhrase.findMany({ where: { OR: [{ voice: { not: cfg.voice } }, { model: { not: cfg.ttsModel } }, { style: { not: cfg.style } }] } });
  for (const row of stale) { await removeBytes(row.storage as Storage, row.path, row.url); await db.voicePhrase.delete({ where: { id: row.id } }).catch(() => null); }
  return out;
}

export async function deletePhrase(id: string) {
  const row = await db.voicePhrase.findUnique({ where: { id } });
  if (!row) return;
  await removeBytes(row.storage as Storage, row.path, row.url);
  await db.voicePhrase.delete({ where: { id } });
}
