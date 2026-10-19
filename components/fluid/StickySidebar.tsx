"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { sx } from "@/components/ui/sx";

/**
 * Smart sticky column (filters, buy box) without an inner scrollbar.
 *  · Fits in the viewport → sticks to the top.
 *  · Taller than the viewport → scrolls with the page; when its bottom
 *    reaches the viewport bottom it pins there, so the customer reads it
 *    to the end while scrolling down. Scrolling up, it unpins in place
 *    and re-pins to the top when its top comes into view.
 * Parent must be the full-height column (flex item with items-stretch).
 */
export function StickySidebar({ children, top: topProp, gap = 16, className = "" }: { children: ReactNode; top?: number; gap?: number; className?: string }) {
  const col = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // αρχική θέση ως κλάση (στον server)· οι αλλαγές στο scroll απευθείας στο element.style (χωρίς render)
  const initial = sx({ position: "sticky", top: topProp ?? 16 });

  useEffect(() => {
    const c = col.current;
    const b = box.current;
    if (!c || !b) return;
    /** Offset below the pinned header (`--eu-header-h`) plus a small gap. */
    const headerH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--eu-header-h")) || 0;
    const topNow = () => topProp ?? headerH() + gap;
    let lastY = window.scrollY;
    let state: "top" | "bottom" | "free" = "top";
    let freeOffset = 0;
    const apply = () => {
      const set = (position: string, top: number) => { b.style.position = position; b.style.top = `${top}px`; };
      if (state === "top") set("sticky", topNow());
      else if (state === "bottom") set("sticky", window.innerHeight - b.offsetHeight - gap);
      else set("relative", freeOffset);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const down = y > lastY;
      lastY = y;
      const vh = window.innerHeight;
      const h = b.offsetHeight;
      const top = topNow();
      if (h + top + gap <= vh) {
        if (state !== "top") {
          state = "top";
          apply();
        }
        return;
      }
      const r = b.getBoundingClientRect();
      const colTop = c.getBoundingClientRect().top;
      if (down) {
        if (state !== "bottom") {
          if (r.bottom <= vh - gap + 1) {
            state = "bottom";
            apply();
          } else if (state === "top") {
            state = "free";
            freeOffset = r.top - colTop;
            apply();
          }
        }
      } else if (state !== "top") {
        if (r.top >= top - 1) {
          state = "top";
          apply();
        } else if (state === "bottom") {
          state = "free";
          freeOffset = r.top - colTop;
          apply();
        }
      }
    };
    const onResize = () => {
      state = "top";
      apply();
      onScroll();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(b);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [topProp, gap]);

  return (
    <div ref={col} className={`self-stretch ${className}`}>
      {initial.node}
      <div ref={box} className={initial.className}>
        {children}
      </div>
    </div>
  );
}
