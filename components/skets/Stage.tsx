"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { buildBeats, fallbackCall, fillStore, sceneAt, type Beat } from "@/lib/skets/script";
import type { CatKey, Room, SkCategory, SkProduct, Snapshot } from "@/lib/skets/types";
import type { Cmd } from "@/lib/skets/bus";
import css from "./skets.module.css";

/**
 * @dynamic Η σκηνή του σκετς (προβολέας 16:9). Προχωρά βήμα-βήμα (lib/skets/script.ts): Space / → / Enter = επόμενο,
 * ← = πίσω, 1–9 = κατάστημα, C = τέλος κλήσης, F = πλήρης οθόνη, Shift+R = από την αρχή. Τις ίδιες εντολές στέλνει
 * το τηλεχειριστήριο (/ermis-live/remote) μέσω SSE. Αποδίδεται μόνο στον browser (CSP: κανένα style attribute στο HTML).
 */
const StoreMap = dynamic(() => import("./StoreMap"), { ssr: false });

const ROOMS: { room: Room; label: string; cats: CatKey[] }[] = [
  { room: "bath", label: "Μπάνιο", cats: ["washer"] },
  { room: "kitchen", label: "Κουζίνα", cats: ["fridge", "cooker"] },
  { room: "living", label: "Σαλόνι", cats: ["tv", "ac"] },
];
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const spring = { type: "spring" as const, stiffness: 260, damping: 26 };

/** Ένας player για όλη τη σκηνή (οι browsers ξεκλειδώνουν τον ήχο μετά την πρώτη κίνηση του χρήστη). */
let player: HTMLAudioElement | null = null;
const getPlayer = () => (player ??= new Audio());

/** Στο πακέτο Starter το ElevenLabs δίνει την απομαγνητοφώνηση μόνο όταν κλείσει η κλήση (η ζωντανή είναι Enterprise):
 * σε κλήση δείχνουμε κυματομορφή, και στο τέλος τις φράσεις της συνομιλίας. */
interface CallView { status: "dialing" | "talking" | "ended" | "done" | "error"; id: string | null; error?: string; transcript: { who: "hermes" | "store"; text: string }[] }

