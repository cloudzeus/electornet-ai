"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Cmd, StageState } from "@/lib/skets/bus";
import type { LiveEv } from "@/lib/skets/types";
import { askLive, micAvailable, startPtt, type Ptt } from "./ptt";

/**
 * @dynamic Τηλεχειριστήριο του σκετς για τον χειριστή στα παρασκήνια: βλέπει σε ποιο βήμα είναι η σκηνή, τι πρέπει να πει
 * ο παρουσιαστής για να προχωρήσει (cue) και τι λέει ο Ερμής, και στέλνει Επόμενο / Πίσω / κατάστημα / τέλος κλήσης.
 * Ερώτηση από το κοινό: κρατά πατημένο το «Μίλα στον Ερμή» (μικρόφωνο του κινητού — θέλει https, π.χ. το ngrok) ή την
 * πληκτρολογεί· βλέπει την απάντηση, βάζει ό,τι θέλει στο σπίτι και γυρίζει στο σενάριο.
 */
const noSub = () => () => {};

export default function Remote({ k }: { k: string }) {
  const [st, setSt] = useState<StageState | null>(null);
  const [online, setOnline] = useState(false);
  const [live, setLive] = useState<LiveEv | null>(null);
  const [rec, setRec] = useState(false);
  const [typed, setTyped] = useState("");
  // στον server false (δεν υπάρχει MediaRecorder), στον browser ο πραγματικός έλεγχος — χωρίς hydration mismatch
  const mic = useSyncExternalStore(noSub, micAvailable, () => false);
  const ptt = useRef<Promise<Ptt | null> | null>(null);
  useEffect(() => {
    const es = new EventSource(`/api/skets/events?role=remote&k=${encodeURIComponent(k)}`);
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.kind === "state") { setSt(ev.state); if (!ev.state.live) setLive(null); } else if (ev.kind === "live") setLive((cur) => (cur && cur.n === ev.live.n ? { ...cur, ...ev.live, products: ev.live.products ?? cur.products } : ev.live)); };
    return () => es.close();
  }, [k]);
  const send = (cmd: Cmd) => { navigator.vibrate?.(20); fetch("/api/skets/cmd", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ cmd }) }).catch(() => {}); };
  const talkDown = () => { if (ptt.current) return; navigator.vibrate?.(30); setRec(true); send({ t: "liveListen", on: true }); ptt.current = startPtt(); };
  const talkUp = async () => {
    if (!ptt.current) return;
    const r = await ptt.current; ptt.current = null; setRec(false);
    const blob = r ? await r.stop() : null;
    if (blob) askLive(k, blob); else send({ t: "liveListen", on: false });
  };
  const ask = () => { const q = typed.trim(); if (!q) return; setTyped(""); askLive(k, q); };
  const inCall = st?.wait === "call";

  return (
    <div className="min-h-dvh bg-eu-navy text-white p-4 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <span className="font-black text-[length:var(--fs-20)]">Ερμής · χειριστής</span>
        <span className={`rounded-full px-3 py-1 font-bold text-[length:var(--fs-13)] ${online && st ? "bg-eu-green" : "bg-eu-red"}`}>{online ? (st ? `βήμα ${st.i + 1}/${st.total}` : "χωρίς σκηνή") : "εκτός σύνδεσης"}</span>
      </header>

      <section className="rounded-2xl bg-white/10 p-4">
        <div className="text-white/60 font-bold uppercase text-[length:var(--fs-12)]">Περιμένει</div>
        <p className="mt-1 font-bold text-eu-yellow text-[length:var(--fs-20)]">{st?.cue ?? (st?.wait === "auto" ? "— προχωρά μόνο του —" : "—")}</p>
        {st?.say && <><div className="mt-3 text-white/60 font-bold uppercase text-[length:var(--fs-12)]">Ο Ερμής λέει</div><p className="mt-1 text-white/85 text-[length:var(--fs-16)] leading-snug">{st.say}</p></>}
        {st?.call && <p className="mt-3 font-bold text-[length:var(--fs-16)]">Κλήση: {st.call}</p>}
      </section>

      {st && (
        <button type="button" onClick={() => send({ t: "auto", on: !st.auto })} className={`min-h-14 rounded-2xl px-4 flex items-center justify-between gap-3 font-bold text-[length:var(--fs-16)] ${st.auto && st.mic ? "bg-eu-green/20 ring-1 ring-eu-green" : "bg-white/10"}`}>
          <span className="flex items-center gap-2 text-left">
            <span className={`size-3 shrink-0 rounded-full ${st.auto && st.mic ? (st.hearing ? "bg-eu-green animate-pulse" : "bg-eu-green") : "bg-white/30"}`} />
            {!st.auto ? "Χειροκίνητο: προχωράς με «Επόμενο»" : !st.mic ? "Αυτόματο — άνοιξε το μικρόφωνο στη σκηνή" : st.hearing ? "Ακούει τον παρουσιαστή…" : "Αυτόματο (ο Ερμής μιλά / περιμένει)"}
          </span>
          <span className="shrink-0 text-white/60 text-[length:var(--fs-13)]">{st.auto ? "→ χειροκίνητο" : "→ αυτόματο"}</span>
        </button>
      )}

      {st?.live ? (
        <section className="rounded-2xl bg-white text-eu-ink p-4 flex flex-col gap-3">
          <div className="font-black uppercase text-eu-blue text-[length:var(--fs-12)]">Ζωντανή ερώτηση</div>
          <p className="font-bold text-[length:var(--fs-18)]">{rec ? "Ηχογραφώ…" : live?.q && live.q !== "…" ? `«${live.q}»` : "…"}</p>
          {live?.phase === "error" && <p className="font-bold text-eu-red text-[length:var(--fs-16)]">{live.error}</p>}
          {live?.text && <p className="text-eu-muted text-[length:var(--fs-15)] leading-snug">{live.text}</p>}
          {live?.phase === "thinking" && <p className="text-eu-muted font-semibold text-[length:var(--fs-15)]">Ο Ερμής ψάχνει…</p>}
          {(live?.products ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => send({ t: "addExtra", id: p.id })} className="min-h-14 rounded-xl bg-eu-surface px-3 py-2 flex items-center gap-3 text-left active:scale-[0.98]">
              <span className="min-w-0 flex-1"><span className="block font-black text-eu-blue text-[length:var(--fs-13)]">{p.brand}</span><span className="block font-semibold truncate text-[length:var(--fs-14)]">{p.title}</span></span>
              <span className="font-black text-[length:var(--fs-14)] whitespace-nowrap">{Array.isArray(st?.extras) && st.extras.includes(p.id) ? "✓ στο σπίτι" : "+ στο σπίτι"}</span>
            </button>
          ))}
          <button type="button" onClick={() => send({ t: "liveClose" })} className="min-h-16 rounded-2xl bg-eu-yellow text-eu-navy font-black text-[length:var(--fs-20)]">↩ Πίσω στο σενάριο</button>
        </section>
      ) : (
        <button type="button" onClick={() => send({ t: "next" })} className="min-h-[7rem] rounded-3xl bg-eu-yellow text-eu-navy font-black text-[length:var(--fs-36)] active:scale-[0.98]">Επόμενο ▶</button>
      )}

      {!inCall && (
        <section className="grid gap-2">
          {mic ? (
            <button type="button" onPointerDown={talkDown} onPointerUp={talkUp} onPointerCancel={talkUp} onPointerLeave={() => { if (rec) talkUp(); }} onContextMenu={(e) => e.preventDefault()} className={`min-h-20 rounded-2xl font-black text-[length:var(--fs-20)] touch-none select-none ${rec ? "bg-eu-red text-white scale-[0.98]" : "bg-white/15 text-white"}`}>
              {rec ? "● Ακούει — άφησε για αποστολή" : "🎤 Κράτα πατημένο: ερώτηση κοινού"}
            </button>
          ) : (
            <p className="text-white/60 text-[length:var(--fs-13)]">Μικρόφωνο: μόνο μέσω https (το link του ngrok) — ή κράτα M στο laptop της σκηνής.</p>
          )}
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ή γράψε την ερώτηση…" className="min-h-12 min-w-0 flex-1 rounded-xl bg-white text-eu-ink px-3" />
            <button type="submit" className="min-h-12 rounded-xl bg-white/15 px-4 font-bold">Ρώτα</button>
          </form>
        </section>
      )}

      {st && st.wait === "store" && (
        <div className="grid gap-2">
          {st.stores.map((s, n) => <button key={s} type="button" onClick={() => send({ t: "store", i: n })} className={`min-h-14 rounded-2xl font-bold text-[length:var(--fs-18)] ${st.storeIdx === n ? "bg-eu-yellow text-eu-navy" : "bg-white text-eu-ink"}`}>{n + 1}. {s}</button>)}
        </div>
      )}
      {st?.wait === "call" && <button type="button" onClick={() => send({ t: "skipCall" })} className="min-h-14 rounded-2xl bg-white/15 font-bold text-[length:var(--fs-18)]">Τέλος κλήσης → επόμενο</button>}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button type="button" onClick={() => send({ t: "back" })} className="min-h-14 rounded-2xl bg-white/15 font-bold text-[length:var(--fs-18)]">◀ Πίσω</button>
        <button type="button" onClick={() => { if (confirm("Από την αρχή;")) send({ t: "reset" }); }} className="min-h-14 rounded-2xl bg-eu-red/80 font-bold text-[length:var(--fs-18)]">Από την αρχή</button>
      </div>
    </div>
  );
}
