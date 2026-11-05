"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, CornerUpLeft, House as HouseIcon, MapPin, Maximize, Mic as MicIcon, Phone, Play, X } from "lucide-react";
import { buildBeats, fallbackCall, fillStore, instalmentsOf, pickOf, sceneAt, totalOf, LIVE_BACK, LIVE_FILLERS, TURN_FILLERS, type Beat } from "@/lib/skets/script";
import type { Alts, CatKey, LiveEv, LiveProduct, Room, SkCategory, SkProduct, Snapshot } from "@/lib/skets/types";
import type { Cmd } from "@/lib/skets/bus";
import { askLive, startPtt, type Ptt } from "./ptt";
import { openMic, useVad, type Mic } from "./vad";
import css from "./skets.module.css";

/**
 * @dynamic Η σκηνή του σκετς (προβολέας 16:9). Προχωρά βήμα-βήμα (lib/skets/script.ts): Space / → / Enter = επόμενο,
 * ← = πίσω, 1–9 = κατάστημα, C = τέλος κλήσης, F = πλήρης οθόνη, Shift+R = από την αρχή. Τις ίδιες εντολές στέλνει
 * το τηλεχειριστήριο (/ermis-live/remote) μέσω SSE. Αποδίδεται μόνο στον browser (CSP: κανένα style attribute στο HTML).
 * Ερώτηση εκτός σεναρίου: κρατάς πατημένο το M (μικρόφωνο του laptop) ή το «Μίλα στον Ερμή» στο τηλεχειριστήριο → απαντά
 * ζωντανά ο Ερμής του eshop (/api/skets/ask). Esc ή Επόμενο = πίσω στο σενάριο, από εκεί που έμεινε.
 * Αυτόματη συνέχεια (προεπιλογή· &auto=0 για χειροκίνητο): με το «Ενεργοποίηση μικροφώνου» ο Ερμής ακούει το μικρόφωνο του
 * laptop και, όταν περιμένει τον παρουσιαστή, απαντά μόλις εκείνος πει την ατάκα του και σωπάσει (components/skets/vad.ts).
 * A = αυτόματο ναι/όχι· το «Επόμενο» (Space / τηλεχειριστήριο) δουλεύει πάντα ως εφεδρεία.
 */
const StoreMap = dynamic(() => import("./StoreMap"), { ssr: false });

const ROOMS: { room: Room; label: string; cats: CatKey[] }[] = [
  { room: "bath", label: "Μπάνιο", cats: ["washer"] },
  { room: "kitchen", label: "Κουζίνα", cats: ["fridge", "cooker"] },
  { room: "living", label: "Σαλόνι", cats: ["tv", "ac"] },
];
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const spring = { type: "spring" as const, stiffness: 260, damping: 26 };
/** «AEG» + «AEG LTR7E373G ΠΛΥΝΤΗΡΙΑ…» → χωρίς διπλή μάρκα στην κάρτα */
const titleOf = (p: { brand: string; title: string }) => (p.title.toUpperCase().startsWith(p.brand.toUpperCase()) ? p.title.slice(p.brand.length).trim() : p.title);

/** Ό,τι είναι για τον χειριστή (μπάρα, οδηγίες) φαίνεται μόνο όσο κινείται το ποντίκι — το κοινό βλέπει μόνο τη σκηνή. */
function useWake(ms = 3500) {
  const [shown, setShown] = useState(true);
  const holdRef = useRef(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const wake = () => { setShown(true); clearTimeout(t); t = setTimeout(() => { if (!holdRef.current) setShown(false); }, ms); };
    wake();
    window.addEventListener("mousemove", wake); window.addEventListener("pointerdown", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); window.removeEventListener("pointerdown", wake); };
  }, [ms]);
  return { shown, setShown, holdRef };
}

/** Ένας player για όλη τη σκηνή (οι browsers ξεκλειδώνουν τον ήχο μετά την πρώτη κίνηση του χρήστη). */
let player: HTMLAudioElement | null = null;
const getPlayer = () => (player ??= new Audio());

/** Στο πακέτο Starter το ElevenLabs δίνει την απομαγνητοφώνηση μόνο όταν κλείσει η κλήση (η ζωντανή είναι Enterprise):
 * σε κλήση δείχνουμε κυματομορφή, και στο τέλος τις φράσεις της συνομιλίας. */
interface CallView { status: "dialing" | "talking" | "ended" | "done" | "error"; id: string | null; error?: string; transcript: { who: "hermes" | "store"; text: string }[] }

