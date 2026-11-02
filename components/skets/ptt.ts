"use client";

/**
 * Push-to-talk για τις ερωτήσεις του κοινού: ηχογραφεί όσο είναι πατημένο το κουμπί (ή το M στη σκηνή) και στέλνει τον ήχο
 * στο /api/skets/ask. Το μικρόφωνο θέλει ασφαλή σύνδεση: localhost στο laptop, https (ngrok) στο κινητό του χειριστή.
 */
export const micAvailable = () => typeof window !== "undefined" && window.isSecureContext && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export interface Ptt { stop: () => Promise<Blob | null> }

export async function startPtt(): Promise<Ptt | null> {
  if (!micAvailable()) return null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch(() => null);
  if (!stream) return null;
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((res) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" })); }; });
  rec.start(250);
  // ασφάλεια: όχι πάνω από 20 s ανοιχτό μικρόφωνο αν «κολλήσει» το κουμπί
  const cap = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, 20000);
  return { stop: async () => { clearTimeout(cap); if (rec.state === "recording") rec.stop(); const b = await done; return b.size > 2000 ? b : null; } };
}

/** Ερώτηση στον Ερμή: ήχος (push-to-talk) ή κείμενο (πληκτρολόγηση από τον χειριστή). Οι φάσεις φτάνουν στη σκηνή μέσω SSE. */
export function askLive(k: string, q: Blob | string) {
  const init: RequestInit = typeof q === "string"
    ? { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ q }) }
    : (() => { const fd = new FormData(); fd.append("audio", q, q.type.includes("mp4") ? "q.m4a" : "q.webm"); return { method: "POST", headers: { "x-skets-key": k }, body: fd }; })();
  return fetch("/api/skets/ask", init).catch(() => null);
}
