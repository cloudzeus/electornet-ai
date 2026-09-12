"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

/**
 * Site-wide liveliness: on every page except the home (whose zones reveal
 * themselves), each top-level <section>/<article>/<aside> inside <main>
 * rises into view the first time it is scrolled to; whatever is already on
 * screen at load is left as it is (no flicker). Nested sections are left
 * to their parent.
 * Transform/opacity only, once per element, off under reduced motion.
 */
export function AutoReveal() {
  const path = usePathname();
  useLayoutEffect(() => {
    if (path === "/" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("main");
    if (!main) return;
    const all = Array.from(main.querySelectorAll<HTMLElement>("section, article, aside, [data-auto-reveal]"));
    const vh = window.innerHeight;
    const targets = all.filter((el) => !el.closest("[data-no-reveal]") && !all.some((o) => o !== el && o.contains(el)) && !el.hasAttribute("data-reveal") && el.getBoundingClientRect().top > vh * 0.92);
    if (!targets.length) return;
    gsap.set(targets, { opacity: 0, y: 16 });
    let order = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          gsap.to(el, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", delay: Math.min(0.24, order++ * 0.06), clearProps: "transform", overwrite: true });
        }
        setTimeout(() => {
          order = 0;
        }, 300);
      },
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => {
      io.disconnect();
      gsap.set(targets, { clearProps: "all" });
    };
  }, [path]);
  return null;
}
