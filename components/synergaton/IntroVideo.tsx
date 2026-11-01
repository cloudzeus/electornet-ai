"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { btn, focusRing } from "@/components/synergaton/ui";
import { InterestButton } from "@/components/synergaton/InterestModal";

export type IntroSources = { mp4: string; webm: string; poster: string };

/**
 * Εισαγωγικό video της πύλης σε όλη την οθόνη: 16:9 σε οριζόντια οθόνη, 9:16 σε κάθετη (κινητό).
 * Ξεκινά μόνο του σε σίγαση (οι browsers δεν επιτρέπουν αυτόματο ήχο)· το κουμπί ηχείου ανοίγει τη μουσική. Στο τέλος το κουμπί «Είσοδος» μπαίνει ακριβώς πάνω στο ζωγραφισμένο του τελικού καρέ.
 * «Παράλειψη» πάντα διαθέσιμη. Με «λιγότερη κίνηση» δεν ξεκινά μόνο του.
 * Οθόνες από 1024px (υπολογιστής, προβολικό) παίρνουν την έκδοση 1080p υψηλής ποιότητας· τα κινητά την ελαφριά 720p.
 * Πλήρης οθόνη για προβολή και λήψη του 4K για παρουσίαση εκτός σύνδεσης.
 */
export function IntroVideo({ landscape, portrait, hq, download, href }: { landscape: IntroSources; portrait: IntroSources; hq?: { landscape: IntroSources; portrait: IntroSources }; download?: string; href: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [big, setBig] = useState(false);
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const [tall, setTall] = useState<boolean | null>(null);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const on = () => { setTall(mq.matches); setBig(window.innerWidth >= 1024); };
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || tall === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.play().catch(() => setPlaying(false));
  }, [tall]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void box.current?.requestFullscreen?.().catch(() => {}); };

  const src = big && hq ? (tall ? hq.portrait : hq.landscape) : tall ? portrait : landscape;
  // θέση του ζωγραφισμένου κουμπιού στο τελικό καρέ (κέντρο, % του ύψους)
  const ctaTop = tall ? "66.2%" : "73.2%";
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (ended) { v.currentTime = 0; setEnded(false); }
    if (v.paused) v.play(); else v.pause();
  };
  const sound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
    if (v.paused && !ended) v.play();
  };

  return (
    <div ref={box} className="fixed inset-0 bg-eu-navy grid place-items-center overflow-hidden">
      <div className="relative" style={{ width: tall ? "min(100vw, calc(100dvh * 9 / 16))" : "min(100vw, calc(100dvh * 16 / 9))", aspectRatio: tall ? "9 / 16" : "16 / 9" }}>
        {tall !== null && (
          <video key={src.mp4} ref={ref} className="absolute inset-0 size-full object-cover" muted={muted} playsInline preload="auto" poster={src.poster}
            onPlay={() => { setPlaying(true); setEnded(false); }} onPause={() => setPlaying(false)} onEnded={() => { setEnded(true); setPlaying(false); }}
            aria-label="Παρουσίαση της πύλης συνεργατών Euronics (45 δευτερόλεπτα, με μουσική)">
            <source src={src.webm} type="video/webm" />
            <source src={src.mp4} type="video/mp4" />
          </video>
        )}
        {ended && (
          <Link href={href} className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold min-h-11 px-[5%] py-[1.6%] text-[length:clamp(1.05rem,2.4vmin,1.6rem)] shadow-xl hover:bg-white transition-colors ${focusRing}`}
            style={{ top: ctaTop }} autoFocus>
            Είσοδος <ArrowRight className="size-[1.1em]" aria-hidden />
          </Link>
        )}
        {ended && (
          <div className="absolute left-1/2 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none" style={{ top: tall ? "74%" : "84%" }}>
            <InterestButton className={`${btn("secondary")} bg-white/95 backdrop-blur whitespace-nowrap`} />
          </div>
        )}
      </div>

      <div className="fixed top-3 right-3 sm:top-5 sm:right-5 flex items-center gap-2">
        <button type="button" onClick={sound} className={`inline-flex items-center justify-center gap-2 min-h-11 min-w-11 rounded-full px-3 backdrop-blur font-bold text-[length:var(--fs-14)] ${muted ? "bg-eu-yellow text-eu-navy hover:bg-white" : "bg-white/15 text-white hover:bg-white/25"} ${focusRing}`}
          aria-label={muted ? "Άνοιγμα ήχου" : "Σίγαση"} aria-pressed={!muted}>
          {muted ? <><VolumeX className="size-5" aria-hidden /><span className="hidden sm:inline">Ήχος</span></> : <Volume2 className="size-5" aria-hidden />}
        </button>
        <button type="button" onClick={toggle} className={`inline-flex items-center justify-center size-11 rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 ${focusRing}`}
          aria-label={ended ? "Ξανά από την αρχή" : playing ? "Παύση" : "Αναπαραγωγή"}>
          {ended ? <RotateCcw className="size-5" aria-hidden /> : playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
        </button>
        {big && (
          <button type="button" onClick={fullscreen} className={`inline-flex items-center justify-center size-11 rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 ${focusRing}`} aria-label={full ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"} title={full ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη (για προβολή)"}>
            {full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
          </button>
        )}
        {big && download && !full && (
          <a href={download} download target="_blank" rel="noopener" className={`inline-flex items-center gap-1.5 min-h-11 rounded-full bg-white/15 text-white font-bold px-4 backdrop-blur hover:bg-white/25 text-[length:var(--fs-14)] ${focusRing}`} title="Λήψη σε 4K για προβολή χωρίς σύνδεση">
            <Download className="size-4" aria-hidden /> 4K
          </a>
        )}
        {!ended && (
          <Link href={href} className={`inline-flex items-center gap-1.5 min-h-11 rounded-full bg-white/15 text-white font-bold px-4 backdrop-blur hover:bg-white/25 text-[length:var(--fs-14)] ${focusRing}`}>
            Παράλειψη <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
