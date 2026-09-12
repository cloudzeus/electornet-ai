"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useLayoutEffect, useRef, type ReactNode, type ElementType } from "react";
import gsap from "gsap";

/**
 * Reveal on scroll: the wrapper (or its `[data-reveal]` children, staggered)
 * rises 18px and fades in the first time it enters the viewport. One
 * IntersectionObserver per instance, GSAP `power3.out`, 0.06s stagger.
 * Elements already on screen when the page hydrates are left untouched
 * (no hide-then-show flicker); only what is below the fold animates in.
 * No-op under prefers-reduced-motion. Transform + opacity only.
 */
export function Reveal({ as: Tag = "div", children, className = "", stagger: staggerProp, y: yProp, delay = 0, once = true }: { as?: ElementType; children: ReactNode; className?: string; stagger?: number; y?: number; delay?: number; once?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { motion } = useSettings();
  const stagger = staggerProp ?? motion.reveal.stagger;
  const y = yProp ?? motion.reveal.y;
  const duration = motion.reveal.duration;
  const enabled = motion.enabled;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = el.querySelectorAll<HTMLElement>("[data-reveal]");
    const all: Element[] = items.length ? Array.from(items) : [el];
    const vh = window.innerHeight;
    // Never hide what the visitor already sees.
    const targets = all.filter((t) => t.getBoundingClientRect().top > vh * 0.92);
    if (!targets.length) return;
    gsap.set(targets, { opacity: 0, y });
    let done = false;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) {
          if (!once && done) {
            gsap.set(targets, { opacity: 0, y });
            done = false;
          }
          return;
        }
        if (done) return;
        done = true;
        gsap.to(targets, { opacity: 1, y: 0, duration, ease: motion.easing.out, stagger, delay, overwrite: true, clearProps: "transform" });
        if (once) io.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger, y, delay, once, duration, enabled, motion.easing.out]);
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