export default function Stage({ snap, k, rehearsal, dry, auto: autoDefault = true }: { snap: Snapshot; k: string; rehearsal: boolean; dry: boolean; auto?: boolean }) {
  /** διακλαδώσεις που διάλεξε η απάντηση του παρουσιαστή (π.χ. 40 τ.μ. → 18.000 BTU): αλλάζουν τα επόμενα βήματα, το σύνολο και την κλήση */
  const [alts, setAlts] = useState<Alts>({});
  /** η μπάρα χειρισμού δεν φαίνεται στο κοινό· μόνο με ?ops στη διεύθυνση (χειρισμός από το κινητό ή με το πληκτρολόγιο) */
  const [ops, setOps] = useState(false);
  useEffect(() => setOps(new URLSearchParams(location.search).has("ops")), []);
  /** ομάδες που ο παρουσιαστής απάντησε ήδη νωρίτερα (όλα μαζί σε μία φράση): ο Ερμής δεν τις ξαναρωτά */
  const [ahead, setAhead] = useState<CatKey[]>([]);
  const beats = useMemo(() => buildBeats(snap, alts, ahead), [snap, alts, ahead]);
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

  // ζωντανή ερώτηση του κοινού: το σενάριο παγώνει, απαντά ο Ερμής του eshop, και μετά συνεχίζουμε από το ίδιο βήμα
  const [live, setLive] = useState<LiveEv | null>(null);
  const [listening, setListening] = useState(false);
  const [auto, setAuto] = useState(autoDefault);
  const [liveSp, setLiveSp] = useState({ p: 0, speaking: false });
  const [extras, setExtras] = useState<LiveProduct[]>([]);
  /** αυξάνεται για να ξαναπαιχτεί η φράση του τρέχοντος βήματος (επιστροφή από ζωντανή ερώτηση) */
  const [replay, setReplay] = useState(0);
  const clips = useRef<Record<string, string>>({});
  const liveProducts = useRef(new Map<string, LiveProduct>());
  const liveN = useRef(0);
  /** ουρά της ζωντανής απάντησης: ένα κλιπ ανά πρόταση (part), παίζουν με τη σειρά μόλις ελευθερωθεί ο player */
  const lq = useRef({ busy: false, parts: new Map<number, string>(), next: 0, total: 0, wait: undefined as ReturnType<typeof setTimeout> | undefined });
  const spRef = useRef(sp);
  const iRef = useRef(i);
  useEffect(() => { iRef.current = i; }, [i]);
  /** η τρέχουσα ζωντανή απάντηση είναι προς τον παρουσιαστή (quiet): κλείνει μόνη της, χωρίς «πάμε πίσω» */
  const quiet = useRef(false);
  const turnFill = useRef(0);
  const quietClose = () => { setLive(null); setListening(false); setLiveSp({ p: 0, speaking: false }); clearTimeout(lq.current.wait); lq.current = { busy: false, parts: new Map(), next: 0, total: 0, wait: undefined }; liveN.current = 0; quiet.current = false; };
  useEffect(() => { spRef.current = sp; }, [sp]);
  useEffect(() => { fetch("/api/skets/ask", { headers: { "x-skets-key": k } }).then((r) => r.json()).then((m) => { clips.current = m ?? {}; }).catch(() => {}); }, [k]);

  /** ένα κλιπ στον player της σκηνής (αντικαθιστά τους handlers του βήματος — το σενάριο έχει ήδη παγώσει) */
  const playClip = (url: string | undefined, onEnd: () => void, onProgress?: (p: number) => void) => {
    if (!url) { onEnd(); return; }
    const a = getPlayer();
    a.src = url;
    a.ontimeupdate = onProgress ? () => onProgress(a.duration ? a.currentTime / a.duration : 0) : null;
    a.onended = onEnd;
    a.play().catch(onEnd);
  };
  const pump = () => {
    const Q = lq.current, url = Q.parts.get(Q.next);
    if (Q.busy || !url) return;
    Q.busy = true; clearTimeout(Q.wait);
    const n = Q.next, total = Math.max(1, Q.total);
    playClip(url, () => {
      Q.busy = false; Q.next = n + 1;
      if (Q.next >= total) { setLiveSp({ p: 1, speaking: false }); if (quiet.current) { timer.current = setTimeout(quietClose, 600); return; } }
      pump();
    }, (p) => setLiveSp({ p: (n + p) / total, speaking: true }));
  };
  const filler = (text: string) => { const Q = lq.current; Q.busy = true; playClip(clips.current[text], () => { Q.busy = false; pump(); }); };
  const onLive = useCallback((ev: LiveEv) => {
    if (beat.wait === "call") return; // η κλήση στο κατάστημα δεν διακόπτεται
    const Q = lq.current;
    if (ev.phase === "resume") { if (ev.n === liveN.current) { player?.pause(); quietClose(); } return; }
    if (ev.phase === "thinking" && liveN.current !== ev.n) {
      liveN.current = ev.n; quiet.current = !!ev.quiet;
      stopAll(); clearTimeout(Q.wait);
      lq.current = { busy: false, parts: new Map(), next: 0, total: 0, wait: undefined };
      setLiveSp({ p: 0, speaking: false });
      if (ev.quiet) {
        // ο παρουσιαστής είπε κάτι εκτός σεναρίου (ίσως απλώς «καλημέρα»): όχι «ψάχνω στον κατάλογο» — ένα σύντομο «Μάλιστα…»
        // μόνο αν αργήσει, κάθε φορά άλλο (ποτέ το ίδιο δύο φορές στη σειρά)
        lq.current.wait = setTimeout(() => { if (!lq.current.busy && !lq.current.parts.size) { turnFill.current = (turnFill.current + 1 + Math.floor(Math.random() * (TURN_FILLERS.length - 1))) % TURN_FILLERS.length; filler(TURN_FILLERS[turnFill.current]); } }, 1100);
      } else {
        filler(LIVE_FILLERS[ev.n % LIVE_FILLERS.length]);
        // αν η αναζήτηση αργεί, δεύτερη φράση αναμονής — όχι σιωπή στη σκηνή
        lq.current.wait = setTimeout(() => { if (!lq.current.busy && !lq.current.parts.size) filler(LIVE_FILLERS[(ev.n + 1) % LIVE_FILLERS.length]); }, 8000);
      }
    }
    if (ev.n !== liveN.current && ev.phase !== "error") return;
    if (ev.products) ev.products.forEach((p) => liveProducts.current.set(p.id, p));
    setListening(false);
    setLive((cur) => ({ ...cur, ...ev, products: ev.products ?? cur?.products, text: ev.text ?? cur?.text }));
    if (ev.phase === "error") { clearTimeout(lq.current.wait); if (quiet.current) timer.current = setTimeout(quietClose, 2500); }
    if (ev.phase === "audio" && ev.audio) { lq.current.parts.set(ev.part ?? 0, ev.audio); lq.current.total = ev.parts ?? 1; pump(); }
  }, [beat.wait]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeLive = useCallback(() => {
    setLive(null); setListening(false); setLiveSp({ p: 0, speaking: false }); clearTimeout(lq.current.wait); lq.current = { busy: false, parts: new Map(), next: 0, total: 0, wait: undefined }; liveN.current = 0;
    stopAll();
    // συνέχεια: αν η φράση του βήματος είχε ακουστεί, το βήμα προχωρά όπως θα προχωρούσε· αλλιώς ξαναλέγεται
    playClip(clips.current[LIVE_BACK], () => {
      const s = spRef.current;
      if (s.i === i && s.done) { if (beat.wait === "auto") timer.current = setTimeout(next, beat.delay ?? 400); }
      else setReplay((x) => x + 1);
    });
  }, [i, beat.wait, beat.delay, next]);

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
  }, [i, replay]); // eslint-disable-line react-hooks/exhaustive-deps -- μία φορά ανά βήμα (και στην επιστροφή από ζωντανή ερώτηση)

  const extrasRef = useRef(extras);
  useEffect(() => { extrasRef.current = extras; }, [extras]);
  // η κλήση: ξεκινά στο βήμα call, υπότιτλοι από την απομαγνητοφώνηση, και όταν κλείσει πάμε στο τέλος
  const callStarted = useRef(false);
  useEffect(() => {
    if (beat.act?.t !== "call" || store === null || callStarted.current) return;
    callStarted.current = true;
    let stop = false, poll: ReturnType<typeof setTimeout> | undefined, closeAudio = () => {};
    const sim: ReturnType<typeof setTimeout>[] = [];
    // εφεδρεία: η γνωστή συνομιλία, μία φράση κάθε 2,6 s (στεγνή πρόβα ή αποτυχία της πραγματικής κλήσης)
    const simulate = () => {
      const lines = fallbackCall(snap, store);
      lines.forEach((_, n) => { sim.push(setTimeout(() => { if (stop) return; const done = n === lines.length - 1; setCall({ status: done ? "done" : "talking", id: null, transcript: lines.slice(0, n + 1) }); if (done) timer.current = setTimeout(next, 2500); }, 2200 + n * 2600)); });
    };
    (async () => {
      setCall({ status: "dialing", id: null, transcript: [] });
      if (dry) { simulate(); return; }
      const r = await fetch("/api/skets/call", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ store, rehearsal, alts, extras: extrasRef.current.map((p) => `${p.brand} ${p.title.split(" ").slice(0, 6).join(" ")}`) }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      if (stop) return;
      if (!r.id) { console.warn("skets call:", r.error); simulate(); return; }
      let audio = false;
      const tick = async () => {
        const c = await fetch(`/api/skets/call?id=${r.id}`, { headers: { "x-skets-key": k } }).then((x) => x.json()).catch(() => null);
        if (stop) return;
        // ο ήχος ανοίγει μόλις σηκωθεί το τηλέφωνο (νωρίτερα το Vapi απορρίπτει τη σύνδεση)
        if (r.listenUrl && !audio && c?.status === "in-progress") { audio = true; closeAudio = listen(r.listenUrl); }
        if (c && !c.error) setCall({ status: c.done ? "done" : c.status === "processing" ? "ended" : c.status === "in-progress" ? "talking" : "dialing", id: r.id, transcript: c.transcript });
        // Vapi: οι υπότιτλοι είναι ήδη ζωντανοί, μικρή παύση· ElevenLabs: έρχονται μόλις κλείσει, χρόνος να διαβαστούν
        if (c?.done) { closeAudio(); timer.current = setTimeout(next, r.provider === "vapi" ? 4000 : 9000); return; }
        poll = setTimeout(tick, 1500);
      };
      tick();
    })();
    return () => { stop = true; clearTimeout(poll); sim.forEach(clearTimeout); closeAudio(); };
  }, [beat.act?.t, store, k, rehearsal, dry, next, snap]); // eslint-disable-line react-hooks/exhaustive-deps -- alts: όπως ήταν όταν ξεκίνησε η κλήση

  const command = useCallback((c: Cmd) => {
    if (c.t === "liveListen") { if (beat.wait === "call") return; setListening(c.on); if (c.on) { stopAll(); lq.current.busy = false; } return; }
    if (c.t === "liveClose") { if (live || listening) closeLive(); return; }
    if (c.t === "auto") { setAuto(c.on); return; }
    if (c.t === "addExtra") { const p = liveProducts.current.get(c.id); if (p) setExtras((x) => (x.some((y) => y.id === p.id) ? x : [...x, p].slice(-4))); return; }
    // ενώ είναι ανοιχτή ζωντανή ερώτηση, το «Επόμενο» γυρίζει στο σενάριο (δεν προσπερνά βήμα)
    if (c.t === "next" && (live || listening)) { closeLive(); return; }
    // κλήση σε εξέλιξη: μόνο το «Τέλος κλήσης» την κόβει· το «Επόμενο» από συνήθεια δεν τη σταματά
    if (c.t === "next") { if (beat.wait === "store" && store === null) return; if (beat.wait === "call" && (call?.status === "dialing" || call?.status === "talking")) return; next(); }
    else if (c.t === "back") go(i - 1);
    else if (c.t === "goto") go(c.i);
    else if (c.t === "reset") { callStarted.current = false; setCall(null); setStore(null); setLive(null); setListening(false); setExtras([]); setAlts({}); setAhead([]); liveN.current = 0; fetch("/api/skets/ask", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) }).catch(() => {}); go(0); }
    else if (c.t === "store") { if (scene.mode === "map" && beat.wait === "store" && store === null && snap.stores[c.i]) { // μία επιλογή: φωνή ή κλικ, όποιο έρθει πρώτο
      setStore(c.i); timer.current = setTimeout(next, 900); } }
    else if (c.t === "skipCall") { if (beat.wait === "call") next(); }
  }, [beat.wait, store, next, go, i, scene.mode, snap.stores, live, listening, closeLive, k, call?.status]);

  // αυτόματη συνέχεια: ο Ερμής ακούει το μικρόφωνο της σκηνής όσο περιμένει τον παρουσιαστή και δεν μιλά ο ίδιος
  const [mic, setMic] = useState<Mic | null>(null);
  const [micErr, setMicErr] = useState(false);
  const meter = useRef<HTMLSpanElement>(null);
  const armMic = async () => { setMicErr(false); const m = await openMic(); if (m) setMic(m); else setMicErr(true); };
  useEffect(() => () => { mic?.stream.getTracks().forEach((t) => t.stop()); mic?.ctx.close().catch(() => {}); }, [mic]);
  /** η ατάκα του παρουσιαστή εξετάζεται (σενάριο ή ελεύθερη ερώτηση) */
  const [turnBusy, setTurnBusy] = useState(false);
  const [heard, setHeard] = useState<{ said: string; route: string; i: number } | null>(null);
  const hearing = auto && !!mic && (beat.wait === "presenter" || (beat.wait === "store" && store === null)) && !speaking && !live && !listening && !turnBusy && i < beats.length - 1;
  const onTurn = (audio: Blob | null) => {
    // η πρώτη ατάκα (έναρξη) και ό,τι δεν είναι ατάκα με «» προχωρούν αμέσως· οι άλλες: σενάριο ή ελεύθερη απάντηση
    if (!audio || (beat.wait !== "store" && !/^«/.test(beat.cue ?? ""))) { if (beat.wait !== "store") command({ t: "next" }); return; }
    const at = i;
    setTurnBusy(true);
    const fd = new FormData(); fd.append("audio", audio, audio.type.includes("mp4") ? "turn.m4a" : "turn.webm"); fd.append("beat", beat.id); fd.append("alts", JSON.stringify(alts)); fd.append("ahead", JSON.stringify(ahead));
    fetch("/api/skets/turn", { method: "POST", headers: { "x-skets-key": k }, body: fd }).then((r) => r.json()).catch(() => ({ route: "script" }))
      .then((r: { route?: string; cat?: CatKey; alt?: string; i?: number; said?: string; to?: string; learned?: { ahead: CatKey[]; alts: Alts } }) => {
        setTurnBusy(false);
        if (iRef.current === at && r.learned) { const l = r.learned; setAhead((x) => [...new Set([...x, ...l.ahead])]); setAlts((a) => ({ ...a, ...l.alts })); }
        if (r.said) setHeard({ said: r.said, route: r.route ?? "script", i: at });
        if (iRef.current !== at) return;
        // «της Ηπείρου» / «το πρώτο»: όπως το κλικ στον χάρτη
        if (r.route === "store") { if (typeof r.i === "number") command({ t: "store", i: r.i }); return; }
        if (r.route === "jump" && r.to) {
          if (r.cat && r.alt) { const cat = r.cat; setAlts((a) => ({ ...a, [cat]: r.alt })); }
          const to = beats.findIndex((b) => b.id === r.to); if (to > 0) { quietClose(); go(to); } return;
        }
        if (r.route === "free" || r.route === "none") return;
        if (r.route === "alt" && r.cat) { const cat = r.cat; setAlts((a) => ({ ...a, [cat]: r.alt || undefined })); }
        quietClose(); next();
      });
  };
  useVad(mic, hearing, () => !!player && !player.paused && !player.ended, onTurn, (level, voiced) => {
    // στάθμη χωρίς re-render της σκηνής (CSSOM, όχι style attribute)
    const el = meter.current; if (!el) return;
    el.style.width = `${Math.min(100, Math.round(level * 50))}%`;
    el.classList.toggle("bg-eu-green", voiced); el.classList.toggle("bg-white/70", !voiced);
  });

  // M (κρατημένο) ή το «Ερώτηση» της μπάρας = ερώτηση από το μικρόφωνο του laptop
  const ptt = useRef<Promise<Ptt | null> | null>(null);
  const pttDown = useCallback(() => { if (ptt.current || beat.wait === "call") return; command({ t: "liveListen", on: true }); ptt.current = startPtt(); }, [command, beat.wait]);
  const pttUp = useCallback(async () => {
    if (!ptt.current) return;
    const rec = await ptt.current; ptt.current = null;
    const blob = rec ? await rec.stop() : null;
    if (blob) askLive(k, blob);
    else { setListening(false); setLive({ n: Date.now(), phase: "error", q: "", error: rec ? "Δεν ακούστηκε τίποτα — κράτα πατημένο όσο μιλάς." : "Το μικρόφωνο δεν άνοιξε — επίτρεψέ το στον browser (εικονίδιο στη γραμμή διεύθυνσης)." }); }
  }, [k]);
  useEffect(() => {
    // e.code: το φυσικό πλήκτρο, ώστε να δουλεύει και με ελληνικό πληκτρολόγιο («μ»)
    const down = (e: KeyboardEvent) => { if (e.code === "KeyM" && !e.repeat) pttDown(); };
    const up = (e: KeyboardEvent) => { if (e.code === "KeyM") pttUp(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pttDown, pttUp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { command({ t: "liveClose" }); return; }
      if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); command({ t: "next" }); }
      else if (e.key === "ArrowLeft") command({ t: "back" });
      else if (e.code === "KeyR" && e.shiftKey) command({ t: "reset" });
      else if (/^[1-9]$/.test(e.key)) command({ t: "store", i: Number(e.key) - 1 });
      else if (e.code === "KeyC") command({ t: "skipCall" });
      else if (e.code === "KeyA") setAuto((x) => !x);
      else if (e.code === "KeyF") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command]);

  // τηλεχειριστήριο: εντολές μέσα, κατάσταση έξω
  const cmdRef = useRef(command);
  useEffect(() => { cmdRef.current = command; }, [command]);
  const liveRef = useRef(onLive);
  useEffect(() => { liveRef.current = onLive; }, [onLive]);
  useEffect(() => {
    const es = new EventSource(`/api/skets/events?role=stage&k=${encodeURIComponent(k)}`);
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.kind === "cmd") cmdRef.current(ev.cmd); else if (ev.kind === "live") liveRef.current(ev.live); };
    return () => es.close();
  }, [k]);
  useEffect(() => {
    fetch("/api/skets/cmd", { method: "POST", headers: { "x-skets-key": k, "Content-Type": "application/json" }, body: JSON.stringify({ state: { i, id: beat.id, wait: beat.wait, cue: beat.cue ?? null, say, total: beats.length, stores: snap.stores.map((s) => s.street), storeIdx: store, call: call?.status ?? null, live: !!(live || listening), extras: extras.map((p) => p.id), auto, mic: !!mic, hearing, heard: heard && heard.i === i ? { said: heard.said, route: heard.route } : null, at: 0 } }) }).catch(() => {});
  }, [i, store, call?.status, !!(live || listening), extras.length, auto, !!mic, hearing, heard]); // eslint-disable-line react-hooks/exhaustive-deps

  const cat = scene.cat ? snap.cats.find((c) => c.key === scene.cat)! : null;
  const showMap = scene.mode === "map" || scene.mode === "call" || scene.mode === "done";

  return (
    <div className={`fixed inset-0 overflow-hidden text-white select-none ${css.stage}`}>
      <TopBar rehearsal={rehearsal} place={i > 0} />

      <LayoutGroup>
        <div className="absolute inset-x-0 top-[9vh] bottom-0 flex">
          {/* αριστερά: ο Ερμής και τι λέει */}
          <motion.aside layout transition={spring} className={`relative z-10 flex flex-col items-center justify-center gap-[3vh] px-[2.5vw] ${scene.mode === "idle" ? "w-full" : "w-[27vw]"}`}>
            <Orb onStart={i === 0 && !live && !listening ? () => command({ t: "next" }) : undefined} speaking={live ? liveSp.speaking : speaking} listening={listening || hearing || turnBusy} big={scene.mode === "idle" && !live && !listening} label={listening ? "Ακούω…" : turnBusy ? "Σκέφτομαι…" : hearing ? "Σας ακούω" : null} />
            {scene.mode === "idle" && !live && !listening ? <IdleTitle cue={beat.cue ?? null} onStart={() => command({ t: "next" })} auto={auto} mic={!!mic} micErr={micErr} onArm={armMic} meter={meter} /> : <Caption text={live ? live.text ?? null : listening ? null : say} progress={live ? liveSp.p : progress} />}
          </motion.aside>

          {scene.mode !== "idle" && (
            <main className="relative flex-1 flex flex-col pr-[2.5vw] pb-[3vh] min-w-0">
              <AnimatePresence mode="popLayout">
                {showMap ? (
                  <motion.section key="map" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="relative flex-1 rounded-[1.6rem] overflow-hidden ring-1 ring-white/15 shadow-2xl">
                    <StoreMap snap={snap} selected={store} onSelect={(n) => command({ t: "store", i: n })} />
                    <StoreList snap={snap} selected={store} onSelect={(n) => command({ t: "store", i: n })} dim={scene.mode !== "map"} />
                    <AnimatePresence>{scene.mode === "call" && call && store !== null && <CallPanel key="call" store={snap.stores[store]} call={call} />}</AnimatePresence>
                    <AnimatePresence>{scene.mode === "done" && store !== null && <DoneCard key="done" snap={snap} alts={alts} store={store} extras={extras} />}</AnimatePresence>
                  </motion.section>
                ) : (
                  <motion.section key="shop" className="flex-1 flex flex-col min-h-0" exit={{ opacity: 0, y: -30 }}>
                    <div className="flex-1 min-h-0 flex flex-col justify-center">
                      <AnimatePresence mode="wait">
                        {scene.mode === "cat" && cat && <Candidates key={cat.key} cat={cat} rejected={scene.rejected} gone={gone} picked={scene.picked[cat.key] ?? null} />}
                        {scene.mode === "summary" && <Summary key="sum" snap={snap} alts={alts} />}
                        {scene.mode === "intro" && (
                          <motion.div key="intro" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ delay: 0.4, ...spring }} className="text-center">
                            <HouseIcon className="mx-auto size-[14vh] text-eu-yellow" strokeWidth={1.25} aria-hidden />
                            <div className="mt-[3vh] font-semibold tracking-tight text-[length:var(--fs-66)]">Νέο σπίτι · <span className="text-eu-yellow">Λάρισα</span></div>
                            <div className="mt-[1vh] text-white/65 text-[length:var(--fs-28)]">5 βασικές συσκευές, από το μηδέν</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <House snap={snap} picked={scene.picked} current={scene.mode === "cat" ? scene.cat : null} big={scene.mode === "summary"} extras={extras} />
                  </motion.section>
                )}
              </AnimatePresence>
            </main>
          )}
        </div>
        <AnimatePresence>{(listening || (live && !(live.quiet && !live.products?.length))) && <LivePanel key="live" live={live} listening={listening} extras={extras} presenter={snap.presenter.name} />}</AnimatePresence>
      </LayoutGroup>
      {ops && <Dock step={`${i + 1}/${beats.length} · ${beat.id}`} auto={auto} mic={!!mic} hearing={hearing} meter={meter} onAuto={() => setAuto((x) => !x)} onArm={armMic} idle={i === 0} live={!!(live || listening)} listening={listening} wait={beat.wait} cue={beat.cue ?? null} needStore={beat.wait === "store" && store === null} command={command} onTalkDown={pttDown} onTalkUp={pttUp} />}
    </div>
  );
}

