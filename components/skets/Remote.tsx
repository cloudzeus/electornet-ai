"use client";

import { useEffect, useState } from "react";
import type { Cmd, StageState } from "@/lib/skets/bus";

/**
 * @dynamic Τηλεχειριστήριο του σκετς για τον χειριστή στα παρασκήνια: βλέπει σε ποιο βήμα είναι η σκηνή, τι πρέπει να πει
 * ο παρουσιαστής για να προχωρήσει (cue) και τι λέει ο Ερμής, και στέλνει Επόμενο / Πίσω / κατάστημα / τέλος κλήσης.
 */
export default function Remote({ k }: { k: string }) {
  const [st, setSt] = useState<StageState | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const es = new EventSource(`/api/skets/events?role=remote&k=${encodeURIComponent(k)}`);
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.kind === "state") setSt(ev.state); };
    return () => es.close();
  }, [k]);
  const send = (cmd: Cmd) => { navigator.vibrate?.(20); fetch("/api/skets/cmd", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ cmd }) }).catch(() => {}); };

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

      <button type="button" onClick={() => send({ t: "next" })} className="min-h-[9rem] rounded-3xl bg-eu-yellow text-eu-navy font-black text-[length:var(--fs-36)] active:scale-[0.98]">Επόμενο ▶</button>

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
