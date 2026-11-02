"use client";

import { useEffect, useRef } from "react";

/**
 * «Ο Ερμής ακούει πότε τελείωσε ο παρουσιαστής»: ανίχνευση ομιλίας (VAD) στο μικρόφωνο του laptop της σκηνής.
 * Δεν καταλαβαίνει τι ειπώθηκε — μόνο ότι κάποιος μίλησε αρκετά και μετά σώπασε. Ακούει μόνο όταν η σκηνή περιμένει
 * τον παρουσιαστή και ο Ερμής δεν μιλά (busy), με μικρή αναμονή στην αρχή για να μην πιάσει την ουρά της δικής του φωνής.
 * Το κατώφλι προσαρμόζεται στον θόρυβο της αίθουσας (floor), ώστε ο βόμβος/η κουβέντα στο βάθος να μη μετράνε.
 */
export const VAD = {
  /** τόση ομιλία τουλάχιστον (ms) — ένα «Ναι!» είναι ~300 ms, ένας βήχας λιγότερο */
  minVoicedMs: 280,
  /** τόση σιωπή μετά την ομιλία = τέλος της ατάκας */
  endSilenceMs: 750,
  /** αφού σταματήσει να μιλά ο Ερμής, τόσο αγνοούμε (ουρά ήχου, αντήχηση) */
  guardMs: 600,
  /** ομιλία = πάνω από floor × ratio και πάνω από minRms */
  ratio: 2.5,
  /** μικρόφωνο laptop από 1–2 μέτρα: ομιλία ~0.01–0.05 */
  minRms: 0.006,
  /** σκόρπιοι θόρυβοι που δεν έγιναν ατάκα ξεχνιούνται μετά από τόση σιωπή */
  resetMs: 1500,
  tickMs: 40,
};

export interface Mic { stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode }

/** Ανοίγει το μικρόφωνο — καλείται από κλικ (οι browsers θέλουν κίνηση του χρήστη για ήχο/μικρόφωνο). */
export async function openMic(): Promise<Mic | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  // το AudioContext φτιάχνεται ΜΕΣΑ στο κλικ, πριν από κάθε await — αλλιώς ο Safari το αφήνει «παγωμένο» (σιωπή)
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  // autoGain: ο παρουσιαστής μιλά από απόσταση· η σιωπή που «φουσκώνει» την καλύπτει το προσαρμοζόμενο κατώφλι (floor)
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => null);
  if (!stream) { void ctx.close().catch(() => {}); return null; }
  await ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  return { stream, ctx, analyser };
}

/** Ηχογράφηση όσο ακούμε — η ατάκα πάει στο /api/skets/turn για να δούμε αν ήταν η αναμενόμενη ή κάτι άλλο. */
function recorder(stream: MediaStream) {
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
  if (!mime) return null;
  const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(250);
  const t0 = Date.now();
  return {
    age: () => Date.now() - t0,
    stop: () => new Promise<Blob | null>((res) => { if (rec.state === "inactive") return res(null); rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime })); rec.stop(); }),
    drop: () => { if (rec.state !== "inactive") rec.stop(); },
  };
}

/**
 * Όσο `armed`, καλεί `onTurn` (με την ηχογράφηση της ατάκας) μία φορά μόλις ο παρουσιαστής πει κάτι και σωπάσει. `busy()` = παίζει ήχος στη σκηνή
 * (τότε δεν ακούμε, και η αναμονή ξεκινά από την αρχή). `onLevel` (0–1+, σε σχέση με το κατώφλι) για ένδειξη στάθμης.
 */
export function useVad(mic: Mic | null, armed: boolean, busy: () => boolean, onTurn: (audio: Blob | null) => void, onLevel?: (level: number, voiced: boolean) => void) {
  const floor = useRef(0.004);
  const cb = useRef({ busy, onTurn, onLevel });
  useEffect(() => { cb.current = { busy, onTurn, onLevel }; });
  useEffect(() => {
    if (!mic || !armed) { cb.current.onLevel?.(0, false); return; }
    const buf = new Float32Array(mic.analyser.fftSize);
    let quietSince = Date.now(), voiced = 0, lastVoice = 0, fired = false;
    let rec = recorder(mic.stream);
    const iv = setInterval(() => {
      if (fired) return;
      const now = Date.now();
      mic.analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (const x of buf) sum += x * x;
      const rms = Math.sqrt(sum / buf.length);
      const thr = Math.max(floor.current * VAD.ratio, VAD.minRms);
      const loud = rms > thr;
      if (cb.current.busy()) { quietSince = now; voiced = 0; cb.current.onLevel?.(rms / thr, false); return; }
      // μακριά σιωπή: νέα ηχογράφηση, να μη στέλνουμε λεπτά ησυχίας
      if (!voiced && rec && rec.age() > 20000) { rec.drop(); rec = recorder(mic.stream); }
      if (!loud) floor.current = floor.current * 0.97 + rms * 0.03;
      cb.current.onLevel?.(rms / thr, voiced >= VAD.minVoicedMs);
      if (now - quietSince < VAD.guardMs) return;
      if (loud) { voiced += VAD.tickMs; lastVoice = now; return; }
      if (voiced >= VAD.minVoicedMs && now - lastVoice >= VAD.endSilenceMs) { fired = true; const r = rec; rec = null; (r ? r.stop() : Promise.resolve(null)).then((b) => cb.current.onTurn(b)); return; }
      if (voiced && now - lastVoice >= VAD.resetMs) voiced = 0;
    }, VAD.tickMs);
    return () => { clearInterval(iv); rec?.drop(); };
  }, [mic, armed]);
}
