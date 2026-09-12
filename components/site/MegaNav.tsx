"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import Image from "next/image";
import { navCategories, navUtility, SUB_BLURB } from "@/lib/data/nav";
import gsap from "gsap";
import type { MegaMenuEntry } from "@/lib/data/repo";
import { ZoneBadge } from "./ZoneBadge";
import { useDevice } from "@/components/fluid/DeviceProvider";
import { ProductImage } from "@/components/commerce/ProductImage";
import { priceShort, instalment, priceLong } from "@/lib/format";
import { useCart } from "@/components/commerce/CartProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("megaNav");

/**
 * @dynamic Mega menu — nine first-level plaques; each panel has three
 * levels of content: sub-categories with counts, top brands + quick
 * filters (from the catalogue facets), and a promoted product with photo
 * and «Αγορά με 1 κλικ» plus the category's smart guide. Content comes
 * from `getMegaMenuData()` (CMS «menu» zone with catalogue fallbacks).
 * Keyboard: Tab into a plaque, Enter/ArrowDown opens, Esc closes.
 * Hidden on phones — the MobileMenu drawer takes over.
 */
export function MegaNav({ data = [] }: { data?: MegaMenuEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [visible, setVisible] = useState(navCategories.length);
  const { reducedMotion } = useDevice();
  const { openQuickBuy } = useCart();
  const ref = useRef<HTMLElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const intent = useRef<number | null>(null);
  const probe = useRef<HTMLUListElement>(null);
  const active = navCategories.find((c) => c.slug === open);
  const entry = data.find((d) => d.slug === open);
  const overflow = navCategories.slice(visible);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Priority+ navigation: measure every item once (invisible probe row) and show as many
  // categories as fit beside the utility links; the rest collapse into «Περισσότερα».
  useLayoutEffect(() => {
    const ul = row.current;
    const pr = probe.current;
    if (!ul || !pr) return;
    const ro = new ResizeObserver(() => {
      const cats = [...pr.querySelectorAll<HTMLElement>("[data-cat]")].map(
        (e) => e.offsetWidth + 4,
      );
      const utils = [...pr.querySelectorAll<HTMLElement>("[data-util]")].reduce(
        (n, e) => n + e.offsetWidth + 4,
        0,
      );
      const more =
        pr.querySelector<HTMLElement>("[data-more]")?.offsetWidth ?? 120;
      const cs = getComputedStyle(ul);
      const width =
        ul.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const fitsAll = cats.reduce((a, b) => a + b, 0) + utils <= width;
      let count = cats.length;
      if (!fitsAll) {
        let used = 0;
        count = 0;
        for (const w of cats) {
          if (used + w + utils + more + 4 > width) break;
          used += w;
          count++;
        }
      }
      setVisible(Math.max(1, count));
    });
    ro.observe(ul);
    return () => ro.disconnect();
  }, []);

  /** Hover intent: open after 90 ms so sweeping the cursor across the row does not flash panels. */
  const hoverOpen = (slug: string) => {
    if (intent.current) window.clearTimeout(intent.current);
    intent.current = window.setTimeout(() => setOpen(slug), open ? 40 : 90);
  };
  const cancelIntent = () => {
    if (intent.current) window.clearTimeout(intent.current);
    intent.current = null;
  };

  // Staggered reveal of the panel rows (GSAP, subtle tier: 8px / 0.03s).
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || reducedMotion) return;
    const items = el.querySelectorAll("[data-stagger]");
    gsap.fromTo(
      items,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.03,
        ease: "power2.out",
        overwrite: true,
        clearProps: "transform",
      },
    );
  }, [open, reducedMotion]);

  const plaque = (
    c: (typeof navCategories)[number],
    i: number,
    real: boolean,
  ) => {
    const isOpen = open === c.slug;
    return (
      <button
        type="button"
        data-cat=""
        tabIndex={real ? 0 : -1}
        aria-expanded={real ? isOpen : undefined}
        aria-controls={real ? `panel-${c.slug}` : undefined}
        onMouseEnter={real ? () => hoverOpen(c.slug) : undefined}
        onFocus={real ? () => setOpen(c.slug) : undefined}
        onClick={real ? () => setOpen(isOpen ? null : c.slug) : undefined}
        onKeyDown={
          real ? (e) => e.key === "ArrowDown" && setOpen(c.slug) : undefined
        }
        className={`relative whitespace-nowrap font-semibold text-[length:var(--fs-14)] @6xl:text-[length:var(--fs-15)] px-2.5 @6xl:px-3 py-[13px] transition-colors border-b-[3px] ${isOpen ? "text-eu-navy font-bold border-eu-navy" : i === 0 && !open ? "text-eu-navy font-bold border-transparent" : "text-eu-ink-2 border-transparent hover:text-eu-navy hover:border-eu-line-3"}`}
      >
        {c.label}
      </button>
    );
  };
  const utilLink = (u: (typeof navUtility)[number], real: boolean) => (
    <Link
      href={`/${u.slug}`}
      data-util=""
      tabIndex={real ? 0 : -1}
      className={`block whitespace-nowrap font-semibold text-[length:var(--fs-14)] @6xl:text-[length:var(--fs-15)] px-3 py-[13px] border-b-[3px] border-transparent ${u.tone === "offer" ? "text-eu-red font-extrabold hover:border-eu-red" : "text-eu-ink-2 hover:text-eu-navy hover:border-eu-line-3"}`}
    >
      {u.label}
    </Link>
  );
  const moreBtn = (real: boolean) => (
    <button
      type="button"
      data-more=""
      tabIndex={real ? 0 : -1}
      aria-expanded={real ? open === "__more" : undefined}
      onMouseEnter={real ? () => hoverOpen("__more") : undefined}
      onClick={
        real ? () => setOpen(open === "__more" ? null : "__more") : undefined
      }
      className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[length:var(--fs-14)] @6xl:text-[length:var(--fs-15)] px-2.5 py-[13px] border-b-[3px] ${open === "__more" ? "text-eu-navy font-bold border-eu-navy" : "text-eu-ink-2 border-transparent hover:text-eu-navy"}`}
    >
      {c.perissotera} <ChevronDown className="size-4" aria-hidden />
    </button>
  );

  return (
    <nav
      ref={ref}
      aria-label={c.katigories_proionton}
      className="relative bg-white eu-container hidden @lg:block"
      onMouseLeave={() => {
        cancelIntent();
        setOpen(null);
      }}
    >
      <ZoneBadge no={3} />
      {/* Invisible probe row: natural widths of every item */}
      <ul
        ref={probe}
        aria-hidden
        className="absolute invisible pointer-events-none h-0 overflow-hidden flex items-center m-0 p-0 list-none eu-full eu-gutter-wide"
      >
        {navCategories.map((c, i) => (
          <li key={c.slug}>{plaque(c, i, false)}</li>
        ))}
        {navUtility.map((u) => (
          <li key={u.slug}>{utilLink(u, false)}</li>
        ))}
        <li>{moreBtn(false)}</li>
      </ul>
      <ul
        ref={row}
        className="relative z-40 bg-white eu-full eu-gutter-wide flex flex-nowrap items-center gap-x-1 m-0 p-0 list-none"
      >
        {navCategories.slice(0, visible).map((c, i) => (
          <li key={c.slug}>{plaque(c, i, true)}</li>
        ))}
        {overflow.length > 0 && <li>{moreBtn(true)}</li>}
        <li className="flex-1" aria-hidden />
        {navUtility.map((u) => (
          <li key={u.slug}>{utilLink(u, true)}</li>
        ))}
      </ul>

      <AnimatePresence>
        {open === "__more" && overflow.length > 0 && (
          <motion.div
            role="region"
            aria-label={c.perissoteres_katigories}
            initial={reducedMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 top-full z-40 bg-white border-t-[3px] border-eu-navy shadow-[var(--shadow-overlay)]"
          >
            <div className="eu-full eu-gutter-wide py-7 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8">
              {overflow.map((c) => (
                <div key={c.slug}>
                  <Link
                    href={`/k/${c.slug}`}
                    onClick={() => setOpen(null)}
                    className="block font-heading font-bold text-eu-ink text-[length:var(--fs-18)] mb-2 hover:text-eu-blue"
                  >
                    {c.label}
                  </Link>
                  <ul className="m-0 p-0 list-none">
                    {c.children.map((ch) => (
                      <li key={ch.slug}>
                        <Link
                          href={`/k/${c.slug}/${ch.slug}`}
                          onClick={() => setOpen(null)}
                          className="block py-1.5 min-h-9 text-eu-ink-2 text-[length:var(--fs-15)] font-semibold hover:text-eu-blue"
                        >
                          {ch.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrim below the panel: dims the page while a category is open (click closes). */}
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label={c.kleisimo_menoy}
            tabIndex={-1}
            onClick={() => setOpen(null)}
            onMouseEnter={() => {
              cancelIntent();
              setOpen(null);
            }}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 top-[var(--eu-header-h,0px)] z-30 bg-eu-navy/45 backdrop-blur-[2px] cursor-default"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && (
          <motion.div
            key={active.slug}
            id={`panel-${active.slug}`}
            role="region"
            aria-label={active.label}
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={
              reducedMotion
                ? undefined
                : { opacity: 0, y: -6, transition: { duration: 0.12 } }
            }
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 top-full z-40 bg-white border-t-[3px] border-eu-navy shadow-[var(--shadow-overlay)]"
          >
            <div
              ref={panelRef}
              className="eu-full eu-gutter-wide py-7 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)_300px] gap-10"
            >
              {/* A · sub-categories with descriptors */}
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] leading-tight">
                    {active.label}
                  </h2>
                  <span className="text-eu-muted text-[length:var(--fs-14)]">
                    {active.count ? `${active.count} προϊόντα` : ""}
                  </span>
                </div>
                <ul className="m-0 p-0 list-none">
                  {active.children.map((ch) => (
                    <li key={ch.slug} data-stagger="">
                      <Link
                        href={`/k/${active.slug}/${ch.slug}`}
                        onClick={() => setOpen(null)}
                        className="group relative flex items-center gap-3 -mx-3 px-3 py-2 min-h-12 rounded-lg hover:bg-eu-surface focus-visible:bg-eu-surface outline-none transition-colors duration-150"
                      >
                        <span
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-eu-yellow opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight group-hover:text-eu-navy">
                            {ch.name}
                          </span>
                          {SUB_BLURB[ch.slug] && (
                            <span className="block text-eu-muted text-[length:var(--fs-13-5)] leading-snug truncate">
                              {SUB_BLURB[ch.slug]}
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          className="size-4 text-eu-blue shrink-0 opacity-0 -translate-x-1 transition duration-150 group-hover:opacity-100 group-hover:translate-x-0"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/k/${active.slug}`}
                  onClick={() => setOpen(null)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-navy hover:text-white transition-colors duration-150"
                >
                  Όλα τα προϊόντα {active.label.toLowerCase()}{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>

              {/* B · popular products, brands, quick filters, guide */}
              <div className="min-w-0 grid gap-5 content-start">
                {entry && entry.top.length > 0 && (
                  <div>
                    <div className="font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase mb-2">
                      {c.dimofili_tora}
                    </div>
                    <ul className="m-0 p-0 list-none grid gap-1">
                      {entry.top.map((p) => (
                        <li key={p.id} data-stagger="">
                          <Link
                            href={`/proion/${p.slug}`}
                            onClick={() => setOpen(null)}
                            className="group flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-eu-surface transition-colors duration-150"
                          >
                            <ProductImage
                              src={p.image}
                              sizes="56px"
                              className="size-14"
                              rounded="rounded-md"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-eu-muted-2 font-bold text-[length:var(--fs-12)] uppercase tracking-wide">
                                {p.brand}
                              </span>
                              <span className="block font-semibold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-1 group-hover:text-eu-navy">
                                {p.title}
                              </span>
                              <span className="block text-eu-muted text-[length:var(--fs-13)]">
                                {p.rating
                                  ? `★ ${p.rating.value.toLocaleString("el-GR")} · ${p.rating.count}`
                                  : ""}
                              </span>
                            </span>
                            <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] tabular-nums shrink-0">
                              {priceShort(p.price)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-5">
                  {entry && entry.brands.length > 0 && (
                    <div className="min-w-0">
                      <div className="font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase mb-2">
                        {c.markes}
                      </div>
                      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-0.5">
                        {entry.brands.map((b) => (
                          <li key={b.slug}>
                            <Link
                              href={`/proionta?k=${active.slug}&brand=${b.slug}`}
                              onClick={() => setOpen(null)}
                              className="inline-flex items-center min-h-8 text-[length:var(--fs-14)] font-semibold text-eu-ink-2 hover:text-eu-navy"
                            >
                              {b.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {entry?.quick && (
                    <div className="min-w-0">
                      <div className="font-extrabold text-eu-muted text-[length:var(--fs-13)] tracking-wide uppercase mb-2">
                        {entry.quick.key}
                      </div>
                      <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
                        {entry.quick.items.map((qk) => (
                          <li key={qk.href}>
                            <Link
                              href={qk.href}
                              onClick={() => setOpen(null)}
                              className="inline-flex items-center rounded-md bg-eu-surface px-2.5 min-h-8 text-eu-ink text-[length:var(--fs-13-5)] font-semibold hover:bg-eu-chip hover:text-eu-navy transition-colors duration-150"
                            >
                              {qk.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {entry?.guide && (
                  <Link
                    href={entry.guide.href}
                    onClick={() => setOpen(null)}
                    className="group relative flex items-center gap-4 rounded-xl overflow-hidden bg-eu-navy text-white p-3 pr-4 hover:bg-eu-blue transition-colors duration-150"
                  >
                    <span className="relative size-16 rounded-lg overflow-hidden shrink-0">
                      {entry.guide.image && (
                        <Image
                          src={entry.guide.image}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-extrabold text-eu-yellow text-[length:var(--fs-12)] tracking-wide uppercase">
                        <Sparkles className="size-3.5" aria-hidden />{" "}
                        {entry.guide.href.startsWith("/odigos-agoras")
                          ? "Έξυπνος οδηγός αγοράς"
                          : "Οδηγός αγοράς"}
                      </span>
                      <span className="block font-bold text-[length:var(--fs-15)] leading-tight line-clamp-2">
                        {entry.guide.title}
                      </span>
                    </span>
                    <ArrowRight
                      className="size-5 text-eu-yellow shrink-0 transition-transform duration-150 group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                )}
              </div>

              {/* C · promoted product */}
              {entry?.promo ? (
                <div
                  className="rounded-2xl bg-eu-surface p-4 grid gap-2.5 content-start self-start"
                  data-stagger=""
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-extrabold text-[length:var(--fs-12)] tracking-wide uppercase ${entry.promo.wasPrice ? "text-eu-red" : "text-eu-blue"}`}
                    >
                      {entry.promo.wasPrice
                        ? "Η προσφορά της κατηγορίας"
                        : "Επιλογή της εβδομάδας"}
                    </span>
                    {entry.promo.wasPrice && (
                      <span className="rounded-md bg-eu-red text-white font-extrabold text-[length:var(--fs-13)] px-2 py-0.5">
                        −
                        {Math.round(
                          (1 - entry.promo.price / entry.promo.wasPrice) * 100,
                        )}
                        %
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/proion/${entry.promo.slug}`}
                    onClick={() => setOpen(null)}
                    className="block"
                  >
                    <ProductImage
                      src={entry.promo.image}
                      sizes="270px"
                      className="w-full"
                      rounded="rounded-xl"
                    />
                  </Link>
                  <div className="flex items-center justify-between gap-2 text-[length:var(--fs-12)]">
                    <span className="text-eu-muted-2 font-bold uppercase tracking-wide">
                      {entry.promo.brand}
                    </span>
                    {entry.promo.rating && (
                      <span className="text-eu-muted">
                        ★ {entry.promo.rating.value.toLocaleString("el-GR")} ·{" "}
                        {entry.promo.rating.count}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/proion/${entry.promo.slug}`}
                    onClick={() => setOpen(null)}
                    className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-tight line-clamp-2 hover:text-eu-navy"
                  >
                    {entry.promo.title}
                  </Link>
                  <div className="flex items-baseline gap-2">
                    <span className="font-extrabold text-eu-ink text-[length:var(--fs-24)] leading-none tabular-nums">
                      {priceShort(entry.promo.price)}
                    </span>
                    {entry.promo.wasPrice && (
                      <s className="text-eu-muted-2 text-[length:var(--fs-14)] tabular-nums">
                        {priceShort(entry.promo.wasPrice)}
                      </s>
                    )}
                  </div>
                  <div className="text-eu-blue font-bold text-[length:var(--fs-13)]">
                    ή 12 × {priceLong(instalment(entry.promo.price))} χωρίς
                    κάρτα
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pr = entry.promo!;
                      setOpen(null);
                      openQuickBuy(pr);
                    }}
                    className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] min-h-11 hover:bg-eu-yellow-dark transition-colors duration-150"
                  >
                    {c.agora_me_1_klik}
                  </button>
                  <Link
                    href={`/proion/${entry.promo.slug}`}
                    onClick={() => setOpen(null)}
                    className="text-center font-bold text-eu-navy text-[length:var(--fs-14)] min-h-9 inline-flex items-center justify-center hover:underline"
                  >
                    {c.des_to_proion}
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-eu-surface p-4 text-eu-muted text-[length:var(--fs-14)] self-start">
                  {c.syntoma_proionta_se_ayti}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
