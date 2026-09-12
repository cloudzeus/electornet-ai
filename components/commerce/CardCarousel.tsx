"use client";

import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import gsap from "gsap";
import { useDevice } from "@/components/fluid/DeviceProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("carousel");

/**
 * Adaptive card rail. The number of cards per view comes from the
 * measured width and a minimum optimal card width — cards are never
 * cramped. Whatever does not fit is reached with the arrows or a swipe,
 * one card at a time: the first slides out, the next slides in. Motion
 * is tweened with GSAP (power3.out); there is never a scrollbar. With
 * few items it is a plain grid. Phones show one card per view.
 */
export function CardCarousel({ children, minItem = 240, minItemNarrow = 300, gap = 16, label = "Προϊόντα" }: { children: ReactNode; minItem?: number; minItemNarrow?: number; gap?: number; label?: string }) {
  const items = Children.toArray(children);
  const { device } = useDevice();
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const [w, setW] = useState(0);
  const [start, setStart] = useState(0);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const min = w && w < 520 ? minItemNarrow : minItem;
  const fallback = device === "mobile" ? 1 : device === "tablet" ? 3 : 4;
  // Cards per view from the width; fewer items than that → they share the full width.
  const per = Math.max(1, Math.min(items.length, w ? Math.floor((w + gap) / (min + gap)) : fallback));
  const multi = items.length > per;
  const maxStart = Math.max(0, items.length - per);
  const cur = Math.min(start, maxStart);
  const cardPx = w ? (w - (per - 1) * gap) / per : 0;
  const go = (d: 1 | -1) => setStart(Math.max(0, Math.min(maxStart, cur + d)));
  const narrow = !w || w < 700;
  const arrow = "absolute top-[38%] size-12 rounded-full bg-white border border-eu-line shadow-[var(--shadow-raised)] inline-flex items-center justify-center text-eu-navy hover:bg-eu-navy hover:text-white transition-colors disabled:opacity-0 disabled:pointer-events-none z-10";

  // Tween the track to the current position (GSAP, no CSS scroll).
  useLayoutEffect(() => {
    const t = track.current;
    if (!t) return;
    const x = -cur * (cardPx + gap);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(t, { x, duration: reduce ? 0 : 0.55, ease: "power3.out", overwrite: true });
  }, [cur, cardPx, gap]);

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      <div
        ref={viewport}
        className="overflow-hidden"
        onPointerDown={(e) => (drag.current = e.clientX)}
        onPointerUp={(e) => {
          if (drag.current == null) return;
          const dx = e.clientX - drag.current;
          drag.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        <ul ref={track} className="m-0 p-0 list-none grid grid-flow-col will-change-transform" style={{ gap, gridAutoColumns: `calc((100% - ${(per - 1) * gap}px) / ${per})` }}>
          {items.map((it, i) => (
            <li key={i} className="min-w-0" aria-hidden={multi && (i < cur || i >= cur + per) ? true : undefined}>
              {it}
            </li>
          ))}
        </ul>
      </div>
      {multi && (
        <>
          <button type="button" aria-label={c.proigoymeno} disabled={cur === 0} onClick={() => go(-1)} className={`${arrow} ${narrow ? "left-2" : "left-0 -translate-x-1/2"}`}>
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button type="button" aria-label={c.epomeno} disabled={cur >= maxStart} onClick={() => go(1)} className={`${arrow} ${narrow ? "right-2" : "right-0 translate-x-1/2"}`}>
            <ChevronRight className="size-6" aria-hidden />
          </button>
          {maxStart < 8 && (
            <div className="flex justify-center gap-1.5 mt-4" aria-hidden>
              {Array.from({ length: maxStart + 1 }).map((_, i) => (
                <button key={i} type="button" tabIndex={-1} onClick={() => setStart(i)} aria-label={`Θέση ${i + 1}`} className="group/dot h-11 min-w-6 px-1 flex items-center justify-center bg-transparent">
                  <span className={`block h-2 rounded-full transition-all ${i === cur ? "w-6 bg-eu-navy" : "w-2 bg-eu-line-3 group-hover/dot:bg-eu-muted-2"}`} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