/** ΠΡΟΒΑ: μόνο με ?prova=1 / ?dry=1 (στην παράσταση δεν φαίνεται)· η Λάρισα μόλις ξεκινήσει η ιστορία. */
function TopBar({ rehearsal, place }: { rehearsal: boolean; place: boolean }) {
  return (
    <header className="absolute top-0 inset-x-0 h-[9vh] flex items-center justify-between px-[2.5vw] z-20">
      <div className="flex items-center gap-3">
        <span className="font-black tracking-tight text-[length:var(--fs-32)]">euronics</span>
        <span className="h-7 w-px bg-white/25" />
        <span className="font-bold text-eu-yellow text-[length:var(--fs-24)]">Ερμής</span>
      </div>
      <div className="flex items-center gap-3">
        {rehearsal && <span className="rounded-full bg-eu-red px-3 py-1 font-semibold text-[length:var(--fs-14)]">Πρόβα</span>}
        {place && <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 font-medium text-[length:var(--fs-18)]"><MapPin className="size-[1.1em] text-eu-yellow" strokeWidth={2} aria-hidden />Λάρισα</span>}
      </div>
    </header>
  );
}

/**
 * Αρχική οθόνη. Αυτόματο: ο χειριστής πατά «Ενεργοποίηση μικροφώνου» πριν μπει ο κόσμος· μετά μένει μόνο ο Ερμής, και η
 * σκηνή ξεκινά μόλις ο παρουσιαστής πει την πρώτη του ατάκα. Χειροκίνητο: «Ξεκίνα» (ή Space, ή το τηλεχειριστήριο).
 */
function IdleTitle({ cue, onStart, auto, mic, micErr, onArm, meter }: { cue: string | null; onStart: () => void; auto: boolean; mic: boolean; micErr: boolean; onArm: () => void; meter: React.RefObject<HTMLSpanElement | null> }) {
  const big = "mt-[4vh] min-h-16 flex items-center gap-3 rounded-full bg-eu-yellow px-10 font-semibold text-eu-navy text-[length:var(--fs-28)] hover:bg-white active:scale-[0.98] transition-[background-color,transform] duration-150";
  // οι οδηγίες είναι για τον χειριστή: σβήνουν όταν σταματήσει το ποντίκι, ώστε το κοινό να μη διαβάσει την ατάκα πριν ειπωθεί
  const { shown } = useWake();
  const hint = `transition-opacity duration-500 ${shown ? "opacity-100" : "opacity-0"}`;
  const blur = (f: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); f(); };
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }} className="text-center flex flex-col items-center">
      <h1 className="font-semibold tracking-tight text-[length:var(--fs-96)] leading-none">Ερμής</h1>
      <p className="mt-4 text-white/70 text-[length:var(--fs-30)]">Ο ψηφιακός σύμβουλος της Euronics</p>
      {auto && mic ? (
        <>
          {/* στάθμη μικροφώνου: γεμίζει όταν μιλά κάποιος, πράσινη όταν το μετρά για ατάκα */}
          <span className={`mt-[4vh] relative block h-2 w-48 overflow-hidden rounded-full bg-white/10 ${hint}`}><span ref={meter} className="absolute inset-y-0 left-0 w-0 rounded-full bg-white/70 transition-[width] duration-75" /></span>
          <p className={`mt-3 flex items-center gap-2 text-white/45 text-[length:var(--fs-15)] ${hint}`}><MicIcon className="size-4" strokeWidth={1.5} aria-hidden />Ακούω· ξεκινάμε μόλις ακουστεί {cue ?? "ο παρουσιαστής"}</p>
        </>
      ) : auto ? (
        <>
          <button type="button" onClick={blur(onArm)} className={big}><MicIcon className="size-[1em]" strokeWidth={2} aria-hidden />Ενεργοποίηση μικροφώνου</button>
          {micErr && <p className="mt-3 font-medium text-eu-red text-[length:var(--fs-16)]">Το μικρόφωνο δεν άνοιξε. Επίτρεψέ το στον browser (εικονίδιο στη γραμμή διεύθυνσης) και ξαναπάτα</p>}
          <button type="button" onClick={blur(onStart)} className="mt-3 text-white/55 underline underline-offset-4 hover:text-white transition-colors text-[length:var(--fs-15)]">ή ξεκίνα χειροκίνητα (Space)</button>
        </>
      ) : (
        <>
          <button type="button" onClick={blur(onStart)} className={`${big} ${hint}`}><Play className="size-[0.9em] fill-current" strokeWidth={0} aria-hidden />Ξεκίνα</button>
          {cue && <p className={`mt-3 max-w-[60vw] text-white/45 text-[length:var(--fs-15)] ${hint}`}>Πάτα το όταν ο παρουσιαστής πει {cue} · ή Space</p>}
        </>
      )}
    </motion.div>
  );
}

