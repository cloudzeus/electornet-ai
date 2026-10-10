"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { pageHelpAction } from "@/app/admin/(shell)/help/actions";

/**
 * Τονισμός σημείων της σελίδας (data-help="…"): «Δείξε μου» από τη Βοήθεια ή από το wiki (?help=<κλειδί>), και
 * «Σημεία βοήθειας» = αριθμημένα σημεία πάνω σε όλα τα components της σελίδας. Ενεργοποιείται με window events:
 *   eu-help:show      { key, title, text }
 *   eu-help:hotspots  { parts: { key, title, text }[] | null }
 */
export type SpotPart = { key: string; title: string; text: string };
export const showHelpPart = (p: SpotPart) => window.dispatchEvent(new CustomEvent("eu-help:show", { detail: p }));
export const setHotspots = (parts: SpotPart[] | null) => window.dispatchEvent(new CustomEvent("eu-help:hotspots", { detail: { parts } }));

const find = (key: string) => document.querySelector<HTMLElement>(`[data-help="${CSS.escape(key)}"]`);
type Rect = { top: number; left: number; width: number; height: number };
const rectOf = (el: HTMLElement): Rect => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };

export function HelpSpotlight() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [spot, setSpot] = useState<(SpotPart & { rect: Rect | null }) | null>(null);
  const [hot, setHot] = useState<(SpotPart & { rect: Rect })[] | null>(null);
  const [hotParts, setHotParts] = useState<SpotPart[] | null>(null);

  const show = useCallback((p: SpotPart) => {
    const el = find(p.key);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    setSpot({ ...p, rect: el ? rectOf(el) : null });
  }, []);

  // events
  useEffect(() => {
    const a = (e: Event) => show((e as CustomEvent<SpotPart>).detail);
    const b = (e: Event) => setHotParts((e as CustomEvent<{ parts: SpotPart[] | null }>).detail.parts);
    window.addEventListener("eu-help:show", a);
    window.addEventListener("eu-help:hotspots", b);
    return () => { window.removeEventListener("eu-help:show", a); window.removeEventListener("eu-help:hotspots", b); };
  }, [show]);

  // ?help=<κλειδί> (σύνδεσμος από το wiki): βρες την περιγραφή και δείξε το σημείο μόλις εμφανιστεί
  const helpKey = params.get("help");
  useEffect(() => {
    if (!helpKey) return;
    let live = true;
    void pageHelpAction(pathname).then((h) => {
      const part = h?.page?.parts?.find((p) => p.key === helpKey) ?? { key: helpKey, title: "Εδώ", text: "" };
      let n = 0;
      const tryShow = () => { if (!live) return; if (find(helpKey) || n++ > 20) show(part); else setTimeout(tryShow, 250); };
      tryShow();
    });
    return () => { live = false; };
  }, [helpKey, pathname, show]);

  // θέση πάνω στη σελίδα: ακολουθεί κύλιση και αλλαγή μεγέθους
  useEffect(() => {
    if (!spot && !hotParts) return;
    let raf = 0;
    const tick = () => {
      if (spot) { const el = find(spot.key); setSpot((s) => (s ? { ...s, rect: el ? rectOf(el) : null } : s)); }
      if (hotParts) setHot(hotParts.map((p) => { const el = find(p.key); return el && el.offsetParent !== null ? { ...p, rect: rectOf(el) } : null; }).filter((x): x is SpotPart & { rect: Rect } => !!x));
    };
    const loop = () => { tick(); raf = requestAnimationFrame(() => setTimeout(loop, 120)); };
    loop();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setSpot(null); setHotParts(null); setHot(null); } };
    window.addEventListener("keydown", esc);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ο βρόχος ξεκινά/σταματά μόνο όταν ανοίγει/κλείνει
  }, [!!spot, hotParts]);
  // αλλαγή σελίδας: καθάρισμα
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setSpot(null); setHotParts(null); setHot(null); }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  return (
    <>
      {hotParts && hot?.map((p, i) => (
        <button key={p.key} type="button" onClick={() => show(p)} aria-label={`Σημείο ${i + 1}: ${p.title}`} title={p.title}
          className="fixed z-[80] size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] shadow-lg ring-2 ring-eu-navy grid place-items-center hover:scale-110 transition-transform motion-reduce:transition-none"
          style={{ top: Math.max(16, p.rect.top + 2), left: Math.min(vw - 16, p.rect.left + p.rect.width - 2) }}>{i + 1}</button>
      ))}
      {hotParts && (
        <div role="status" className="fixed z-[80] bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-eu-navy text-white pl-4 pr-1 h-11 shadow-lg text-[length:var(--fs-14)] font-bold">
          {hot?.length ? `${hot.length} σημεία βοήθειας — πάτα έναν αριθμό` : "Κανένα σημείο βοήθειας σε αυτή την προβολή"}
          <button type="button" onClick={() => { setHotParts(null); setHot(null); }} aria-label="Κλείσιμο σημείων βοήθειας" className="size-9 grid place-items-center rounded-full hover:bg-white/15"><X className="size-4" aria-hidden /></button>
        </div>
      )}
      {spot && (
        <div className="fixed inset-0 z-[90]" onClick={() => setSpot(null)}>
          {spot.rect && <div aria-hidden className="absolute rounded-xl ring-4 ring-eu-yellow shadow-[0_0_0_9999px_rgba(11,31,68,.45)] transition-all duration-200 motion-reduce:transition-none" style={{ top: spot.rect.top - 6, left: spot.rect.left - 6, width: spot.rect.width + 12, height: spot.rect.height + 12 }} />}
          <div role="dialog" aria-label={spot.title} onClick={(e) => e.stopPropagation()} className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-xl bg-white p-3 shadow-2xl grid gap-1.5"
            style={spot.rect ? { top: Math.min(spot.rect.top + spot.rect.height + 14, window.innerHeight - 180), left: Math.min(Math.max(16, spot.rect.left), vw - 368) } : { top: "40%", left: "50%", transform: "translate(-50%,-50%)" }}>
            <div className="flex items-start gap-2">
              <span className="font-bold text-eu-ink text-[length:var(--fs-15)] flex-1">{spot.title}</span>
              <button type="button" onClick={() => setSpot(null)} aria-label="Κλείσιμο" className="size-8 -mr-1 -mt-1 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
            </div>
            {spot.text && <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">{spot.text}</p>}
            {!spot.rect && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το σημείο δεν φαίνεται τώρα — ίσως χρειάζεται να επιλέξεις κάτι πρώτα ή είναι σε άλλη καρτέλα.</p>}
          </div>
        </div>
      )}
    </>
  );
}
