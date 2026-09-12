"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ZoneBadge } from "@/components/site/ZoneBadge";

export interface VendorCampaign {
  id: string;
  /** Manufacturer / brand shown as the kicker (Samsung, Miele, Dell). */
  brand: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  /** The manufacturer's own key visual (≈ 11:5), shown in full, never cropped. */
  image: string;
  alt: string;
}


/**
 * @dynamic Zone 8 — vendor campaigns (manufacturer key visuals). On wide
 * widths a column of campaign cards (thumbnail, brand, title) drives a large
 * white poster panel that shows the active key visual in full; hover/focus
 * switches it (hover intent), click opens the campaign. When nobody hovers,
 * the spotlight advances every 7 s with a thin yellow progress line on the
 * active card (paused on hover, off with reduced motion). Below @3xl the
 * same campaigns are rows with a thumbnail — every campaign visible, no
 * tabs, nothing hidden. Light surface and a framed poster: deliberately a
 * different pattern from the navy bento hero. Content and order come from
 * the CMS zone.
 */
export function CampaignSpotlight({ campaigns, zoneNo, title = "Καμπάνιες κατασκευαστών", kicker = "Τρέχουν τώρα", link }: { campaigns: VendorCampaign[]; zoneNo?: number; title?: string; kicker?: string; link?: { label: string; href: string } }) {
  const { motion } = useSettings();
  const AUTOPLAY_S = motion.campaigns.autoplaySeconds;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const dir = useRef(1);
  const timer = useRef<number | null>(null);
  const c = campaigns[active] ?? campaigns[0];
  const n = campaigns.length;

  const pick = (i: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dir.current = i > active ? 1 : -1;
      setActive(i);
    }, motion.campaigns.hoverIntentMs);
  };
  const cancelPick = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };

  // Reveal on first scroll into view: cards stagger up, the poster rises.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = el.querySelectorAll("[data-card]");
    const poster = el.querySelector("[data-poster]");
    gsap.set(cards, { opacity: 0, y: 18 });
    if (poster) gsap.set(poster, { opacity: 0, y: 28, scale: 0.985 });
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        gsap.to(cards, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.06 });
        if (poster) gsap.to(poster, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "power3.out", delay: 0.1 });
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Directional slide of the poster + staggered caption on change.
  useEffect(() => {
    const el = panel.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tl = gsap.timeline();
    tl.fromTo(el.querySelector("[data-visual]"), { opacity: 0, x: 36 * dir.current, scale: 1.02 }, { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: "power3.out" }, 0);
    tl.fromTo(el.querySelector("[data-halo]"), { opacity: 0.4, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" }, 0);
    tl.fromTo(el.querySelectorAll("[data-caption]"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.05 }, 0.08);
    return () => {
      tl.kill();
    };
  }, [active]);

  // Autoplay with a progress line on the active card; paused while hovered.
  useEffect(() => {
    const l = list.current;
    if (!l || n < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bar = l.querySelector<HTMLElement>("[data-progress]");
    if (!bar) return;
    const tw = gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: AUTOPLAY_S, ease: "none", onComplete: () => {
        dir.current = 1;
        setActive((a) => (a + 1) % n);
      },
    });
    return () => {
      tw.kill();
      gsap.set(bar, { scaleX: 0 });
    };
  }, [active, paused, n, AUTOPLAY_S]);

  if (!c) return null;

  return (
    <section ref={root} className="relative eu-container overflow-hidden bg-[linear-gradient(180deg,var(--eu-surface)_0%,var(--eu-chip)_100%)]" aria-label={title}>
      <span className="pointer-events-none absolute -top-40 right-[-10%] size-[42rem] rounded-full bg-[radial-gradient(closest-side,rgba(29,66,138,.10),rgba(29,66,138,0))]" aria-hidden />
      <span className="pointer-events-none absolute -bottom-48 left-[-8%] size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(241,196,0,.16),rgba(241,196,0,0))]" aria-hidden />
      <ZoneBadge no={zoneNo} />
      <div className="relative eu-canvas eu-gutter py-8 @lg:py-10">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide mb-2">{kicker} · {n} καμπάνιες</div>
            <h2 className="m-0 font-heading font-bold text-[length:var(--fs-30)] leading-[1.1] tracking-[-0.02em] text-eu-ink">{title}</h2>
          </div>
          {link && (
            <Link href={link.href} className="hidden @sm:block shrink-0 font-extrabold text-[length:var(--fs-14)] text-eu-ink border-b-[3px] border-eu-yellow pb-1 hover:text-eu-blue">
              {link.label}
            </Link>
          )}
        </div>

        {/* Wide: campaign cards + poster panel */}
        <div className="hidden @3xl:grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-stretch" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); cancelPick(); }}>
          <ol ref={list} className="m-0 p-0 list-none grid grid-cols-1 auto-rows-fr gap-2">
            {campaigns.map((k, i) => {
              const on = i === active;
              return (
                <li key={k.id} className="min-h-0" data-card>
                  <Link
                    href={k.href}
                    onMouseEnter={() => pick(i)}
                    onFocus={() => setActive(i)}
                    aria-current={on ? "true" : undefined}
                    className={`group relative h-full grid grid-cols-[minmax(5.5rem,28%)_minmax(0,1fr)_auto] items-center gap-4 rounded-xl pl-4 pr-4 py-3 overflow-hidden transition-[background-color,box-shadow] duration-200 ${on ? "bg-white shadow-[0_1px_0_rgba(18,42,88,.05),0_16px_32px_-24px_rgba(18,42,88,.45)]" : "hover:bg-white/70"}`}
                  >
                    <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-eu-yellow transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
                    <span className={`relative block aspect-[11/5] rounded-lg overflow-hidden bg-white ring-1 transition-[ring-color] ${on ? "ring-eu-navy/15" : "ring-eu-line-2"}`}>
                      <Image src={k.image} alt="" fill sizes="180px" className="object-contain" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block font-extrabold text-[length:var(--fs-13)] tracking-wide uppercase tabular-nums ${on ? "text-eu-blue" : "text-eu-muted"}`}>
                        {String(i + 1).padStart(2, "0")} · {k.brand}
                      </span>
                      <span className={`block font-heading font-bold text-[length:var(--fs-17)] leading-tight line-clamp-2 ${on ? "text-eu-navy" : "text-eu-ink"}`}>{k.title}</span>
                    </span>
                    <ArrowRight className={`size-5 transition-all duration-200 ${on ? "text-eu-navy opacity-100 translate-x-0" : "text-eu-muted-2 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"}`} aria-hidden />
                    {on && n > 1 && <span data-progress className="absolute left-4 right-4 bottom-0 h-0.5 rounded-full bg-eu-yellow origin-left scale-x-0" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ol>

          <div ref={panel} data-poster className="min-w-0 bg-white rounded-2xl overflow-hidden shadow-[0_1px_0_rgba(18,42,88,.05),0_32px_56px_-40px_rgba(18,42,88,.5)] grid grid-rows-[minmax(0,1fr)_auto]">
            <Link href={c.href} className="group/poster relative block p-4 @5xl:p-5 bg-[radial-gradient(80%_70%_at_50%_45%,#fff_0%,var(--eu-surface)_100%)]" tabIndex={-1} aria-hidden>
              <span data-halo className="pointer-events-none absolute inset-x-[12%] top-[18%] bottom-[14%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(29,66,138,.12),rgba(29,66,138,0))] blur-2xl" />
              <span className="relative block aspect-[11/5] rounded-lg overflow-hidden">
                <Image data-visual key={c.image} src={c.image} alt="" fill sizes="(max-width: 1280px) 58vw, 780px" priority className="object-contain drop-shadow-[0_18px_28px_rgba(18,42,88,.18)] transition-transform duration-700 ease-out group-hover/poster:scale-[1.025]" />
              </span>
            </Link>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 @5xl:px-6 pb-5 pt-4 border-t border-eu-line-2">
              <div className="min-w-0 flex-1 basis-[18rem]">
                <div data-caption className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{c.brand}</div>
                <div data-caption className="font-heading font-bold text-[length:var(--fs-22)] leading-tight text-eu-ink tracking-[-0.01em]">{c.title}</div>
                <p data-caption className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{c.text}</p>
              </div>
              <Link data-caption href={c.href} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-5 min-h-11 hover:bg-eu-blue transition-colors">
                {c.cta} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>

        {/* Narrow: rows with thumbnails — every campaign visible, no tabs */}
        <ul className="@3xl:hidden m-0 p-0 list-none grid grid-cols-1 gap-3">
          {campaigns.map((k, i) => (
            <li key={k.id}>
              <Link href={k.href} className="group relative grid grid-cols-[minmax(6.5rem,32%)_minmax(0,1fr)_auto] items-center gap-4 bg-white rounded-xl shadow-[0_1px_0_rgba(18,42,88,.05),0_12px_24px_-20px_rgba(18,42,88,.4)] p-3 pl-4 overflow-hidden transition-shadow hover:shadow-[0_1px_0_rgba(18,42,88,.05),0_16px_32px_-20px_rgba(18,42,88,.5)]">
                <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-eu-yellow" aria-hidden />
                <span className="relative block aspect-[11/5] rounded-lg overflow-hidden bg-white ring-1 ring-eu-line-2">
                  <Image src={k.image} alt={k.alt} fill sizes="(max-width: 768px) 32vw, 220px" className="object-contain" />
                </span>
                <span className="min-w-0">
                  <span className="block font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase tabular-nums">
                    {String(i + 1).padStart(2, "0")} · {k.brand}
                  </span>
                  <span className="block font-heading font-bold text-[length:var(--fs-16)] leading-tight text-eu-ink">{k.title}</span>
                  <span className="block mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)] leading-snug">{k.cta}</span>
                </span>
                <ArrowRight className="size-5 text-eu-navy transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
