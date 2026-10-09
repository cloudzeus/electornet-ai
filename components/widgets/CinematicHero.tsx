"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { Pause, Play, ArrowRight } from "lucide-react";
import gsap from "gsap";
import type { HeroSlide } from "@/lib/data/types";
import { useDevice } from "@/components/fluid/DeviceProvider";
import { StarLight } from "@/components/motion/StarLight";
import { Spotlight } from "@/components/motion/Spotlight";
import { copyOf } from "@/lib/cms/copy";
import { priceLong } from "@/lib/format";

const c = copyOf("hero");

/**
 * v4 cinematic hero («Το αστέρι φωτίζει το προϊόν»): navy stage with a
 * slow ambient light, the brand star as light source with rotating rays,
 * the campaign product as a floating cutout that follows the pointer, and
 * a giant three-line title that writes itself word by word. The lifestyle
 * photo stays as a dim backdrop for depth. Slides rotate with a visible
 * pause (WCAG 2.2.2) and a progress line; nothing animates before LCP
 * and nothing under prefers-reduced-motion.
 *
 * Adaptive: two columns from @lg (text | product); on phones the product
 * sits behind the text at the right, smaller, so the title never wraps
 * around it. Every text ≥ 14px.
 */
/**
 * Φωτογραφία φόντου. Με ξεχωριστή φωτογραφία κινητού: <picture> (art direction, getImageProps) ώστε κάθε συσκευή να
 * κατεβάζει μόνο τη δική της — χωρίς preload, όπως ορίζει η τεκμηρίωση του Next για art direction.
 */
function HeroBackdrop({ s, first }: { s: HeroSlide; first: boolean }) {
  const cls = "object-cover opacity-25 scale-105";
  if (!s.imageMobile) return <Image src={s.image} alt="" fill preload={first} sizes="(max-width: 1024px) 100vw, 66vw" className={cls} unoptimized={s.image.startsWith("http")} />;
  const common = { alt: "", fill: true, sizes: "(max-width: 767px) 100vw, 66vw", fetchPriority: first ? ("high" as const) : undefined };
  const desktop = getImageProps({ ...common, src: s.image, unoptimized: s.image.startsWith("http") }).props;
  const { srcSet: mobileSet, ...rest } = getImageProps({ ...common, src: s.imageMobile, unoptimized: s.imageMobile.startsWith("http") }).props;
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktop.srcSet ?? desktop.src} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt="" μέσα στο rest: διακοσμητικό φόντο */}
      <img {...rest} srcSet={mobileSet} className={cls} />
    </picture>
  );
}

