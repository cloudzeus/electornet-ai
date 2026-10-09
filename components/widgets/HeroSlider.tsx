"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { HeroSlide } from "@/lib/data/types";
import { useDevice } from "@/components/fluid/DeviceProvider";
import { FluidContent, clampWords } from "@/components/fluid/Fluid";

/**
 * Three slides with a visible pause (WCAG 2.2.2). No animation before
 * LCP: the first slide is static markup with a priority image; motion
 * only starts after mount and never under prefers-reduced-motion.
 */
export function HeroSlider({ slides, intervalMs = 6000 }: { slides: HeroSlide[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const { reducedMotion, device } = useDevice();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = useCallback(() => setI((n) => (n + 1) % slides.length), [slides.length]);

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    timer.current = setInterval(next, intervalMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, reducedMotion, next, intervalMs, slides.length]);

  const s = slides[i];

  return (
    <FluidContent className="relative overflow-hidden rounded-lg bg-eu-navy-2 min-h-[300px] @md:min-h-[360px] @lg:min-h-[460px] @xl:min-h-[520px] h-full" fallback="xl">
      {({ size }) => (
        <div className="absolute inset-0" aria-roledescription="carousel" aria-label="Καμπάνιες">
          <AnimatePresence initial={false}>
            <motion.div
              key={s.id}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.3, 1] }}
              className="absolute inset-0"
              aria-roledescription="slide"
              aria-label={`${i + 1} από ${slides.length}`}
            >
              <Image
                src={s.image}
                alt={s.alt}
                fill
                priority={i === 0}
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
                unoptimized={s.image.startsWith("http")}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,42,88,.94)_0%,rgba(18,42,88,.72)_46%,rgba(18,42,88,.08)_100%)] @md:bg-[linear-gradient(90deg,rgba(18,42,88,.92)_0%,rgba(18,42,88,.7)_46%,rgba(18,42,88,.05)_100%)]" />
              <div className="relative p-5 pb-14 @md:p-7 @md:pb-14 @lg:p-[38px_34px] text-white max-w-[32em] h-full flex flex-col justify-center">
                <div className="inline-block self-start bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] tracking-wide px-2.5 py-1.5 rounded-sm mb-3 @lg:mb-[18px]">{s.kicker}</div>
                <h1 className="m-0 font-heading font-bold text-[length:var(--fs-50)] leading-[1.02] tracking-[-0.028em] mb-3 @lg:mb-4">
                  {s.title.map((line, k) => (
                    <span key={k} className="block">
                      {line}
                    </span>
                  ))}
                </h1>
                <p className="m-0 text-eu-on-dark text-[length:var(--fs-17)] leading-[1.55] mb-4 @lg:mb-6 max-w-[26em]">
                  {clampWords(s.body, size, { xs: 9, sm: 12, md: 16 })}
                </p>
                <div className="flex flex-wrap gap-2.5 mb-4 @lg:mb-[26px]">
                  <Link href={s.primary.href} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 py-3.5 min-h-11 inline-flex items-center hover:bg-eu-yellow-dark">
                    {s.primary.label}
                  </Link>
                  {s.secondary && (
                  <Link href={s.secondary.href} className="rounded-full border-2 border-white/50 text-white font-bold text-[length:var(--fs-16)] px-5 py-3 min-h-11 inline-flex items-center hover:border-white">
                    {s.secondary.label}
                  </Link>
                  )}
                </div>
                <ul className="hidden @sm:flex flex-wrap gap-x-5 gap-y-1 m-0 p-0 list-none font-semibold text-[length:var(--fs-14)] border-t border-white/20 pt-4">
                  {s.bullets.map((b, k) => (
                    <li key={b} className="flex items-center gap-5">
                      {k > 0 && (
                        <span className="text-eu-yellow" aria-hidden>
                          ·
                        </span>
                      )}
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-4 right-4 @lg:bottom-5 @lg:right-[22px] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy/80 text-white font-semibold text-[length:var(--fs-13)] px-3 py-2 min-h-9 hover:bg-eu-navy"
            >
              {paused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
              {device === "mobile" ? <span className="sr-only">{paused ? "Συνέχεια" : "Παύση"}</span> : paused ? "Συνέχεια" : "Παύση"}
            </button>
            <div className="flex gap-1.5" role="tablist" aria-label="Επιλογή διαφάνειας">
              {slides.map((sl, k) => (
                <button
                  key={sl.id}
                  type="button"
                  role="tab"
                  aria-selected={k === i}
                  aria-label={`Διαφάνεια ${k + 1}`}
                  onClick={() => setI(k)}
                  className={`w-[26px] h-[3px] rounded-full ${k === i ? "bg-eu-yellow" : "bg-white/45 hover:bg-white/80"}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </FluidContent>
  );
}
