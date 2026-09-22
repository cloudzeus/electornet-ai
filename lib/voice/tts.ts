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

export interface VoiceConfig { enabled: boolean; provider: "openrouter" | "elevenlabs"; ttsModel: string; voice: string; style: string; tempo: number; rate: number; sttModel: string; cacheMaxChars: number; eleven: { model: string; stability: number; similarity: number; speed: number; usdPer1kChars: number; /** audio tags του v3 («[calm][serious]») που μπαίνουν μπροστά από κάθε εκφώνηση */ tags: string } }
/**
 * Δύο πάροχοι εκφώνησης, με επιλογή του super admin (Ρυθμίσεις → AI → «Πάροχος φωνής») για σύγκριση:
 *  - openrouter: chat μοντέλο με audio output (gpt-audio) — «διαβάζει» με οδηγία ύφους, θέλει έλεγχο πιστότητας
 *  - elevenlabs: καθαρό TTS (κλειδί ELEVENLABS_API_KEY στο περιβάλλον) — διαβάζει πάντα αυτολεξεί, δική του φωνή και ταχύτητα
 * Ο πάροχος, το μοντέλο και η φωνή μπαίνουν στο hash της cache, άρα οι δύο δεν μπερδεύονται ποτέ και η σύγκριση είναι καθαρή.
 */
export const elevenKey = () => process.env.ELEVENLABS_API_KEY ?? "";
export async function getVoiceConfig(): Promise<VoiceConfig> {
  const { data } = await getSetting("ai");
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) && v !== "" && v != null ? Math.min(hi, Math.max(lo, n)) : d; };
  const model = String(data.elevenModel || "eleven_v3");
  // το v3 δέχεται μόνο τρεις τιμές σταθερότητας (0 Creative · 0.5 Natural · 1 Robust)
  const stab = clamp(data.elevenStability, 0, 1, 0.5);
  const eleven = { model, stability: model === "eleven_v3" ? (stab < 0.25 ? 0 : stab < 0.75 ? 0.5 : 1) : stab, similarity: clamp(data.elevenSimilarity, 0, 1, 0.8), speed: clamp(data.elevenSpeed, 0.7, 1.2, 1.05), usdPer1kChars: clamp(data.elevenUsdPer1kChars, 0, 5, 0.1), tags: String(data.elevenTags ?? "").trim() };
  if (data.voiceProvider === "elevenlabs" && elevenKey()) {
    // η ταχύτητα ρυθμίζεται από το ίδιο το ElevenLabs (speed) — όχι δεύτερη επιτάχυνση με ffmpeg πάνω στη δική του
    return { enabled: data.voiceEnabled === true, provider: "elevenlabs", ttsModel: `elevenlabs/${eleven.model}`, voice: String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb"), style: `s${eleven.stability}|b${eleven.similarity}|v${eleven.speed}|${eleven.tags}`, tempo: 1, rate: Math.min(2, Math.max(0.8, Number(data.voiceRate) || 1)), sttModel: String(data.voiceSttModel || "openai/whisper-large-v3"), cacheMaxChars: Number(data.voiceCacheMaxChars) || 400, eleven };
  }
  return { provider: "openrouter", eleven, enabled: data.voiceEnabled === true, ttsModel: String(data.voiceTtsModel || "openai/gpt-audio-mini"), voice: String(data.voiceName || "ash"), style: String(data.voiceStyle || DEFAULT_STYLE).trim(), tempo: Math.min(2, Math.max(0.8, Number(data.voiceTempo) || 1.4)), rate: Math.min(2, Math.max(0.8, Number(data.voiceRate) || 1)), sttModel: String(data.voiceSttModel || "openai/whisper-large-v3"), cacheMaxChars: Number(data.voiceCacheMaxChars) || 400 };
}

