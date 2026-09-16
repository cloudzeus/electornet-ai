"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { spokenForm } from "./spoken";

const KEY = "eu-aris-voice";
// One config probe per page load, shared by every hook instance (search boxes, orb).
let configP: Promise<{ enabled: boolean; rate?: number }> | null = null;
const voiceConfig = () => (configP ??= fetch("/api/voice/config").then((r) => r.json() as Promise<{ enabled: boolean; rate?: number }>).catch(() => ({ enabled: false, rate: 1 })));

/**
 * Voice for the advisor UI. `speak(text)` fetches (cached) audio from
 * /api/voice/tts and plays it; `listen()` records the microphone
 * (MediaRecorder, webm/opus) until `stop()` or 12 s and transcribes it via
 * /api/voice/stt. Speaker preference persists per browser.
 */
export function useVoice() {
  const [enabled, setEnabled] = useState(false); // server-side feature flag
  const rate = useRef(1);
  const [speakOn, setSpeakOnState] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0); // speak() generation: a newer call or a mute cancels the running queue
  const actx = useRef<AudioContext | null>(null); // Web Audio context for streamed pcm
  const sources = useRef<AudioBufferSourceNode[]>([]);
  const stopPcm = useCallback(() => { for (const s of sources.current) { try { s.stop(); } catch {} } sources.current = []; }, []);

  useEffect(() => {
    let on = true;
    void voiceConfig().then((j) => { if (on) { setEnabled(!!j.enabled); rate.current = j.rate || 1; } });
    // Speaker on by default (the brand voice); the visitor's choice persists.
    try { const v = localStorage.getItem(KEY); if (v !== "0") setTimeout(() => on && setSpeakOnState(true), 0); } catch {}
    return () => { on = false; };
  }, []);

  /**
   * Play a preset regardless of the speaker toggle (used for the first-visit
   * welcome). Browsers block audio before the first gesture: then it plays on
   * the first pointer/key event instead. Resolves true once it actually played.
   */
  const playPreset = useCallback(async (key: string): Promise<boolean> => {
    if (!enabled) return false;
    try {
      const r = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
      if (!r.ok) return false;
      const { url } = (await r.json()) as { url: string };
      if (!audio.current) audio.current = new Audio();
      const a = audio.current;
      a.src = url;
      a.playbackRate = rate.current;
      a.onended = () => setSpeaking(false);
      a.onerror = () => setSpeaking(false);
      try { await a.play(); setSpeaking(true); return true; } catch {
        return await new Promise<boolean>((resolve) => {
          const go = () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); a.play().then(() => { setSpeaking(true); resolve(true); }).catch(() => resolve(false)); };
          window.addEventListener("pointerdown", go, { once: true });
          window.addEventListener("keydown", go, { once: true });
        });
      }
    } catch { return false; }
  }, [enabled]);

  const setSpeakOn = useCallback((v: boolean) => {
    setSpeakOnState(v);
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
    if (!v) { gen.current++; audio.current?.pause(); stopPcm(); setSpeaking(false); }
  }, [stopPcm]);

  /** Split an answer into sentence-sized parts: each is cached on its own and the first one starts playing while the rest are still being fetched. */
  const parts = (text: string) => {
    const raw = spokenForm(text).split(/(?<=[.!;?…])\s+(?=\S)/);
    const out: string[] = [];
    for (const r of raw) { if (out.length && (out[out.length - 1].length < 30 || r.length < 20)) out[out.length - 1] += " " + r; else out.push(r); }
    return out.slice(0, 8);
  };
  const playUrl = (a: HTMLAudioElement, url: string) => new Promise<void>((resolve) => {
    a.pause();
    a.src = url;
    a.playbackRate = rate.current;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });

  // Web Audio player for streamed pcm16: each chunk is scheduled right after the previous one, so playback
  // starts on the first chunk (~1 s after the request) while the model is still talking.
  const playPcmStream = async (res: Response, my: number): Promise<void> => {
    if (!res.body) return;
    const sr = Number(res.headers.get("x-sample-rate")) || 24000;
    if (!actx.current) actx.current = new AudioContext();
    const ctx = actx.current;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const reader = res.body.getReader();
    let carry = new Uint8Array(0);
    let nextAt = 0;
    let lastEnd = 0;
    const MIN = sr * 0.12; // ≥120 ms per scheduled buffer keeps the schedule smooth
    const schedule = (i16: Int16Array) => {
      const buf = ctx.createBuffer(1, i16.length, sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate.current;
      src.connect(ctx.destination);
      const start = Math.max(ctx.currentTime + 0.05, nextAt);
      src.start(start);
      nextAt = start + buf.duration / rate.current;
      lastEnd = nextAt;
      sources.current.push(src);
      src.onended = () => { sources.current = sources.current.filter((x) => x !== src); };
    };
    let pending: Uint8Array[] = []; let pendingLen = 0;
    const flush = () => {
      if (!pendingLen) return;
      const all = new Uint8Array(pendingLen); let o = 0; for (const p of pending) { all.set(p, o); o += p.length; }
      pending = []; pendingLen = 0;
      const even = all.length - (all.length % 2);
      carry = all.slice(even);
      if (even) schedule(new Int16Array(all.buffer.slice(0, even)));
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (my !== gen.current) { try { await reader.cancel(); } catch {} return; }
      if (done) break;
      if (!value?.length) continue;
      const chunk = carry.length ? new Uint8Array([...carry, ...value]) : value; carry = new Uint8Array(0);
      pending.push(chunk); pendingLen += chunk.length;
      if (pendingLen / 2 >= MIN) flush();
    }
    flush();
    // wait until the scheduled audio has actually played out
    const remaining = Math.max(0, lastEnd - ctx.currentTime);
    await new Promise<void>((r) => setTimeout(r, remaining * 1000 + 30));
  };
  const speak = useCallback(async (text: string, key?: string) => {
    if (!enabled || !speakOn) return;
    const my = ++gen.current;
    const items = key ? [{ key }] : parts(text).map((t) => ({ text: t }));
    if (!items.length) return;
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    // fetch every part at once; play them in order. Cache hits come back as a URL, misses as a live pcm stream.
    const parts$ = items.map((body) => fetch("/api/voice/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null));
    setSpeaking(true);
    try {
      for (const p of parts$) {
        const res = await p;
        if (my !== gen.current) return;
        if (!res?.ok) continue;
        if (res.headers.get("x-voice") === "stream") await playPcmStream(res, my);
        else { const j = (await res.json().catch(() => null)) as { url?: string } | null; if (j?.url) await playUrl(a, j.url); }
        if (my !== gen.current) return;
      }
    } finally { if (my === gen.current) setSpeaking(false); }
  }, [enabled, speakOn]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  /**
   * Record and transcribe. Stops by itself ~0.8 s after the visitor stops
   * talking (RMS silence detection), on stop(), after 10 s, or after 4 s with
   * no speech at all — so transcription starts the moment the sentence ends.
   */
  const listen = useCallback(async (): Promise<{ text: string; error?: "denied" | "unsupported" | "failed" | "unavailable" }> => {
    if (!enabled) return { text: "", error: "unsupported" };
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return { text: "", error: "unsupported" };
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return { text: "", error: "denied" }; }
    gen.current++; audio.current?.pause(); stopPcm(); setSpeaking(false);
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    rec.current = r;
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // silence detection
    let ctx: AudioContext | null = null; let vad: ReturnType<typeof setInterval> | null = null;
    try {
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(an.fftSize); const t0 = Date.now(); let spokeAt = 0; let lastVoice = 0; let noise = 0.01;
      vad = setInterval(() => {
        an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (!spokeAt) noise = Math.min(noise, rms * 1.5 + 0.002); // adapt to room noise before speech
        const voice = rms > Math.max(0.015, noise * 3);
        if (voice) { lastVoice = now; if (!spokeAt) spokeAt = now; }
        const stopNow = (spokeAt && now - lastVoice > 800 && now - spokeAt > 600) || (!spokeAt && now - t0 > 4000) || now - t0 > 10000;
        if (stopNow && r.state !== "inactive") r.stop();
      }, 100);
    } catch { /* no AudioContext: fall back to the timers */ }
    const doneP = new Promise<Blob>((res) => { r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); if (vad) clearInterval(vad); void ctx?.close().catch(() => {}); res(new Blob(chunks, { type: r.mimeType || mime || "audio/webm" })); }; });
    r.start(200);
    setListening(true);
    stopTimer.current = setTimeout(() => { if (r.state !== "inactive") r.stop(); }, 10500);
    const blob = await doneP;
    setListening(false);
    if (blob.size < 1500) return { text: "", error: "failed" };
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, `speech.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
      const res = await fetch("/api/voice/stt", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { text?: string };
      if (res.status === 503 || res.status === 429) return { text: "", error: "unavailable" };
      return res.ok && j.text ? { text: j.text } : { text: "", error: "failed" };
    } catch { return { text: "", error: "failed" }; } finally { setTranscribing(false); }
  }, [enabled, stopPcm]);

  return { enabled, speakOn, setSpeakOn, speak, playPreset, listen, stop, listening, speaking, transcribing };
}
