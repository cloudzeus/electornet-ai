"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const STEP_MS = 4500;

/**
 * Slider προϊόντων ενός banner: ένα τετράγωνο τη φορά, που αλλάζει μόνο του κάθε 4,5″. Το νέο προϊόν μπαίνει από τη μεριά που
 * πάει ο πελάτης (δεξιά στο «επόμενο», αριστερά στο «προηγούμενο») ενώ το παλιό σβήνει — μόνο transform/opacity.
 * Σταματά όσο ο πελάτης έχει το ποντίκι ή την εστίαση πάνω του, όταν δεν φαίνεται στην οθόνη, και όταν πατήσει «Παύση».
 * Με «λιγότερη κίνηση» στη συσκευή δεν αλλάζει μόνο του και δεν γλιστρά: μόνο βέλη και τελείες.
 */
export function TileSlider({ children, label }: { children: ReactNode; label: string }) {
  const tiles = Children.toArray(children);
  const n = tiles.length;
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [seen, setSeen] = useState(false);
  const [calm, setCalm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const go = useCallback((to: number, d: 1 | -1) => { setDir(d); setI(((to % n) + n) % n); }, [n]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const t = setTimeout(() => setCalm(m.matches), 0);
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.4 });
    if (root.current) io.observe(root.current);
    return () => { clearTimeout(t); io.disconnect(); };
  }, []);
  const running = n > 1 && !paused && !hold && seen && !calm;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(i + 1, 1), STEP_MS);
    return () => clearTimeout(t);
  }, [running, i, go]);

  if (n <= 1) return <>{children}</>;
  const btn = "grid place-items-center size-11 rounded-full bg-white/90 text-eu-navy shadow-md hover:bg-white focus-visible:outline-2 focus-visible:outline-eu-blue";
  return (
    <div ref={root} role="group" aria-roledescription="carousel" aria-label={label} className="grid gap-2"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(i + 1, 1); if (e.key === "ArrowLeft") go(i - 1, -1); }}>
      <div className="relative grid">
        {tiles.map((t, k) => {
          const on = k === i;
          return (
            <div key={k} role="group" aria-roledescription="slide" aria-label={`${k + 1} από ${n}`} aria-hidden={!on} inert={!on}
              className={`[grid-area:1/1] min-w-0 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${on ? "opacity-100 translate-x-0 scale-100" : `opacity-0 pointer-events-none scale-[0.97] ${dir === 1 ? (k === (i - 1 + n) % n ? "-translate-x-8" : "translate-x-8") : k === (i + 1) % n ? "translate-x-8" : "-translate-x-8"}`}`}>
              {t}
            </div>
          );
        })}
        <button type="button" onClick={() => go(i - 1, -1)} aria-label="Προηγούμενο προϊόν" className={`${btn} absolute left-2 top-1/2 -translate-y-1/2`}><ChevronLeft className="size-5" aria-hidden /></button>
        <button type="button" onClick={() => go(i + 1, 1)} aria-label="Επόμενο προϊόν" className={`${btn} absolute right-2 top-1/2 -translate-y-1/2`}><ChevronRight className="size-5" aria-hidden /></button>
      </div>
      <div className="flex items-center justify-center gap-1">
        {tiles.map((_, k) => (
          <button key={k} type="button" onClick={() => go(k, k >= i ? 1 : -1)} aria-label={`Προϊόν ${k + 1} από ${n}`} aria-current={k === i ? "true" : undefined} className="group grid place-items-center min-w-6 h-11 md:h-8">
            {/* η ενεργή τελεία είναι μπάρα που γεμίζει όσο μένει το προϊόν στην οθόνη */}
            <span className={`relative block h-1.5 rounded-full overflow-hidden transition-[width] duration-300 ${k === i ? "w-8 bg-eu-navy/20" : "w-1.5 bg-eu-navy/25 group-hover:bg-eu-navy/50"}`}>
              {k === i && <span key={`${i}-${running}`} className={`absolute inset-0 origin-left bg-eu-navy ${running ? "eu-slider-fill" : ""}`} />}
            </span>
          </button>
        ))}
        {!calm && <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Συνέχεια εναλλαγής" : "Παύση εναλλαγής"} className="ml-1 grid place-items-center size-11 md:size-8 rounded-full text-eu-ink-3 hover:bg-eu-surface hover:text-eu-navy">{paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}</button>}
      </div>
    </div>
  );
}