function Orb({ speaking, listening, big, onStart, label }: { speaking: boolean; listening: boolean; big: boolean; onStart?: () => void; label?: string | null }) {
  return (
    <motion.div layout transition={spring} onClick={onStart} title={onStart ? "Ξεκίνα" : undefined} className={`relative shrink-0 ${big ? "size-[34vh]" : "size-[22vh]"} ${onStart ? "cursor-pointer" : ""}`}>
      {speaking && <><span className={css.ring} /><span className={`${css.ring} ${css.ring2}`} /><span className={`${css.ring} ${css.ring3}`} /></>}
      <motion.div
        className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_40%_35%,#f7d23a_0%,#f1c400_55%,#d9b000_100%)]"
        animate={speaking ? { scale: [1, 1.07, 0.98, 1.05, 1] } : listening ? { scale: [1, 1.025, 1] } : { scale: 1 }}
        transition={speaking ? { duration: 0.9, repeat: Infinity } : { duration: 2.4, repeat: Infinity }}
      />
      <AnimatePresence>
        {label && !big && <motion.span key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -top-[5vh] inset-x-0 text-center text-white/70 text-[length:var(--fs-18)] whitespace-nowrap">{label}</motion.span>}
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
    <div className="min-h-[20vh] w-full rounded-[1.4rem] bg-white/[0.06] ring-1 ring-white/10 px-[1.4vw] py-[2vh]">
      <p className="font-medium leading-snug text-[length:var(--fs-26)]">
        {words.map((w, n) => <motion.span key={`${text}-${n}`} initial={false} animate={{ opacity: n < shown ? 1 : 0.18 }} transition={{ duration: 0.2 }}>{w} </motion.span>)}
      </p>
    </div>
  );
}

function Candidates({ cat, rejected, gone, picked }: { cat: SkCategory; rejected: Record<string, string>; gone: Set<string>; picked: string | null }) {
  const visible = cat.candidates.filter((p) => !gone.has(p.id));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }} className="flex flex-col gap-[2.5vh]">
      <motion.h2 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="font-semibold tracking-tight text-[length:var(--fs-50)]">{cat.label}</motion.h2>
      <motion.div layout className="flex items-stretch gap-[1.4vw] justify-start">
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
      className={`relative w-[15vw] min-w-[13rem] flex flex-col rounded-[1.4rem] bg-white text-eu-ink overflow-hidden shadow-[0_12px_32px_rgb(0_0_0/0.25)] ${chosen ? "ring-[6px] ring-eu-yellow" : ""}`}
    >
      {/* το κουτί της φωτογραφίας έχει σταθερό ύψος: η εικόνα δεν το τεντώνει, ώστε όλες οι κάρτες να είναι ίδιες */}
      <motion.div layoutId={`img-${p.id}`} className="relative aspect-square shrink-0 bg-eu-surface">
        <img src={p.image} alt="" className="absolute inset-0 m-auto max-h-[88%] max-w-[88%] object-contain mix-blend-multiply" />
      </motion.div>
      <div className="flex-1 p-[1.2vh_1vw_1.6vh] flex flex-col gap-[0.8vh]">
        <span className="font-semibold text-eu-blue text-[length:var(--fs-16)]">{p.brand}</span>
        <span className="line-clamp-2 font-medium leading-tight text-eu-ink/80 text-[length:var(--fs-15)] min-h-[2.5em]">{titleOf(p)}</span>
        <div className="flex flex-wrap gap-1.5">
          {p.chips.filter((c) => !c.endsWith("€")).map((c) => <span key={c} className="rounded-full bg-eu-chip px-2.5 py-0.5 font-medium text-[length:var(--fs-14)]">{c}</span>)}
        </div>
        <span className="mt-auto font-semibold tabular-nums text-[length:var(--fs-28)]">{eur(p.price)}</span>
      </div>
      <AnimatePresence>
        {reason && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-eu-red/80 flex flex-col items-center justify-center gap-[2vh] p-[1vw] text-white text-center">
            <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 400, damping: 24 }} className="grid place-items-center size-[10vh] rounded-full ring-4 ring-white"><X className="size-[60%]" strokeWidth={3} aria-hidden /></motion.span>
            <span className="font-semibold leading-tight text-[length:var(--fs-20)]">{reason}</span>
          </motion.div>
        )}
        {chosen && (
          <motion.span initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-3 inset-x-3 flex items-center justify-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-semibold py-1.5 text-[length:var(--fs-16)]"><Check className="size-[1.1em]" strokeWidth={2.5} aria-hidden />Η επιλογή του Ερμή</motion.span>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Το σπίτι: τρία δωμάτια, κάθε επιλεγμένη συσκευή «πετά» στη θέση της (κοινό layoutId με την κάρτα). */
function House({ snap, picked, current, big, extras }: { snap: Snapshot; picked: Partial<Record<CatKey, string>>; current: CatKey | null; big: boolean; extras: LiveProduct[] }) {
  // στο σύνολο μετρά ό,τι έχει ήδη μπει στο σπίτι (όχι η κάρτα που ακόμη αναβοσβήνει στη μέση), και ό,τι πρόσθεσε το κοινό
  const total = Object.entries(picked).reduce((t, [c, id]) => t + (c === current ? 0 : snap.cats.find((x) => x.key === c)!.candidates.find((p) => p.id === id)?.price ?? 0), 0) + extras.reduce((t, p) => t + p.price, 0);
  return (
    <motion.div layout transition={spring} className={`mt-[2vh] rounded-[1.6rem] bg-white/[0.06] ring-1 ring-white/15 flex items-stretch gap-[1vw] ${big ? "p-[2vh_1.4vw]" : "p-[1.4vh_1vw]"}`}>
      {/* με τη σειρά του διαλόγου (όχι ανά δωμάτιο), ώστε η μπάρα να γεμίζει από αριστερά προς τα δεξιά */}
      {snap.cats.map((cat) => {
        const c = cat.key, id = picked[c];
        const p = id && current !== c ? cat.candidates.find((x) => x.id === id) : null;
        return (
          <div key={c} className="min-w-0 flex-1">
            <div className="font-medium text-white/60 mb-[0.8vh] text-[length:var(--fs-14)] truncate">{ROOMS.find((r) => r.cats.includes(c))?.label}</div>
            <div className={`min-w-0 overflow-hidden rounded-[1rem] flex items-center gap-[0.5vw] ${big ? "h-[17vh]" : "h-[11vh]"} ${p ? "bg-white text-eu-ink p-[0.8vh]" : `border-2 border-dashed ${current === c ? "border-eu-yellow bg-eu-yellow/10" : "border-white/25"} justify-center`}`}>
              {p ? (
                <>
                  <motion.div layoutId={`img-${p.id}`} transition={{ type: "spring", stiffness: 120, damping: 20 }} className="h-full max-w-[45%] aspect-square shrink-0 grid place-items-center bg-eu-surface rounded-[0.7rem] p-1">
                    <img src={p.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                  </motion.div>
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="min-w-0 flex-1">
                    <div className="font-semibold text-eu-blue text-[length:var(--fs-14)] truncate">{p.brand}</div>
                    <div className="font-medium text-eu-ink/75 text-[length:var(--fs-14)] truncate">{p.key}</div>
                    <div className="font-semibold tabular-nums text-[length:var(--fs-17)] truncate">{eur(p.price)}</div>
                  </motion.div>
                </>
              ) : (
                <span className={`font-medium text-center px-2 text-[length:var(--fs-14)] ${current === c ? "text-eu-yellow" : "text-white/45"}`}>{cat.label}</span>
              )}
            </div>
          </div>
        );
      })}
      {extras.length > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="min-w-0 flex-1">
          <div className="font-medium text-eu-yellow mb-[0.8vh] text-[length:var(--fs-14)]">Από το κοινό</div>
          <div className={`flex gap-[0.4vw] ${big ? "h-[17vh]" : "h-[11vh]"}`}>
            {extras.map((p) => (
              <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="h-full aspect-square shrink-0 grid place-items-center bg-white rounded-[0.7rem] p-1">
                {p.image ? <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply" /> : <span className="font-semibold text-eu-blue text-[length:var(--fs-14)]">{p.brand}</span>}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
      <div className="w-[9vw] shrink-0 flex flex-col justify-end items-end">
        <span className="text-white/60 font-medium text-[length:var(--fs-14)]">Σύνολο</span>
        <motion.span key={total} initial={{ color: "#f1c400" }} animate={{ color: "#ffffff" }} transition={{ duration: 1.2 }} className="font-semibold tabular-nums text-[length:var(--fs-36)]">{eur(total)}</motion.span>
      </div>
    </motion.div>
  );
}

function Summary({ snap, alts }: { snap: Snapshot; alts: Alts }) {
  const inst = instalmentsOf(snap, alts);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring} className="text-center">
      <div className="text-eu-yellow font-semibold tracking-tight text-[length:var(--fs-80)] leading-none">Το σπίτι είναι έτοιμο</div>
      <div className="mt-[2vh] text-white/80 tabular-nums text-[length:var(--fs-30)]">5 συσκευές · {eur(totalOf(snap, alts))}{inst ? ` · ${inst.months} άτοκες δόσεις των ${inst.amount.toLocaleString("el-GR")} €` : ""}</div>
    </motion.div>
  );
}

function StoreList({ snap, selected, onSelect, dim }: { snap: Snapshot; selected: number | null; onSelect: (i: number) => void; dim: boolean }) {
  return (
    <motion.ul initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: dim ? 0 : 1 }} transition={{ delay: dim ? 0 : 4.2, ...spring }} className="absolute right-[1.2vw] top-[2vh] z-[500] w-[24vw] flex flex-col gap-[1.2vh]">
      {snap.stores.map((s, n) => (
        <motion.li key={s.id} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 4.3 + n * 0.15 }}>
          <button type="button" onClick={() => onSelect(n)} className={`w-full text-left rounded-[1.1rem] p-[1.4vh_1vw] flex items-center gap-[0.8vw] shadow-[0_8px_24px_rgb(0_0_0/0.25)] transition-colors ${selected === n ? "bg-eu-yellow text-eu-navy" : "bg-white text-eu-ink"}`}>
            <span className={`size-[5vh] shrink-0 rounded-full grid place-items-center font-semibold tabular-nums text-[length:var(--fs-20)] ${selected === n ? "bg-eu-navy text-eu-yellow" : "bg-eu-navy text-white"}`}>{n + 1}</span>
            <span className="min-w-0">
              <span className="block font-semibold text-[length:var(--fs-18)] truncate">Euronics {s.street}</span>
              <span className="block opacity-75 tabular-nums text-[length:var(--fs-15)]">{s.address} · {s.km.toLocaleString("el-GR")} km</span>
            </span>
          </button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

/**
 * Ο ήχος της κλήσης στα ηχεία της αίθουσας, από το monitor.listenUrl του Vapi: PCM 16 bit, 16 kHz, δύο κανάλια
 * (το ένα ο Ερμής, το άλλο το κινητό). ?audio=hermes (προεπιλογή) παίζει μόνο τον Ερμή — ο θεατής-κατάστημα ακούγεται
 * ήδη στην αίθουσα και έτσι το κινητό δεν ξαναπιάνει τη φωνή του από τα ηχεία· ?audio=both και τα δύο, ?audio=off τίποτα.
 * ?hermes=L|R ορίζει σε ποιο κανάλι είναι ο Ερμής (προεπιλογή R — μετρημένο σε πρόβα 2026-11-01).
 */
function listen(url: string): () => void {
  const q = new URLSearchParams(location.search);
  const mode = q.get("audio") ?? "hermes";
  if (mode === "off") return () => {};
  const right = (q.get("hermes") ?? "R").toUpperCase() !== "L";
  const ctx = new AudioContext({ sampleRate: 16000 });
  ctx.resume().catch(() => {});
  let at = 0, closed = false, tries = 0, ws: WebSocket;
  // για την πρόβα: πόση ενέργεια έχει κάθε κανάλι (στην κονσόλα: __sketsAudio) — δείχνει σε ποιο είναι ο Ερμής
  const lv = ((window as unknown as { __sketsAudio?: { frames: number; L: number; R: number } }).__sketsAudio = { frames: 0, L: 0, R: 0 });
  const onAudio = (m: MessageEvent) => {
    if (typeof m.data === "string") return;
    const pcm = new Int16Array(m.data as ArrayBuffer), n = pcm.length >> 1;
    if (!n) return;
    const buf = ctx.createBuffer(1, n, 16000), out = buf.getChannelData(0);
    for (let j = 0; j < n; j++) {
      const l = pcm[2 * j] / 32768, r = pcm[2 * j + 1] / 32768;
      out[j] = mode === "both" ? Math.max(-1, Math.min(1, l + r)) : right ? r : l;
      lv.L += Math.abs(l); lv.R += Math.abs(r);
    }
    lv.frames++;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    // μικρό buffer 120 ms για ομαλή ροή· αν μείνουμε πίσω, ξαναπιάνουμε το «τώρα»
    at = Math.max(at, ctx.currentTime + 0.12);
    src.start(at);
    at += buf.duration;
  };
  const open = () => {
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onmessage = onAudio;
    // ξαναδοκιμάζει λίγες φορές αν κοπεί ενώ η κλήση τρέχει
    ws.onclose = () => { if (!closed && tries++ < 5) setTimeout(open, 1500); else if (!closed) console.warn("skets: ο ήχος της κλήσης δεν συνδέθηκε"); };
  };
  open();
  return () => { closed = true; ws.close(); ctx.close().catch(() => {}); };
}

function CallPanel({ store, call }: { store: Snapshot["stores"][number]; call: CallView }) {
  const label = { dialing: "Καλώ…", talking: "Σε κλήση", ended: "Η κλήση έκλεισε · καταγράφεται…", done: "Η κλήση ολοκληρώθηκε", error: "Η κλήση δεν έγινε" }[call.status];
  return (
    <motion.div initial={{ x: "110%" }} animate={{ x: 0 }} exit={{ x: "110%" }} transition={spring} className="absolute right-[1.2vw] top-[2vh] bottom-[2vh] z-[600] w-[34vw] rounded-[1.4rem] bg-eu-navy ring-1 ring-white/10 shadow-[0_16px_48px_rgb(0_0_0/0.35)] flex flex-col overflow-hidden">
      <div className="p-[2vh_1.4vw] flex items-center gap-[1vw] border-b border-white/10">
        <div className="relative size-[8vh] shrink-0 rounded-full bg-eu-yellow text-eu-navy grid place-items-center">
          {(call.status === "dialing" || call.status === "talking") && <><span className={css.ring} /><span className={`${css.ring} ${css.ring2}`} /></>}
          <Phone className="size-[45%]" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[length:var(--fs-22)] truncate">Euronics {store.street}</div>
          <div className="text-white/70 text-[length:var(--fs-16)]">{label}</div>
        </div>
        {call.status === "talking" && <div className="ml-auto flex items-center gap-1 h-[2.6rem]">{[0, 1, 2, 3, 4].map((n) => <span key={n} className={`${css.bar} ${css[`b${n + 1}`]}`} />)}</div>}
      </div>
      <div className="flex-1 overflow-hidden p-[1.6vh_1.2vw] flex flex-col justify-end gap-[1.2vh]">
        {call.error && <p className="text-eu-yellow font-semibold text-[length:var(--fs-18)]">{call.error}</p>}
        <AnimatePresence initial={false}>
          {call.transcript.slice(-6).map((t, n) => (
            <motion.div key={`${call.transcript.length - 6 + n}-${t.text.slice(0, 12)}`} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[88%] rounded-[1rem] px-[1vw] py-[1vh] font-medium leading-snug text-[length:var(--fs-18)] ${t.who === "hermes" ? "self-start bg-eu-yellow text-eu-navy" : "self-end bg-white text-eu-ink"}`}>
              <span className="block font-semibold opacity-60 text-[length:var(--fs-13)]">{t.who === "hermes" ? "Ερμής" : "Κατάστημα"}</span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function DoneCard({ snap, alts, store, extras }: { snap: Snapshot; alts: Alts; store: number; extras: LiveProduct[] }) {
  const s = snap.stores[store];
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={spring} className="absolute inset-0 z-[700] grid place-items-center bg-eu-navy/60">
      <div className="w-[52vw] rounded-[1.8rem] bg-white text-eu-ink p-[4vh_3vw] shadow-2xl text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.2 }} className="mx-auto size-[12vh] rounded-full bg-eu-green text-white grid place-items-center"><Check className="size-[55%]" strokeWidth={2.5} aria-hidden /></motion.div>
        <h3 className="mt-[2vh] font-semibold tracking-tight text-[length:var(--fs-44)]">Σας περιμένουν σήμερα</h3>
        <p className="mt-[1vh] text-eu-muted text-[length:var(--fs-24)]">Euronics {s.street} · {s.address}, {s.city}</p>
        <div className="mt-[3vh] flex justify-center gap-[1vw]">
          {snap.cats.map((c, n) => { const p = pickOf(c, alts); return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + n * 0.12 }} className="size-[11vh] rounded-[1rem] bg-eu-surface grid place-items-center p-2">
              <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply" />
            </motion.div>
          ); })}
          {extras.map((p, n) => p.image && (
            <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + (snap.cats.length + n) * 0.12 }} className="size-[11vh] rounded-[1rem] bg-eu-surface ring-4 ring-eu-yellow grid place-items-center p-2">
              <img src={p.image} alt={p.title} className="max-h-full max-w-full object-contain mix-blend-multiply" />
            </motion.div>
          ))}
        </div>
        <p className="mt-[2.4vh] font-medium text-[length:var(--fs-30)]">Καλή αρχή στη Λάρισα, {snap.presenter.vocative}</p>
      </div>
    </motion.div>
  );
}

/**
 * Η ζωντανή ερώτηση του κοινού πάνω από τη σκηνή: η ερώτηση όπως ακούστηκε, «ψάχνω στον κατάλογο», και τα προϊόντα που
 * πρότεινε ο Ερμής του eshop (πραγματικά, από τη βάση). Ό,τι μπει στο σπίτι από το τηλεχειριστήριο σημαδεύεται.
 */
function LivePanel({ live, listening, extras, presenter }: { live: LiveEv | null; listening: boolean; extras: LiveProduct[]; presenter: string }) {
  const q = listening ? null : live?.q && live.q !== "…" ? live.q : null;
  const searching = !listening && (!live || live.phase === "thinking");
  return (
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} transition={spring} className="absolute right-[2.5vw] top-[11vh] bottom-[4vh] w-[64vw] z-[800] rounded-[1.8rem] bg-[#0b1d42] ring-1 ring-white/10 shadow-[0_16px_48px_rgb(0_0_0/0.35)] p-[3vh_2.4vw] flex flex-col gap-[3vh]">
      <div>
        <div className="font-medium text-eu-yellow text-[length:var(--fs-16)]">{live?.quiet ? presenter : "Ερώτηση από το κοινό"}</div>
        <AnimatePresence mode="wait">
          <motion.p key={q ?? (listening ? "listen" : "wait")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-[1vh] font-semibold tracking-tight leading-tight text-[length:var(--fs-44)]">
            {listening ? <span className="text-white/60">Ακούω…</span> : q ? `«${q}»` : <span className="text-white/60">…</span>}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="flex-1 min-h-0 flex items-center">
        {live?.phase === "error" ? (
          <p className="font-medium text-eu-yellow text-[length:var(--fs-28)]">{live.error}</p>
        ) : searching ? (
          <div className="flex items-center gap-[1vw] text-white/70 text-[length:var(--fs-28)]">
            {!listening && <div className="flex items-center gap-1 h-[2.6rem]">{[0, 1, 2, 3, 4].map((n) => <span key={n} className={`${css.bar} ${css[`b${n + 1}`]}`} />)}</div>}
            {listening ? "" : "Ψάχνω στον κατάλογο της Euronics…"}
          </div>
        ) : (
          <div className="flex gap-[1.4vw]">
            <AnimatePresence>
              {(live?.products ?? []).map((p, n) => {
                const added = extras.some((x) => x.id === p.id);
                return (
                  <motion.article key={p.id} initial={{ opacity: 0, y: 60, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: added ? 1.05 : 1 }} transition={{ ...spring, delay: n * 0.18 }} className={`relative w-[17vw] flex flex-col rounded-[1.4rem] bg-white text-eu-ink overflow-hidden ${added ? "ring-[6px] ring-eu-yellow" : ""}`}>
                    <div className="relative aspect-[4/3] shrink-0 bg-eu-surface">
                      {p.image && <img src={p.image} alt="" className="absolute inset-0 m-auto max-h-[88%] max-w-[88%] object-contain mix-blend-multiply" />}
                    </div>
                    <div className="flex-1 p-[1.2vh_1vw_1.6vh] flex flex-col gap-[0.6vh]">
                      <span className="font-semibold text-eu-blue text-[length:var(--fs-16)]">{p.brand}</span>
                      <span className="line-clamp-2 font-medium leading-tight text-eu-ink/80 text-[length:var(--fs-15)] min-h-[2.5em]">{titleOf(p)}</span>
                      {p.why && <span className="line-clamp-2 text-eu-muted leading-tight text-[length:var(--fs-14)]">{p.why}</span>}
                      <span className="mt-auto font-semibold tabular-nums text-[length:var(--fs-28)]">{eur(p.price)}</span>
                    </div>
                    {added && <span className="absolute top-3 inset-x-3 flex items-center justify-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-semibold py-1.5 text-[length:var(--fs-16)]"><Check className="size-[1.1em]" strokeWidth={2.5} aria-hidden />Στο σπίτι</span>}
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export type { Beat };

/**
 * Μπάρα χειρισμού στο κάτω μέρος της σκηνής (για όποιον οδηγεί από το laptop): στην αρχή ένα μεγάλο «Ξεκίνα», μετά
 * Πίσω / Επόμενο / ερώτηση κοινού / πλήρης οθόνη. Κρύβεται όταν το ποντίκι μείνει ακίνητο, για να μη φαίνεται στο κοινό.
 */
function Dock({ step, auto, mic, hearing, meter, onAuto, onArm, idle, live, listening, wait, cue, needStore, command, onTalkDown, onTalkUp }: {
  step: string; auto: boolean; mic: boolean; hearing: boolean; meter: React.RefObject<HTMLSpanElement | null>; onAuto: () => void; onArm: () => void;
  idle: boolean; live: boolean; listening: boolean; wait: Beat["wait"]; cue: string | null; needStore: boolean;
  command: (c: Cmd) => void; onTalkDown: () => void; onTalkUp: () => void;
}) {
  const { shown, setShown, holdRef } = useWake();
  // το κουμπί δεν κρατά το focus, αλλιώς το Space θα το ξαναπατούσε πέρα από το «Επόμενο» του πληκτρολογίου
  const tap = (c: Cmd) => (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.blur(); command(c); };
  const base = "min-h-14 rounded-2xl px-5 flex items-center justify-center gap-2 font-medium whitespace-nowrap text-[length:var(--fs-20)] active:scale-[0.98] transition-[background-color,transform] duration-150";
  const btn = `${base} bg-white/10 hover:bg-white/20`;
  const main = `${base} bg-eu-yellow text-eu-navy font-semibold hover:bg-white`;
  const ic = "size-[1.1em] shrink-0";

  if (idle && !live) return null;
  const inCall = wait === "call";
  return (
    <div onMouseEnter={() => { holdRef.current = true; setShown(true); }} data-hearing={hearing || undefined} onMouseLeave={() => { holdRef.current = false; }} className={`absolute bottom-[2.5vh] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-3xl bg-[#0b1d42] ring-1 ring-white/10 p-2 shadow-[0_12px_32px_rgb(0_0_0/0.35)] transition-opacity duration-500 ${shown || listening ? "opacity-100" : "opacity-0"}`}>
      <button type="button" onClick={tap({ t: "back" })} className={btn} title="Πίσω (←)" aria-label="Πίσω"><ChevronLeft className={ic} strokeWidth={2} aria-hidden /></button>
      {live ? (
        <button type="button" onClick={tap({ t: "liveClose" })} className={main} title="Esc"><CornerUpLeft className={ic} strokeWidth={2} aria-hidden />Πίσω στο σενάριο</button>
      ) : inCall ? (
        <button type="button" onClick={tap({ t: "skipCall" })} className={btn} title="C">Τέλος κλήσης<ChevronRight className={ic} strokeWidth={2} aria-hidden /></button>
      ) : (
        <button type="button" disabled={needStore} onClick={tap({ t: "next" })} className={`${main} min-w-[14rem] disabled:opacity-40`} title="Space / →">
          {needStore ? "Διάλεξε κατάστημα" : <>Επόμενο<ChevronRight className={ic} strokeWidth={2} aria-hidden /></>}
        </button>
      )}
      {!inCall && (
        <button type="button" onPointerDown={(e) => { e.preventDefault(); onTalkDown(); }} onPointerUp={onTalkUp} onPointerLeave={() => { if (listening) onTalkUp(); }} onContextMenu={(e) => e.preventDefault()} className={`${listening ? `${base} bg-eu-red` : btn} touch-none`} title="ή κράτα πατημένο το M">
          {listening ? "Ακούω· άφησε για αποστολή" : <><MicIcon className={ic} strokeWidth={1.75} aria-hidden />Ερώτηση</>}
        </button>
      )}
      <button type="button" onClick={(e) => { e.currentTarget.blur(); if (auto && !mic) onArm(); else onAuto(); }} className={btn} title="Αυτόματη συνέχεια: ο Ερμής απαντά μόλις σωπάσει ο παρουσιαστής (A)">
        <span className={`size-3 rounded-full ${auto && mic ? (hearing ? "bg-eu-green animate-pulse" : "bg-eu-green") : "bg-white/30"}`} />
        {auto ? (mic ? (hearing ? "Ακούω" : "Αυτόματο") : "Μικρόφωνο") : "Χειροκίνητο"}
        {auto && mic && <span className="relative h-2 w-16 overflow-hidden rounded-full bg-white/15"><span ref={meter} className="absolute inset-y-0 left-0 w-0 rounded-full bg-white/70 transition-[width] duration-75" /></span>}
      </button>
      <button type="button" onClick={(e) => { e.currentTarget.blur(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }} className={btn} title="Πλήρης οθόνη (F)" aria-label="Πλήρης οθόνη"><Maximize className={ic} strokeWidth={1.75} aria-hidden /></button>
      <span className="max-w-[24rem] px-3 flex flex-col text-white/60 text-[length:var(--fs-14)] leading-tight">
        {cue && !live && <span>Περιμένει: <span className="font-medium text-white/90">{cue}</span></span>}
        <span className="text-white/40 tabular-nums text-[length:var(--fs-13)]">{step}</span>
      </span>
    </div>
  );
}