export default function Stage({ snap, k, rehearsal, dry }: { snap: Snapshot; k: string; rehearsal: boolean; dry: boolean }) {
  const beats = useMemo(() => buildBeats(snap), [snap]);
  const [i, setI] = useState(0);
  const [store, setStore] = useState<number | null>(null);
  /** πρόοδος της φράσης του βήματος sp.i (0–1) — για άλλο βήμα ισχύει «δεν ξεκίνησε» */
  const [sp, setSp] = useState({ i: -1, p: 0, done: false });
  const [call, setCall] = useState<CallView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const beat = beats[i];
  const scene = sceneAt(beats, i);
  const say = beat.say ? fillStore(beat.say, store !== null ? snap.stores[store].spoken : snap.stores[0].spoken) : null;
  const progress = sp.i === i ? sp.p : say ? 0 : 1;
  const speaking = !!say && !(sp.i === i && sp.done);
  // μια απορριπτόμενη κάρτα δείχνει τη σφραγίδα στο δικό της βήμα και φεύγει στο επόμενο
  const rejectAt = useMemo(() => new Map(beats.flatMap((b, n) => (b.act?.t === "reject" ? [[b.act.id, n] as const] : []))), [beats]);
  const gone = new Set([...rejectAt].filter(([, n]) => n < i).map(([id]) => id));

  const stopAll = () => { clearTimeout(timer.current); player?.pause(); };
  const go = useCallback((n: number) => { stopAll(); setI(Math.max(0, Math.min(beats.length - 1, n))); }, [beats.length]);
  const next = useCallback(() => { stopAll(); setI((x) => Math.min(beats.length - 1, x + 1)); }, [beats.length]);

  // κάθε βήμα: φράση του Ερμή (ηχογραφημένη), και μετά — αν είναι αυτόματο — το επόμενο
  useEffect(() => {
    const cur = i;
    const advance = () => { if (beat.wait === "auto") timer.current = setTimeout(next, beat.delay ?? 400); };
    if (!say) { advance(); return; }
    const url = snap.voice[say];
    if (!url) {
      // χωρίς ηχογράφηση (πρόβα): υπότιτλος με ρυθμό ομιλίας
      const ms = Math.max(1500, say.length * 55), t0 = Date.now();
      const iv = setInterval(() => { const p = Math.min(1, (Date.now() - t0) / ms); setSp({ i: cur, p, done: p >= 1 }); if (p >= 1) { clearInterval(iv); advance(); } }, 80);
      return () => clearInterval(iv);
    }
    const a = getPlayer();
    a.src = url;
    a.ontimeupdate = () => setSp({ i: cur, p: a.duration ? a.currentTime / a.duration : 0, done: false });
    a.onended = () => { setSp({ i: cur, p: 1, done: true }); advance(); };
    a.play().catch(() => { setSp({ i: cur, p: 1, done: true }); advance(); });
    return () => { a.onended = null; a.ontimeupdate = null; };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps -- μία φορά ανά βήμα

  // η κλήση: ξεκινά στο βήμα call, υπότιτλοι από την απομαγνητοφώνηση, και όταν κλείσει πάμε στο τέλος
  const callStarted = useRef(false);
  useEffect(() => {
    if (beat.act?.t !== "call" || store === null || callStarted.current) return;
    callStarted.current = true;
    let stop = false, poll: ReturnType<typeof setTimeout> | undefined;
    const sim: ReturnType<typeof setTimeout>[] = [];
    // εφεδρεία: η γνωστή συνομιλία, μία φράση κάθε 2,6 s (στεγνή πρόβα ή αποτυχία της πραγματικής κλήσης)
    const simulate = () => {
      const lines = fallbackCall(snap, store);
      lines.forEach((_, n) => { sim.push(setTimeout(() => { if (stop) return; const done = n === lines.length - 1; setCall({ status: done ? "done" : "talking", id: null, transcript: lines.slice(0, n + 1) }); if (done) timer.current = setTimeout(next, 2500); }, 2200 + n * 2600)); });
    };
    (async () => {
      setCall({ status: "dialing", id: null, transcript: [] });
      if (dry) { simulate(); return; }
      const r = await fetch("/api/skets/call", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ store, rehearsal }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      if (stop) return;
      if (!r.id) { console.warn("skets call:", r.error); simulate(); return; }
      const tick = async () => {
        const c = await fetch(`/api/skets/call?id=${r.id}`, { headers: { "x-skets-key": k } }).then((x) => x.json()).catch(() => null);
        if (stop) return;
        if (c && !c.error) setCall({ status: c.done ? "done" : c.status === "processing" ? "ended" : c.status === "in-progress" ? "talking" : "dialing", id: r.id, transcript: c.transcript });
        if (c?.done) { timer.current = setTimeout(next, 9000); return; }
        poll = setTimeout(tick, 1500);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(poll); sim.forEach(clearTimeout); };
  }, [beat.act?.t, store, k, rehearsal, dry, next, snap]);

  const command = useCallback((c: Cmd) => {
    if (c.t === "next") { if (beat.wait === "store" && store === null) return; next(); }
    else if (c.t === "back") go(i - 1);
    else if (c.t === "goto") go(c.i);
    else if (c.t === "reset") { callStarted.current = false; setCall(null); setStore(null); go(0); }
    else if (c.t === "store") { if (scene.mode === "map" && beat.wait === "store" && snap.stores[c.i]) { setStore(c.i); timer.current = setTimeout(next, 1600); } }
    else if (c.t === "skipCall") { if (beat.wait === "call") next(); }
  }, [beat.wait, store, next, go, i, scene.mode, snap.stores]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); command({ t: "next" }); }
      else if (e.key === "ArrowLeft") command({ t: "back" });
      else if (e.key === "R" && e.shiftKey) command({ t: "reset" });
      else if (/^[1-9]$/.test(e.key)) command({ t: "store", i: Number(e.key) - 1 });
      else if (e.key === "c" || e.key === "C") command({ t: "skipCall" });
      else if (e.key === "f" || e.key === "F") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command]);

  // τηλεχειριστήριο: εντολές μέσα, κατάσταση έξω
  const cmdRef = useRef(command);
  useEffect(() => { cmdRef.current = command; }, [command]);
  useEffect(() => {
    const es = new EventSource(`/api/skets/events?role=stage&k=${encodeURIComponent(k)}`);
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.kind === "cmd") cmdRef.current(ev.cmd); };
    return () => es.close();
  }, [k]);
  useEffect(() => {
    fetch("/api/skets/cmd", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ state: { i, id: beat.id, wait: beat.wait, cue: beat.cue ?? null, say, total: beats.length, stores: snap.stores.map((s) => s.street), storeIdx: store, call: call?.status ?? null, at: 0 } }) }).catch(() => {});
  }, [i, store, call?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const cat = scene.cat ? snap.cats.find((c) => c.key === scene.cat)! : null;
  const showMap = scene.mode === "map" || scene.mode === "call" || scene.mode === "done";

  return (
    <div className={`fixed inset-0 overflow-hidden text-white select-none ${css.stage}`}>
      <div className={`absolute inset-0 pointer-events-none ${css.grain}`} />
      <TopBar rehearsal={rehearsal} />

      <LayoutGroup>
        <div className="absolute inset-x-0 top-[9vh] bottom-0 flex">
          {/* αριστερά: ο Ερμής και τι λέει */}
          <motion.aside layout transition={spring} className={`relative z-10 flex flex-col items-center justify-center gap-[3vh] px-[2.5vw] ${scene.mode === "idle" ? "w-full" : "w-[27vw]"}`}>
            <Orb speaking={speaking} listening={!speaking && (beat.wait === "presenter" || beat.wait === "store")} big={scene.mode === "idle"} />
            {scene.mode === "idle" ? <IdleTitle /> : <Caption text={say} progress={progress} />}
          </motion.aside>

          {scene.mode !== "idle" && (
            <main className="relative flex-1 flex flex-col pr-[2.5vw] pb-[3vh] min-w-0">
              <AnimatePresence mode="popLayout">
                {showMap ? (
                  <motion.section key="map" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="relative flex-1 rounded-[1.6rem] overflow-hidden ring-1 ring-white/15 shadow-2xl">
                    <StoreMap snap={snap} selected={store} onSelect={(n) => command({ t: "store", i: n })} />
                    <StoreList snap={snap} selected={store} onSelect={(n) => command({ t: "store", i: n })} dim={scene.mode !== "map"} />
                    <AnimatePresence>{scene.mode === "call" && call && store !== null && <CallPanel key="call" store={snap.stores[store]} call={call} />}</AnimatePresence>
                    <AnimatePresence>{scene.mode === "done" && store !== null && <DoneCard key="done" snap={snap} store={store} />}</AnimatePresence>
                  </motion.section>
                ) : (
                  <motion.section key="shop" className="flex-1 flex flex-col min-h-0" exit={{ opacity: 0, y: -30 }}>
                    <div className="flex-1 min-h-0 flex flex-col justify-center">
                      <AnimatePresence mode="wait">
                        {scene.mode === "cat" && cat && <Candidates key={cat.key} cat={cat} rejected={scene.rejected} gone={gone} picked={scene.picked[cat.key] ?? null} />}
                        {scene.mode === "summary" && <Summary key="sum" snap={snap} />}
                        {scene.mode === "intro" && (
                          <motion.div key="intro" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ delay: 0.4, ...spring }} className="text-center">
                            <div className="text-[length:var(--fs-120)] leading-none">🏠</div>
                            <div className="mt-[2vh] font-black tracking-tight text-[length:var(--fs-66)]">Νέο σπίτι · <span className="text-eu-yellow">Λάρισα</span></div>
                            <div className="mt-[1vh] text-white/65 font-semibold text-[length:var(--fs-28)]">5 βασικές συσκευές, από το μηδέν</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <House snap={snap} picked={scene.picked} current={scene.mode === "cat" ? scene.cat : null} big={scene.mode === "summary"} />
                  </motion.section>
                )}
              </AnimatePresence>
            </main>
          )}
        </div>
      </LayoutGroup>
      <div className="absolute bottom-[1.2vh] right-[1.5vw] text-white/25 text-[length:var(--fs-12)] tabular-nums">{i + 1}/{beats.length} · {beat.id}</div>
    </div>
  );
}

