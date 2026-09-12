"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

/**
 * 3D tilt that follows the pointer (max ±`max` degrees) with a soft
 * return on leave. Uses gsap.quickTo so lists of 20+ cards stay cheap.
 * Off on touch devices and under prefers-reduced-motion. Children with
 * `data-tilt-layer` get a slight z-translate so cutouts float above the card.
 */
export function Tilt({ children, className = "", max: maxProp, scale: scaleProp, disabled = false }: { children: ReactNode; className?: string; max?: number; scale?: number; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { motion } = useSettings();
  const max = maxProp ?? motion.tilt.max;
  const scale = scaleProp ?? motion.tilt.scale;
  const off = disabled || !motion.enabled || !motion.tilt.enabled;
  useEffect(() => {
    const el = ref.current;
    if (!el || off) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(hover: none)").matches) return;
    gsap.set(el, { transformPerspective: 900, transformStyle: "preserve-3d" });
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.45, ease: "power3.out" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.45, ease: "power3.out" });
    const sc = gsap.quickTo(el, "scale", { duration: 0.45, ease: "power3.out" });
    const layers = el.querySelectorAll<HTMLElement>("[data-tilt-layer]");
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * max * 2);
      rx(-py * max * 2);
      sc(scale);
      layers.forEach((l) => gsap.to(l, { x: px * 10, y: py * 10, duration: 0.45, ease: "power3.out" }));
    };
    const onLeave = () => {
      rx(0);
      ry(0);
      sc(1);
      layers.forEach((l) => gsap.to(l, { x: 0, y: 0, duration: 0.6, ease: "power3.out" }));
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max, scale, off]);
  return (
    <div ref={ref} className={`will-change-transform ${className}`}>
      {children}
    </div>
  );
}
