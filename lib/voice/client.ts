"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
    if (!v && audio.current) { audio.current.pause(); setSpeaking(false); }
  }, []);

  const speak = useCallback(async (text: string, key?: string) => {
    if (!enabled || !speakOn) return;
    try {
      const r = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(key ? { key } : { text }) });
      if (!r.ok) return;
      const j = (await r.json()) as { url: string };
      if (!audio.current) audio.current = new Audio();
      const a = audio.current;
      a.pause();
      a.src = j.url;
      a.playbackRate = rate.current;
      setSpeaking(true);
      a.onended = () => setSpeaking(false);
      a.onerror = () => setSpeaking(false);
      await a.play().catch(() => setSpeaking(false));
    } catch { setSpeaking(false); }
  }, [enabled, speakOn]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  /** Record until stop() (or 12 s), then transcribe. Resolves with the text ("" on failure). */
  const listen = useCallback(async (): Promise<{ text: string; error?: "denied" | "unsupported" | "failed" }> => {
    if (!enabled) return { text: "", error: "unsupported" };
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return { text: "", error: "unsupported" };
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { return { text: "", error: "denied" }; }
    if (audio.current) { audio.current.pause(); setSpeaking(false); }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.current = r;
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const doneP = new Promise<Blob>((res) => { r.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: r.mimeType || mime || "audio/webm" })); }; });
    r.start(250);
    setListening(true);
    stopTimer.current = setTimeout(() => { if (r.state !== "inactive") r.stop(); }, 12000);
    const blob = await doneP;
    setListening(false);
    if (blob.size < 2000) return { text: "", error: "failed" };
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, `speech.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
      const res = await fetch("/api/voice/stt", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { text?: string };
      return res.ok && j.text ? { text: j.text } : { text: "", error: "failed" };
    } catch { return { text: "", error: "failed" }; } finally { setTranscribing(false); }
  }, [enabled]);

  return { enabled, speakOn, setSpeakOn, speak, playPreset, listen, stop, listening, speaking, transcribing };
}
