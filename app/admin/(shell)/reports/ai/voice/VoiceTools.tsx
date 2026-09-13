"use client";

import { useState, useTransition } from "react";
import { Flame, Loader2, Play, Trash2, Mic, Square } from "lucide-react";
import { prewarm, removePhrase, tryPhrase } from "./actions";
import { useVoice } from "@/lib/voice/client";

/** Prewarm button + custom phrase tester + mic tester for the voice cache page. */
export function VoiceTools({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const voice = useVoice();
  const play = (url: string) => { const a = new Audio(url); void a.play(); };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending || !enabled} onClick={() => start(async () => { const r = await prewarm(false); setMsg(`Προθέρμανση: ${r.generated} νέες, ${r.cached} ήδη έτοιμες, ${r.failed} απέτυχαν · κόστος $${r.costUsd.toFixed(4)}`); })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flame className="size-4" aria-hidden />} Προθέρμανση τυποποιημένων φράσεων
        </button>
        <button type="button" disabled={pending || !enabled} onClick={() => start(async () => { const r = await prewarm(true); setMsg(`Αναδημιουργία: ${r.generated} φράσεις · κόστος $${r.costUsd.toFixed(4)}`); })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60">
          Αναδημιουργία όλων (νέα φωνή)
        </button>
        {msg && <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{msg}</span>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; start(async () => { const r = await tryPhrase(text.trim()); setMsg(r.ok ? `${r.cached ? "Από cache (0 $)" : `Νέα εκφώνηση · $${r.costUsd.toFixed(4)}`} · ${(r.durationMs / 1000).toFixed(1)} s` : "Η εκφώνηση απέτυχε."); if (r.ok) play(r.url); }); }} className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="voice-try">Δοκιμαστική φράση</label>
        <input id="voice-try" value={text} onChange={(e) => setText(e.target.value)} placeholder="Γράψε μια φράση για δοκιμή εκφώνησης…" className="flex-1 min-w-[240px] rounded-full border-2 border-eu-line px-4 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" />
        <button type="submit" disabled={pending || !enabled} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60"><Play className="size-4" aria-hidden /> Εκφώνηση</button>
        <button type="button" disabled={!enabled || voice.transcribing} onClick={async () => { if (voice.listening) { voice.stop(); return; } const r = await voice.listen(); setHeard(r.text || (r.error === "denied" ? "Δεν δόθηκε πρόσβαση στο μικρόφωνο." : "Δεν αναγνωρίστηκε ομιλία.")); }} className={`inline-flex items-center gap-1.5 rounded-full border-2 font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60 ${voice.listening ? "bg-eu-red border-eu-red text-white" : "border-eu-navy text-eu-navy"}`}>
          {voice.transcribing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : voice.listening ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />} {voice.listening ? "Σταμάτημα" : "Δοκιμή μικροφώνου"}
        </button>
      </form>
      {heard && <p className="m-0 rounded-xl bg-eu-surface p-3 text-[length:var(--fs-14)] text-eu-ink">Άκουσα: <b>{heard}</b></p>}
    </div>
  );
}

export function PhraseRow({ id, url }: { id: string; url: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={() => { void new Audio(url).play(); }} aria-label="Αναπαραγωγή" className="size-9 rounded-full bg-eu-chip text-eu-blue inline-flex items-center justify-center hover:bg-eu-blue hover:text-white"><Play className="size-4" aria-hidden /></button>
      <button type="button" disabled={pending} onClick={() => { if (confirm("Διαγραφή της φράσης από το cache; Θα ξαναδημιουργηθεί (με κόστος) την επόμενη φορά.")) start(() => removePhrase(id)); }} aria-label="Διαγραφή" className="size-9 rounded-full bg-eu-surface text-eu-muted inline-flex items-center justify-center hover:bg-eu-red hover:text-white disabled:opacity-60"><Trash2 className="size-4" aria-hidden /></button>
    </span>
  );
}