/** Same phrase, same audio: collapse whitespace, strip markdown-ish noise, keep case (it matters for spelling). */
export const normaliseText = (t: string) => spokenForm(t.replace(/[*_`#]/g, ""));
export const DEFAULT_STYLE = "Πολύ γρήγορος ρυθμός ομιλίας, σαν ενθουσιώδης νέος πωλητής που βιάζεται· χαρούμενος τόνος με χαμόγελο, ενέργεια, καθόλου παύσεις.";
/** Style + tempo form the cache dimension alongside model and voice. */
export const styleKey = (cfg: { style: string; tempo: number }) => `${cfg.style}|x${cfg.tempo}`;
export const phraseHash = (model: string, voice: string, style: string, text: string) => createHash("sha256").update(`${model}|${voice}|${style}|${normaliseText(text)}`).digest("hex");

/** pcm16 → mp3 with ffmpeg when available (≈8× smaller), sped up by `tempo` with pitch preserved (atempo); else a WAV container at natural speed. */
async function encode(pcm: Buffer, tempo = 1): Promise<{ bytes: Buffer; mime: string; ext: string; tempo: number }> {
  const ff = process.env.FFMPEG_PATH || "ffmpeg";
  const t = Math.min(2, Math.max(0.5, tempo));
  const mp3 = await new Promise<Buffer | null>((resolve) => {
    try {
      const p = spawn(ff, ["-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", ...(t !== 1 ? ["-filter:a", `atempo=${t.toFixed(2)}`] : []), "-codec:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1"]);
      const out: Buffer[] = [];
      p.stdout.on("data", (d: Buffer) => out.push(d));
      p.on("error", () => resolve(null));
      p.on("close", (code) => resolve(code === 0 && out.length ? Buffer.concat(out) : null));
      p.stdin.on("error", () => {});
      p.stdin.end(pcm);
    } catch { resolve(null); }
  });
  if (mp3) return { bytes: mp3, mime: "audio/mpeg", ext: "mp3", tempo: t };
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return { bytes: Buffer.concat([h, pcm]), mime: "audio/wav", ext: "wav", tempo: 1 };
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

async function synthesise(text: string, cfg: VoiceConfig, apiKey: string, strict = false, onChunk?: (pcm: Buffer) => void): Promise<{ pcm: Buffer; transcript: string; costUsd: number; tokensIn: number; tokensOut: number; ms: number }> {
  if (cfg.provider === "elevenlabs") return synthesiseEleven(text, cfg, apiKey, onChunk);
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://www.euronics.gr", "X-Title": "Euronics Ermis voice" },
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
      try { const j = JSON.parse(p); const a = j.choices?.[0]?.delta?.audio; if (a?.data) { const c = Buffer.from(a.data, "base64"); chunks.push(c); onChunk?.(c); } if (a?.transcript) transcript += a.transcript; if (j.usage) usage = j.usage; } catch { /* partial */ }
    }
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error("tts: empty audio");
  return { pcm, transcript: transcript.trim(), costUsd: usage?.cost ?? 0, tokensIn: usage?.prompt_tokens ?? 0, tokensOut: usage?.completion_tokens ?? 0, ms: Date.now() - t0 };
}

/**
 * ElevenLabs: καθαρό TTS σε ροή pcm16 24 kHz — ίδια μορφή με το άλλο μονοπάτι, άρα cache, ffmpeg και streaming δουλεύουν αυτούσια.
 * Δεν γυρίζει μεταγραφή (δεν «απαντά» ποτέ, διαβάζει ό,τι του δοθεί). Κόστος: ανά χαρακτήρα, εκτίμηση από τη ρύθμιση $/1.000 χαρακτήρες.
 */
async function synthesiseEleven(text: string, cfg: VoiceConfig, apiKey: string, onChunk?: (pcm: Buffer) => void): Promise<{ pcm: Buffer; transcript: string; costUsd: number; tokensIn: number; tokensOut: number; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voice)}/stream?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/pcm" },
    // v3: τα audio tags («[calm]») χρωματίζουν την εκφώνηση· τα Flash/Turbo θέλουν ρητή γλώσσα, τα v3/multilingual την καταλαβαίνουν μόνα τους (και διαβάζουν σωστά τους λατινικούς όρους)
    body: JSON.stringify({ text: cfg.eleven.model === "eleven_v3" && cfg.eleven.tags ? `${cfg.eleven.tags} ${text}` : text, model_id: cfg.eleven.model, ...(/flash|turbo/.test(cfg.eleven.model) ? { language_code: "el" } : {}), voice_settings: { stability: cfg.eleven.stability, similarity_boost: cfg.eleven.similarity, speed: cfg.eleven.speed } }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok || !res.body) throw new Error(`elevenlabs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const reader = res.body.getReader(); const chunks: Buffer[] = []; let odd: Buffer | null = null;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    // δείγματα 16 bit: κάθε κομμάτι που φεύγει προς τον browser πρέπει να έχει άρτιο πλήθος bytes
    let c: Buffer = odd ? Buffer.concat([odd, Buffer.from(value)]) : Buffer.from(value); odd = null;
    if (c.length % 2) { odd = c.subarray(c.length - 1); c = c.subarray(0, c.length - 1); }
    if (c.length) { chunks.push(c); onChunk?.(c); }
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length) throw new Error("elevenlabs: empty audio");
  const chars = Number(res.headers.get("character-cost")) || text.length;
  return { pcm, transcript: "", costUsd: (chars / 1000) * cfg.eleven.usdPer1kChars, tokensIn: chars, tokensOut: 0, ms: Date.now() - t0 };
}

/** Το κλειδί του παρόχου που είναι ενεργός· null = η φωνή δεν μπορεί να δουλέψει. */
async function voiceKey(cfg: VoiceConfig): Promise<string | null> {
  if (cfg.provider === "elevenlabs") return elevenKey() || null;
  return (await getAi())?.apiKey ?? null;
}

async function logUsage(feature: "tts" | "stt", model: string, costUsd: number, tokensIn: number, tokensOut: number, ms: number, ok = true, error?: string) {
  const [markupPct, fxRate] = await Promise.all([markupFor(model), usdEurRate().catch(() => null)]);
  const billedUsd = billed(costUsd, markupPct);
  await db.aiUsage.create({ data: { day: today(), feature, model, tokensIn, tokensOut, costUsd, markupPct, billedUsd, fxRate, billedEur: fxRate ? billedUsd * fxRate : null, ms, ok, error: error?.slice(0, 300) } }).catch(() => null);
}

export interface SpeakResult { url: string; mime: string; durationMs: number; cached: boolean; costUsd: number; id: string }

interface Synth { bytes: Buffer; mime: string; ext: string; durationMs: number; transcript: string; fidelity: number; costUsd: number }

/** Synthesise + verify + encode (no storage). Returns null when the model would not read the text faithfully. */
async function synthesisePhrase(text: string, cfg: VoiceConfig, apiKey: string): Promise<Synth | null> {
  // Chat-audio models sometimes «answer» instead of reading. Check what was said against what was asked; one strict retry, then give up (never cache a wrong reading).
  let s: Awaited<ReturnType<typeof synthesise>> | null = null;
  let fid = 0;
  for (const strict of [false, true]) {
    try { s = await synthesise(text, cfg, apiKey, strict); } catch (e) { await logUsage("tts", cfg.ttsModel, 0, 0, 0, 0, false, (e as Error).message); return null; }
    await logUsage("tts", cfg.ttsModel, s.costUsd, s.tokensIn, s.tokensOut, s.ms);
    fid = s.transcript ? fidelity(text, s.transcript) : 1; // no transcript in the stream → trust it
    if (fid >= 0.9) break;
  }
  if (!s || fid < 0.9) return null;
  const enc = await encode(s.pcm, cfg.tempo);
  const durationMs = Math.round((s.pcm.length / 2 / SAMPLE_RATE / enc.tempo) * 1000);
  return { bytes: enc.bytes, mime: enc.mime, ext: enc.ext, durationMs, transcript: s.transcript, fidelity: fid, costUsd: s.costUsd };
}

/** Store the audio (Bunny when enabled) and record the cache row. Phrases longer than `cacheMaxChars` are stored but not indexed. */
async function persistPhrase(text: string, hash: string, syn: Synth, cfg: VoiceConfig, opts: { key?: string; force?: boolean }): Promise<SpeakResult> {
  const keep = opts.key || text.length <= cfg.cacheMaxChars;
  const rel = `voice/${hash.slice(0, 2)}/${hash.slice(0, 24)}.${syn.ext}`;
  const stored = await storeBytes(rel, syn.bytes, syn.mime);
  if (!keep) return { url: stored.url, mime: syn.mime, durationMs: syn.durationMs, cached: false, costUsd: syn.costUsd, id: "" };
  const prev = opts.force ? await db.voicePhrase.findUnique({ where: { hash } }) : null;
  if (prev && prev.path !== rel) await removeBytes(prev.storage as Storage, prev.path, prev.url);
  const data = { storage: stored.storage, path: rel, url: stored.url, mime: syn.mime, bytes: syn.bytes.length, durationMs: syn.durationMs, transcript: syn.transcript || null, fidelity: syn.fidelity, costUsd: syn.costUsd };
  const row = await db.voicePhrase.upsert({ where: { hash }, create: { hash, key: opts.key ?? null, text, voice: cfg.voice, style: styleKey(cfg), model: cfg.ttsModel, ...data }, update: { key: opts.key ?? undefined, ...data } });
  return { url: row.url, mime: row.mime, durationMs: syn.durationMs, cached: false, costUsd: syn.costUsd, id: row.id };
}

async function cacheLookup(hash: string): Promise<SpeakResult | null> {
  const hit = await db.voicePhrase.findUnique({ where: { hash } });
  if (!hit) return null;
  await db.voicePhrase.update({ where: { id: hit.id }, data: { hits: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => null);
  return { url: hit.url, mime: hit.mime, durationMs: hit.durationMs, cached: true, costUsd: 0, id: hit.id };
}

/**
 * Text → audio URL. Cache first (hash of model+voice+style+tempo+text): a hit
 * costs nothing and bumps `hits`. A miss synthesises, encodes, stores in the
 * media storage (Bunny CDN when enabled) and logs the cost to AiUsage.
 */
export async function speak(rawText: string, opts: { key?: string; force?: boolean } = {}): Promise<SpeakResult | null> {
  const cfg = await getVoiceConfig(), apiKey = await voiceKey(cfg);
  if (!cfg.enabled || !apiKey) return null;
  const text = normaliseText(rawText).slice(0, 1500);
  if (!text) return null;
  const hash = phraseHash(cfg.ttsModel, cfg.voice, styleKey(cfg), text);
  if (!opts.force) { const hit = await cacheLookup(hash); if (hit) return hit; }
  const syn = await synthesisePhrase(text, cfg, apiKey);
  if (!syn) return null;
  return persistPhrase(text, hash, syn, cfg, opts);
}

/**
 * Low-latency variant for the storefront: on a miss the audio bytes go back
 * to the caller at once (inline) and storage + cache row are written by the
 * `persist` callback the route schedules after the response.
 */
export async function speakInline(rawText: string, opts: { key?: string } = {}): Promise<{ result: SpeakResult & { audio?: string }; persist?: () => Promise<void> } | null> {
  const cfg = await getVoiceConfig(), apiKey = await voiceKey(cfg);
  if (!cfg.enabled || !apiKey) return null;
  const text = normaliseText(rawText).slice(0, 1500);
  if (!text) return null;
  const hash = phraseHash(cfg.ttsModel, cfg.voice, styleKey(cfg), text);
  const hit = await cacheLookup(hash);
  if (hit) return { result: hit };
  const syn = await synthesisePhrase(text, cfg, apiKey);
  if (!syn) return null;
  const inline = `data:${syn.mime};base64,${syn.bytes.toString("base64")}`;
  return { result: { url: inline, audio: inline, mime: syn.mime, durationMs: syn.durationMs, cached: false, costUsd: syn.costUsd, id: "" }, persist: async () => { await persistPhrase(text, hash, syn, cfg, opts).catch(() => null); } };
}

/** Generate every preset phrase that is not cached yet (or all with force). */
export async function prewarmPresets(force = false) {
  const cfg = await getVoiceConfig();
  const out: { key: string; ok: boolean; cached: boolean; costUsd: number }[] = [];
  for (const p of PRESET_PHRASES) {
    const r = await speak(p.text, { key: p.key, force });
    out.push({ key: p.key, ok: !!r, cached: r?.cached ?? false, costUsd: r?.costUsd ?? 0 });
  }
  // Rows of another voice/model/style, or presets whose wording changed, can never be hit again: drop them and their files.
  const current = new Set(PRESET_PHRASES.map((p) => phraseHash(cfg.ttsModel, cfg.voice, styleKey(cfg), normaliseText(p.text))));
  const stale = await db.voicePhrase.findMany({ where: { OR: [{ voice: { not: cfg.voice } }, { model: { not: cfg.ttsModel } }, { style: { not: styleKey(cfg) } }, { key: { not: null }, hash: { notIn: [...current] } }] } });
  for (const row of stale) { await removeBytes(row.storage as Storage, row.path, row.url); await db.voicePhrase.delete({ where: { id: row.id } }).catch(() => null); }
  return out;
}

export async function deletePhrase(id: string) {
  const row = await db.voicePhrase.findUnique({ where: { id } });
  if (!row) return;
  await removeBytes(row.storage as Storage, row.path, row.url);
  await db.voicePhrase.delete({ where: { id } });
}

/**
 * Streaming variant: pcm16 flows to the caller while the model is still
 * talking (through ffmpeg atempo when a tempo is set), so playback starts
 * after the first chunk (~1 s) instead of after the whole sentence. When the
 * model finishes, the full take is verified (fidelity) and cached like any
 * other phrase. No retry is possible mid-stream, so a low-fidelity take is
 * simply not cached.
 */
export async function streamSpeech(rawText: string, opts: { key?: string } = {}): Promise<{ kind: "cached"; result: SpeakResult } | { kind: "stream"; stream: ReadableStream<Uint8Array>; sampleRate: number; persist: () => Promise<void> } | null> {
  const cfg = await getVoiceConfig(), apiKey = await voiceKey(cfg);
  if (!cfg.enabled || !apiKey) return null;
  const text = normaliseText(rawText).slice(0, 1500);
  if (!text) return null;
  const hash = phraseHash(cfg.ttsModel, cfg.voice, styleKey(cfg), text);
  const hit = await cacheLookup(hash);
  if (hit) return { kind: "cached", result: hit };

  const tempo = Math.min(2, Math.max(0.5, cfg.tempo));
  const ff = process.env.FFMPEG_PATH || "ffmpeg";
  // ffmpeg in pass-through mode: raw pcm in → tempo-adjusted raw pcm out, chunk by chunk
  let proc: ReturnType<typeof spawn> | null = null;
  if (tempo !== 1) {
    try { proc = spawn(ff, ["-hide_banner", "-loglevel", "error", "-fflags", "nobuffer", "-probesize", "32", "-analyzeduration", "0", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0", "-filter:a", `atempo=${tempo.toFixed(2)}`, "-flush_packets", "1", "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "pipe:1"]); proc.on("error", () => { proc = null; }); proc.stdin?.on("error", () => {}); } catch { proc = null; }
  }
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const close = () => { if (!closed) { closed = true; try { controller.close(); } catch { /* already closed */ } } };
  const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; }, cancel() { closed = true; proc?.kill(); } });
  const push = (b: Buffer) => { if (!closed) { try { controller.enqueue(new Uint8Array(b)); } catch { closed = true; } } };
  if (proc) { proc.stdout?.on("data", (d: Buffer) => push(d)); proc.on("close", close); }

  // synthesis runs in the background; `done` resolves with the verified take (or null)
  const done = (async (): Promise<Synth | null> => {
    let s: Awaited<ReturnType<typeof synthesise>> | null = null;
    try {
      s = await synthesise(text, cfg, apiKey, false, (pcm) => { if (proc?.stdin && !proc.stdin.destroyed) proc.stdin.write(pcm); else if (!proc) push(pcm); });
    } catch (e) { await logUsage("tts", cfg.ttsModel, 0, 0, 0, 0, false, (e as Error).message); if (proc) proc.stdin?.end(); else close(); return null; }
    if (proc) proc.stdin?.end(); else close();
    await logUsage("tts", cfg.ttsModel, s.costUsd, s.tokensIn, s.tokensOut, s.ms);
    const fid = s.transcript ? fidelity(text, s.transcript) : 1;
    if (fid < 0.9) return null;
    const enc = await encode(s.pcm, tempo);
    return { bytes: enc.bytes, mime: enc.mime, ext: enc.ext, durationMs: Math.round((s.pcm.length / 2 / SAMPLE_RATE / enc.tempo) * 1000), transcript: s.transcript, fidelity: fid, costUsd: s.costUsd };
  })();
  done.catch(() => null);
  return { kind: "stream", stream, sampleRate: SAMPLE_RATE, persist: async () => { const syn = await done; if (syn) await persistPhrase(text, hash, syn, cfg, opts).catch(() => null); } };
}
