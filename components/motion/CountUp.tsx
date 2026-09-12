"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Number that counts up from 0 the first time it scrolls into view.
 * Renders the final value on the server (no CLS, no wrong number without
 * JS), then animates only on the client. Tabular figures; locale el-GR.
 */
export function CountUp({ value, suffix = "", prefix = "", duration: durationProp, className = "" }: { value: number; suffix?: string; prefix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { motion } = useSettings();
  const duration = durationProp ?? motion.countUp.duration;
  const [n, setN] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motion.enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const o = { v: 0 };
        gsap.to(o, { v: value, duration, ease: "power3.out", onUpdate: () => setN(Math.round(o.v)) });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, motion.enabled]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {n.toLocaleString("el-GR")}
      {suffix}
    </span>
  );
}