function TopBar({ rehearsal }: { rehearsal: boolean }) {
  return (
    <header className="absolute top-0 inset-x-0 h-[9vh] flex items-center justify-between px-[2.5vw] z-20">
      <div className="flex items-center gap-3">
        <span className="font-black tracking-tight text-[length:var(--fs-32)]">euronics</span>
        <span className="h-7 w-px bg-white/25" />
        <span className="font-bold text-eu-yellow text-[length:var(--fs-24)]">Ερμής</span>
      </div>
      <div className="flex items-center gap-3">
        {rehearsal && <span className="rounded-full bg-eu-red px-3 py-1 font-bold text-[length:var(--fs-14)]">ΠΡΟΒΑ</span>}
        <span className="rounded-full bg-white/10 ring-1 ring-white/20 px-4 py-1.5 font-semibold text-[length:var(--fs-18)]">📍 Λάρισα</span>
      </div>
    </header>
  );
}

function IdleTitle() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="text-center">
      <h1 className="font-black tracking-tight text-[length:var(--fs-96)] leading-none">Ερμής</h1>
      <p className="mt-4 text-white/70 text-[length:var(--fs-30)]">ο ψηφιακός σύμβουλος της Euronics</p>
    </motion.div>
  );
}

function Orb({ speaking, listening, big }: { speaking: boolean; listening: boolean; big: boolean }) {
  return (
    <motion.div layout transition={spring} className={`relative shrink-0 ${big ? "size-[34vh]" : "size-[22vh]"}`}>
      {speaking && <><span className={css.ring} /><span className={`${css.ring} ${css.ring2}`} /><span className={`${css.ring} ${css.ring3}`} /></>}
      <motion.div
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff6c9_0%,#f1c400_28%,#1d428a_70%,#0b1f45_100%)] shadow-[0_0_80px_rgb(241_196_0/0.35)]"
        animate={speaking ? { scale: [1, 1.07, 0.98, 1.05, 1] } : listening ? { scale: [1, 1.025, 1] } : { scale: 1 }}
        transition={speaking ? { duration: 0.9, repeat: Infinity } : { duration: 2.4, repeat: Infinity }}
      />
      <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_50%_40%,rgb(255_255_255/0.35),transparent_60%)]" />
      <AnimatePresence>
        {listening && !big && <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -bottom-[5vh] inset-x-0 text-center text-white/60 text-[length:var(--fs-18)] whitespace-nowrap">σε ακούω…</motion.span>}
      </AnimatePresence>
    </motion.div>
  );
}

