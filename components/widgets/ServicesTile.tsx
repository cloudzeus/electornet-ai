"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Wrench, Truck, ShieldCheck, Recycle, Clock, Sparkles } from "lucide-react";
import gsap from "gsap";

const ICONS = [Truck, Wrench, Clock, ShieldCheck, Recycle, Sparkles];

/**
 * @dynamic Bento tile «Υπηρεσίες» (v4): one service at a time, rotating
 * every 3.2 s with a rise/fade (GSAP), dots as progress, numbered 01…N.
 * Hover pauses. Off under reduced motion (shows the list). Data: services
 * with price from the CMS.
 */
export function ServicesTile({ services, total = 13 }: { services: { title: string; blurb?: string }[]; total?: number }) {
  const { motion } = useSettings();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rm, setRm] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setRm(window.matchMedia("(prefers-reduced-motion: reduce)").matches), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (paused || rm || services.length < 2) return;
    const t = setInterval(() => setI((k) => (k + 1) % services.length), motion.servicesTile.intervalMs);
    return () => clearInterval(t);
  }, [paused, rm, services.length, motion.servicesTile.intervalMs]);
  useEffect(() => {
    if (!box.current || rm) return;
    gsap.fromTo(box.current.querySelectorAll("[data-line]"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.06 });
  }, [i, rm]);
  const s = services[i];
  const Icon = ICONS[i % ICONS.length];
  return (
    <Link href="/ypiresies" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="group relative bg-eu-surface text-eu-ink rounded-lg p-4 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 hover:bg-eu-chip transition-colors overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide">Υπηρεσίες</span>
        <span className="font-heading font-extrabold text-eu-navy/20 text-[length:var(--fs-22)] leading-none tabular-nums">{String(i + 1).padStart(2, "0")}</span>
      </div>
      {rm ? (
        <div className="font-semibold text-eu-ink-2 text-[length:var(--fs-14)] leading-[1.55]">{services.map((x) => x.title).join(" · ")}</div>
      ) : (
        <div ref={box} className="min-w-0 flex items-start gap-3">
          <span className="size-10 shrink-0 rounded-xl bg-eu-navy text-eu-yellow inline-flex items-center justify-center" data-line>
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span data-line className="block font-heading font-bold text-eu-ink text-[length:var(--fs-16)] leading-tight line-clamp-1">
              {s?.title}
            </span>
            {s?.blurb && (
              <span data-line className="block text-eu-ink-3 text-[length:var(--fs-13-5)] leading-snug line-clamp-2 mt-0.5">
                {s.blurb}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="flex gap-1" aria-hidden>
          {services.map((_, k) => (
            <span key={k} className={`h-1 rounded-full transition-all duration-300 ${k === i ? "w-5 bg-eu-navy" : "w-1.5 bg-eu-navy/25"}`} />
          ))}
        </span>
        <span className="font-extrabold text-eu-blue text-[length:var(--fs-14)] inline-flex items-center gap-1">
          Και άλλες {Math.max(0, total - services.length)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