export function CinematicHero({ slides, intervalMs: intervalProp }: { slides: HeroSlide[]; intervalMs?: number }) {
  const { motion } = useSettings();
  const intervalMs = intervalProp ?? motion.hero.intervalMs;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const { reducedMotion, saveData } = useDevice();
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const s = slides[i];
  const n = slides.length;
  const [changed, setChanged] = useState(false);
  // Only slides after the first one animate in (the first is static for LCP and never flickers).
  const anim = changed && !reducedMotion;
  const hidden = anim ? { opacity: 0 } : undefined;

  const go = useCallback(
    (k: number) => {
      setChanged(true);
      setI(((k % n) + n) % n);
    },
    [n],
  );

  // Autoplay with progress line.
  useEffect(() => {
    const b = bar.current;
    if (paused || reducedMotion || n < 2) return;
    const tw = b ? gsap.fromTo(b, { scaleX: 0 }, { scaleX: 1, duration: intervalMs / 1000, ease: "none", onComplete: () => go(i + 1) }) : null;
    const t = tw ? null : setTimeout(() => go(i + 1), intervalMs);
    return () => {
      tw?.kill();
      if (t) clearTimeout(t);
    };
  }, [i, paused, reducedMotion, intervalMs, n, go]);

  // Entrance choreography on slide change: words rise, product slides in from the right.
  // Elements start hidden via inline style (no first-frame flash) and are always left visible.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !anim) return;
    const words = el.querySelectorAll("[data-word]");
    const copy = el.querySelectorAll("[data-copy]");
    const product = el.querySelector("[data-product]");
    const backdrop = el.querySelector("[data-backdrop]");
    const tl = gsap.timeline();
    tl.fromTo(words, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: motion.hero.wordStagger, clearProps: "transform" }, 0);
    tl.fromTo(copy, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.06, clearProps: "transform" }, 0.2);
    if (product) tl.fromTo(product, { opacity: 0, x: 50 }, { opacity: 1, x: 0, duration: 0.8, ease: "expo.out", clearProps: "transform" }, 0.1);
    if (backdrop) tl.fromTo(backdrop, { opacity: 0.5 }, { opacity: 1, duration: 0.9, ease: "power2.out" }, 0);
    return () => {
      tl.kill();
      gsap.set([words, copy, product, backdrop].filter(Boolean) as Element[], { opacity: 1, clearProps: "transform" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Product parallax with the pointer (fine pointer only).
  useEffect(() => {
    const st = stage.current;
    if (!st || reducedMotion || window.matchMedia("(hover: none)").matches) return;
    const px = gsap.quickTo("[data-product-inner]", "x", { duration: 0.8, ease: "power3.out" });
    const py = gsap.quickTo("[data-product-inner]", "y", { duration: 0.8, ease: "power3.out" });
    const rot = gsap.quickTo("[data-product-inner]", "rotate", { duration: 0.8, ease: "power3.out" });
    const onMove = (e: PointerEvent) => {
      const r = st.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      px(dx * 26);
      py(dy * 18);
      rot(dx * 4);
    };
    const onLeave = () => {
      px(0);
      py(0);
      rot(0);
    };
    st.addEventListener("pointermove", onMove);
    st.addEventListener("pointerleave", onLeave);
    return () => {
      st.removeEventListener("pointermove", onMove);
      st.removeEventListener("pointerleave", onLeave);
    };
  }, [reducedMotion, i]);

  return (
    <div ref={stage} style={{ containerType: "size" }} className="relative overflow-hidden rounded-lg bg-eu-navy-2 h-[640px] @md:h-[480px] @lg:h-[500px] @xl:h-[540px] isolate" aria-roledescription="carousel" aria-label={c.kampanies}>
      {/* backdrop photos of ALL slides, stacked: each loads once and slides crossfade by opacity. (One keyed layer per
          slide used to unmount on every change and reload its photo — a navy flash between slides.) */}
      {slides.map((sl, k) => (
        <div key={`bd-${sl.id}`} data-backdrop={k === i ? "" : undefined} aria-hidden className={`absolute inset-0 transition-opacity duration-700 ease-out ${k === i ? "opacity-100" : "opacity-0"}`}>
          <HeroBackdrop s={sl} first={k === 0} />
          {k === i && sl.video && motion.hero.video && !reducedMotion && !saveData && (
            // Ambient loop, muted and decorative; the photo underneath is the poster and the fallback.
            <video src={sl.video} poster={sl.image} autoPlay muted loop playsInline preload="metadata" aria-hidden className="absolute inset-0 size-full object-cover opacity-35" />
          )}
        </div>
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(18,42,88,.98)_0%,rgba(18,42,88,.9)_40%,rgba(18,42,88,.55)_100%)]" aria-hidden />
      {/* the products of the other slides load ahead, with the same sizes, so the next slide finds them in the cache */}
      <div aria-hidden className="absolute size-px overflow-hidden opacity-0 pointer-events-none">
        {slides.map((sl, k) => (k !== i && sl.cutout ? <Image key={`pre-${sl.id}`} src={sl.cutout} alt="" fill sizes="(max-width: 1024px) 90vw, 640px" loading="eager" fetchPriority="low" unoptimized={sl.cutout.startsWith("http")} /> : null))}
      </div>
      {motion.hero.ambient && <span className="eu-ambient" aria-hidden />}
      {motion.hero.spotlight && <Spotlight />}
      {motion.hero.rays && <StarLight size={64} className="right-[12%] top-[10%] hidden @lg:block" />}

      <div ref={root} key={s.id} className="relative h-full grid grid-cols-1 content-start @lg:content-normal @lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] @lg:items-center">
        {/* text */}
        <div className="relative z-10 px-4 pt-4 @md:p-7 @lg:px-[5cqi] @lg:pt-[6cqh] @lg:pb-0 text-white max-w-[40rem] self-start">
          <div data-copy style={hidden} className="inline-flex items-center gap-2 self-start bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] tracking-wide px-2.5 py-1.5 rounded-sm mb-[3cqh]">{s.kicker}</div>
          <h1 style={{ ["--chars" as string]: Math.max(6, ...s.title.map((l) => l.length)) }} className="m-0 font-heading font-extrabold [--col:150] @lg:[--col:82] text-[length:clamp(1.75rem,min(11cqi,12.5cqh,calc(var(--col)*1cqi/var(--chars))),5rem)] leading-[0.98] tracking-[-0.035em] mb-[3cqh]">
            {s.title.map((line, k) => (
              <span key={k} className="block">
                {line.split(" ").map((w, j) => (
                  <span key={j} data-word style={hidden} className="inline-block mr-[0.22em] last:mr-0">
                    {w}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p data-copy style={hidden} className="m-0 text-eu-on-dark text-[length:clamp(0.9375rem,3cqh,1.0625rem)] leading-[1.5] mb-[3.5cqh] max-w-[28em] line-clamp-2">
            {s.body}
          </p>
          <div data-copy style={hidden} className="flex flex-wrap gap-2 mb-[3cqh]">
            <Link href={s.primary.href} className="group inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 py-2.5 min-h-11 whitespace-nowrap hover:bg-eu-yellow-dark transition-colors">
              {s.primary.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            {s.secondary && (
              <Link href={s.secondary.href} className="rounded-full border-2 border-white/40 text-white font-bold text-[length:var(--fs-15)] px-4 py-2 min-h-11 hidden @md:inline-flex items-center whitespace-nowrap hover:border-white hover:bg-white/10 transition-colors">
                {s.secondary.label}
              </Link>
            )}
          </div>
          <ul data-copy style={hidden} className="hidden @6xl:flex flex-wrap gap-x-5 gap-y-1 m-0 p-0 list-none font-semibold text-[length:var(--fs-14)] text-eu-on-dark border-t border-white/15 pt-4">
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

        {/* floating product */}
        {s.cutout && (
          <div data-product style={hidden} className="relative order-first mx-4 mt-4 h-[42cqh] @md:h-[36cqh] @md:mx-7 @md:mt-7 flex items-center justify-center @lg:order-none @lg:absolute @lg:mx-0 @lg:mt-0 @lg:right-[2cqi] @lg:top-[4%] @lg:bottom-[11%] @lg:h-auto @lg:w-[47%]">
            <span className="eu-rays hidden @lg:block" style={{ width: "140%", left: "-20%", top: "-20%" }} aria-hidden />
            <Link href={s.productHref ?? s.primary.href} data-product-inner aria-label={s.alt} className="relative block w-full h-full eu-float">
              <Image src={s.cutout} alt="" fill sizes="(max-width: 1024px) 90vw, 640px" preload={i === 0} className="object-contain eu-cutout-shadow-dark" unoptimized={s.cutout.startsWith("http")} />
              {s.price ? <span className="absolute left-1/2 -translate-x-1/2 bottom-[4%] rounded-full bg-eu-yellow text-eu-navy font-extrabold px-3.5 py-1.5 text-[length:var(--fs-16)] shadow-lg whitespace-nowrap tabular-nums">{priceLong(s.price)}</span> : null}
            </Link>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="absolute bottom-4 left-4 right-4 @md:bottom-6 @md:left-7 @md:right-7 @lg:left-[5cqi] @lg:right-[2cqi] @lg:bottom-[4cqh] flex items-center justify-between gap-3 z-20">
        <div className="flex gap-2" role="tablist" aria-label={c.epilogi_diafaneias}>
          {slides.map((sl, k) => (
            <button key={sl.id} type="button" role="tab" aria-selected={k === i} aria-label={`Διαφάνεια ${k + 1}`} onClick={() => go(k)} className="group/dot relative w-10 h-11 flex items-center bg-transparent">
              <span className="relative block w-full h-[6px] rounded-full bg-white/30 overflow-hidden group-hover/dot:bg-white/50 transition-colors">
                {k === i && <span ref={bar} className="absolute inset-0 origin-left bg-eu-yellow scale-x-0" aria-hidden />}
                {k === i && reducedMotion && <span className="absolute inset-0 bg-eu-yellow" aria-hidden />}
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy/70 backdrop-blur text-white font-semibold text-[length:var(--fs-13)] px-3 py-2 min-h-9 hover:bg-eu-navy">
          {paused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
          <span>{paused ? "Συνέχεια" : "Παύση"}</span>
        </button>
      </div>
    </div>
  );
}