/** Ο υπότιτλος «γράφεται» με τον ρυθμό της φωνής. */
function Caption({ text, progress }: { text: string | null; progress: number }) {
  if (!text) return <div className="min-h-[20vh]" />;
  const words = text.split(" ");
  const shown = Math.max(1, Math.ceil(words.length * Math.min(1, progress * 1.08)));
  return (
    <div className="min-h-[20vh] w-full rounded-[1.4rem] bg-white/[0.07] ring-1 ring-white/15 backdrop-blur px-[1.4vw] py-[2vh]">
      <p className="font-semibold leading-snug text-[length:var(--fs-26)]">
        {words.map((w, n) => <motion.span key={`${text}-${n}`} initial={false} animate={{ opacity: n < shown ? 1 : 0.18 }} transition={{ duration: 0.2 }}>{w} </motion.span>)}
      </p>
    </div>
  );
}

function Candidates({ cat, rejected, gone, picked }: { cat: SkCategory; rejected: Record<string, string>; gone: Set<string>; picked: string | null }) {
  const visible = cat.candidates.filter((p) => !gone.has(p.id));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} className="flex flex-col gap-[2.5vh]">
      <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="font-black tracking-tight text-[length:var(--fs-50)]">{cat.label}</motion.h2>
      <motion.div layout className="flex gap-[1.4vw] justify-start">
        <AnimatePresence mode="popLayout">
          {visible.map((p, n) => <Card key={p.id} p={p} n={n} reason={rejected[p.id] ?? null} chosen={picked === p.id} />)}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function Card({ p, n, reason, chosen }: { p: SkProduct; n: number; reason: string | null; chosen: boolean }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 60, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: chosen ? 1.06 : 1 }}
      exit={{ opacity: 0, scale: 0.7, y: 80, rotate: -6, filter: "blur(6px)", transition: { duration: 0.55 } }}
      transition={{ ...spring, delay: reason || chosen ? 0 : n * 0.18 }}
      className={`relative w-[15vw] min-w-[13rem] rounded-[1.4rem] bg-white text-eu-ink overflow-hidden shadow-2xl ${chosen ? "ring-[6px] ring-eu-yellow" : ""}`}
    >
      <motion.div layoutId={`img-${p.id}`} className="aspect-square bg-eu-surface grid place-items-center p-[1.4vh]">
        <img src={p.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
      </motion.div>
      <div className="p-[1.2vh_1vw_1.6vh] flex flex-col gap-[0.8vh]">
        <span className="font-black uppercase tracking-wide text-eu-blue text-[length:var(--fs-16)]">{p.brand}</span>
        <span className="line-clamp-2 font-semibold leading-tight text-[length:var(--fs-15)] min-h-[2.5em]">{p.title}</span>
        <div className="flex flex-wrap gap-1.5">
          {p.chips.filter((c) => !c.endsWith("€")).map((c) => <span key={c} className="rounded-full bg-eu-chip px-2.5 py-0.5 font-bold text-[length:var(--fs-14)]">{c}</span>)}
        </div>
        <span className="font-black text-[length:var(--fs-28)]">{eur(p.price)}</span>
      </div>
      <AnimatePresence>
        {reason && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-eu-red/80 flex flex-col items-center justify-center gap-[2vh] p-[1vw] text-white text-center">
            <motion.span initial={{ scale: 3, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="font-black leading-none text-[length:var(--fs-120)]">✕</motion.span>
            <span className="font-bold leading-tight text-[length:var(--fs-20)]">{reason}</span>
          </motion.div>
        )}
        {chosen && (
          <motion.span initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-3 inset-x-3 rounded-full bg-eu-yellow text-eu-navy text-center font-black py-1.5 text-[length:var(--fs-16)]">★ Η επιλογή του Ερμή</motion.span>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Το σπίτι: τρία δωμάτια, κάθε επιλεγμένη συσκευή «πετά» στη θέση της (κοινό layoutId με την κάρτα). */
function House({ snap, picked, current, big }: { snap: Snapshot; picked: Partial<Record<CatKey, string>>; current: CatKey | null; big: boolean }) {
  // στο σύνολο μετρά ό,τι έχει ήδη μπει στο σπίτι (όχι η κάρτα που ακόμη αναβοσβήνει στη μέση)
  const total = Object.entries(picked).reduce((t, [c, id]) => t + (c === current ? 0 : snap.cats.find((x) => x.key === c)!.candidates.find((p) => p.id === id)?.price ?? 0), 0);
  return (
    <motion.div layout transition={spring} className={`mt-[2vh] rounded-[1.6rem] bg-white/[0.06] ring-1 ring-white/15 flex items-stretch gap-[1vw] ${big ? "p-[2vh_1.4vw]" : "p-[1.4vh_1vw]"}`}>
      {ROOMS.map((r) => (
        <div key={r.room} className={`min-w-0 ${r.cats.length > 1 ? "flex-[2]" : "flex-1"}`}>
          <div className="font-bold text-white/60 uppercase tracking-wider mb-[0.8vh] text-[length:var(--fs-14)]">{r.label}</div>
          <div className="flex gap-[0.6vw]">
            {r.cats.map((c) => {
              const id = picked[c], cat = snap.cats.find((x) => x.key === c)!;
              const p = id && current !== c ? cat.candidates.find((x) => x.id === id) : null;
              return (
                <div key={c} className={`flex-1 rounded-[1rem] flex items-center gap-[0.6vw] ${big ? "h-[17vh]" : "h-[11vh]"} ${p ? "bg-white text-eu-ink p-[0.8vh]" : `border-2 border-dashed ${current === c ? "border-eu-yellow bg-eu-yellow/10" : "border-white/25"} justify-center`}`}>
                  {p ? (
                    <>
                      <motion.div layoutId={`img-${p.id}`} transition={{ type: "spring", stiffness: 120, damping: 20 }} className="h-full aspect-square shrink-0 grid place-items-center bg-eu-surface rounded-[0.7rem] p-1">
                        <img src={p.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                      </motion.div>
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="min-w-0">
                        <div className="font-black text-eu-blue text-[length:var(--fs-14)] truncate">{p.brand}</div>
                        <div className="font-bold text-[length:var(--fs-14)] truncate">{p.key}</div>
                        <div className="font-black text-[length:var(--fs-17)] whitespace-nowrap">{eur(p.price)}</div>
                      </motion.div>
                    </>
                  ) : (
                    <span className={`font-semibold text-center px-2 text-[length:var(--fs-14)] ${current === c ? "text-eu-yellow" : "text-white/40"}`}>{cat.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="w-[9vw] shrink-0 flex flex-col justify-end items-end">
        <span className="text-white/60 font-semibold text-[length:var(--fs-14)]">Σύνολο</span>
        <motion.span key={total} initial={{ scale: 1.3, color: "#f1c400" }} animate={{ scale: 1, color: "#ffffff" }} className="font-black tabular-nums text-[length:var(--fs-36)]">{eur(total)}</motion.span>
      </div>
    </motion.div>
  );
}

function Summary({ snap }: { snap: Snapshot }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring} className="text-center">
      <div className="text-eu-yellow font-black text-[length:var(--fs-80)] leading-none">Έτοιμο το σπίτι!</div>
      <div className="mt-[2vh] text-white/80 font-semibold text-[length:var(--fs-30)]">5 συσκευές · {eur(snap.total)}{snap.instalments ? ` · ${snap.instalments.months} άτοκες δόσεις των ${snap.instalments.amount.toLocaleString("el-GR")} €` : ""}</div>
    </motion.div>
  );
}

function StoreList({ snap, selected, onSelect, dim }: { snap: Snapshot; selected: number | null; onSelect: (i: number) => void; dim: boolean }) {
  return (
    <motion.ul initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: dim ? 0 : 1 }} transition={{ delay: dim ? 0 : 4.2, ...spring }} className="absolute right-[1.2vw] top-[2vh] z-[500] w-[24vw] flex flex-col gap-[1.2vh]">
      {snap.stores.map((s, n) => (
        <motion.li key={s.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 4.3 + n * 0.15 }}>
          <button type="button" onClick={() => onSelect(n)} className={`w-full text-left rounded-[1.1rem] p-[1.4vh_1vw] flex items-center gap-[0.8vw] shadow-xl transition-colors ${selected === n ? "bg-eu-yellow text-eu-navy" : "bg-white/95 text-eu-ink"}`}>
            <span className={`size-[5vh] shrink-0 rounded-full grid place-items-center font-black text-[length:var(--fs-20)] ${selected === n ? "bg-eu-navy text-eu-yellow" : "bg-eu-navy text-white"}`}>{n + 1}</span>
            <span className="min-w-0">
              <span className="block font-black text-[length:var(--fs-18)] truncate">Euronics {s.street}</span>
              <span className="block font-semibold opacity-75 text-[length:var(--fs-15)]">{s.address} · {s.km.toLocaleString("el-GR")} km</span>
            </span>
          </button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function CallPanel({ store, call }: { store: Snapshot["stores"][number]; call: CallView }) {
  const label = { dialing: "Καλώ…", talking: "Σε κλήση", ended: "Η κλήση έκλεισε · καταγράφεται…", done: "Η κλήση ολοκληρώθηκε", error: "Η κλήση δεν έγινε" }[call.status];
  return (
    <motion.div initial={{ x: "110%" }} animate={{ x: 0 }} exit={{ x: "110%" }} transition={spring} className="absolute right-[1.2vw] top-[2vh] bottom-[2vh] z-[600] w-[34vw] rounded-[1.4rem] bg-eu-navy/95 backdrop-blur ring-1 ring-white/20 shadow-2xl flex flex-col overflow-hidden">
      <div className="p-[2vh_1.4vw] flex items-center gap-[1vw] border-b border-white/10">
        <div className="relative size-[8vh] shrink-0 rounded-full bg-eu-yellow grid place-items-center text-[length:var(--fs-36)]">
          {(call.status === "dialing" || call.status === "talking") && <><span className={css.ring} /><span className={`${css.ring} ${css.ring2}`} /></>}
          📞
        </div>
        <div className="min-w-0">
          <div className="font-black text-[length:var(--fs-22)] truncate">Euronics {store.street}</div>
          <div className="text-white/70 font-semibold text-[length:var(--fs-16)]">{label}</div>
        </div>
        {call.status === "talking" && <div className="ml-auto flex items-center gap-1 h-[2.6rem]">{[0, 1, 2, 3, 4].map((n) => <span key={n} className={`${css.bar} ${css[`b${n + 1}`]}`} />)}</div>}
      </div>
      <div className="flex-1 overflow-hidden p-[1.6vh_1.2vw] flex flex-col justify-end gap-[1.2vh]">
        {call.error && <p className="text-eu-yellow font-semibold text-[length:var(--fs-18)]">{call.error}</p>}
        <AnimatePresence initial={false}>
          {call.transcript.slice(-6).map((t, n) => (
            <motion.div key={`${call.transcript.length - 6 + n}-${t.text.slice(0, 12)}`} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[88%] rounded-[1rem] px-[1vw] py-[1vh] font-semibold leading-snug text-[length:var(--fs-18)] ${t.who === "hermes" ? "self-start bg-eu-yellow text-eu-navy" : "self-end bg-white text-eu-ink"}`}>
              <span className="block font-black opacity-60 text-[length:var(--fs-12)] uppercase">{t.who === "hermes" ? "Ερμής" : "Κατάστημα"}</span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DoneCard({ snap, store }: { snap: Snapshot; store: number }) {
  const s = snap.stores[store];
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring} className="absolute inset-0 z-[700] grid place-items-center bg-eu-navy/55 backdrop-blur-sm">
      <div className="w-[52vw] rounded-[1.8rem] bg-white text-eu-ink p-[4vh_3vw] shadow-2xl text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.2 }} className="mx-auto size-[12vh] rounded-full bg-eu-green text-white grid place-items-center text-[length:var(--fs-66)] font-black">✓</motion.div>
        <h3 className="mt-[2vh] font-black text-[length:var(--fs-44)]">Σε περιμένουν σήμερα</h3>
        <p className="mt-[1vh] font-semibold text-eu-muted text-[length:var(--fs-24)]">Euronics {s.street} · {s.address}, {s.city}</p>
        <div className="mt-[3vh] flex justify-center gap-[1vw]">
          {snap.cats.map((c, n) => { const p = c.candidates.find((x) => x.id === c.pick)!; return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + n * 0.12 }} className="size-[11vh] rounded-[1rem] bg-eu-surface grid place-items-center p-2">
              <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply" />
            </motion.div>
          ); })}
        </div>
        <p className="mt-[2.4vh] font-black text-[length:var(--fs-30)]">Καλή αρχή στη Λάρισα, {snap.presenter.vocative}!</p>
      </div>
    </motion.div>
  );
}

export type { Beat };
