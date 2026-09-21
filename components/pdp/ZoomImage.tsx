"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

/** Hosts που επιτρέπει το next.config (remotePatterns): μόνο αυτά περνούν από τον βελτιστοποιητή του <Image>. */
export const optimizable = (src: string) => !src.startsWith("http") || /\.b-cdn\.net\/|\/\/www\.euronics\.gr\/|cdn\.brandfetch\.io\//.test(src);

const MAX_ZOOM = 2.5, MIN_USEFUL = 1.25;

/**
 * Κύρια φωτογραφία προϊόντος με μεγέθυνση:
 * - **δείκτης (υπολογιστής):** φακός μέσα στο πλαίσιο — η εικόνα μεγαλώνει γύρω από το σημείο του δείκτη. Η μεγέθυνση δεν
 *   ξεπερνά ποτέ την πραγματική ανάλυση της φωτογραφίας (οι παλιές των 500px δεν «φουσκώνουν» θολές).
 * - **κλικ / άγγιγμα / Enter (όλες οι συσκευές):** πλήρης οθόνη, με βελάκια ανάμεσα στις φωτογραφίες, Esc για κλείσιμο·
 *   στο κινητό δουλεύει το κανονικό τσίμπημα με δύο δάχτυλα.
 */
export function ZoomImage({ images, index, onIndex, alt, className = "", priority = false }: { images: string[]; index: number; onIndex: (i: number) => void; alt: string; className?: string; priority?: boolean }) {
  const src = images[index];
  const box = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [factor, setFactor] = useState(1);
  const [open, setOpen] = useState(false);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !box.current) return;
    const r = box.current.getBoundingClientRect();
    setOrigin(`${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}% ${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  const go = useCallback((d: number) => onIndex((index + d + images.length) % images.length), [index, images.length, onIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, go]);

  const zooming = hover && factor >= MIN_USEFUL;
  return (
    <>
      <button
        ref={box} type="button" onClick={() => setOpen(true)} aria-label={`Μεγέθυνση: ${alt}`}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={() => setHover(false)} onPointerMove={onMove}
        className="group/zoom absolute inset-0 block w-full h-full cursor-zoom-in overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-eu-blue"
      >
        <Image key={src} src={src} alt={alt} fill priority={priority} sizes="(max-width: 1024px) 100vw, 60vw" unoptimized={!optimizable(src)} className={`${className} transition-opacity duration-150 ${zooming ? "opacity-0" : ""}`} />
        {/* Το στρώμα του φακού φορτώνει μόνο όταν χρειαστεί και ζητά μεγαλύτερη εκδοχή· από το πραγματικό της πλάτος βγαίνει πόσο επιτρέπεται να μεγαλώσει */}
        {hover && (
          <Image
            key={`z-${src}`} src={src} alt="" fill sizes="(max-width: 1024px) 200vw, 150vw" unoptimized={!optimizable(src)} aria-hidden
            onLoad={(e) => { const w = box.current?.clientWidth ?? 1; setFactor(Math.min(MAX_ZOOM, (e.currentTarget.naturalWidth || w) / w)); }}
            style={{ transformOrigin: origin, transform: `scale(${zooming ? factor : 1})` }}
            className={`${className} motion-safe:transition-transform motion-safe:duration-150 ${zooming ? "" : "opacity-0"}`}
          />
        )}
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 min-h-9 shadow-[var(--shadow-card)] opacity-100 @lg:opacity-0 group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100 transition-opacity pointer-events-none">
          <ZoomIn className="size-4" aria-hidden /> Μεγέθυνση
        </span>
      </button>

      {/* Portal στο body: ο γονέας έχει CSS transform (εφέ κλίσης), που θα «φυλάκιζε» το position: fixed μέσα στο πλαίσιο της γκαλερί */}
      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label={`${alt} — φωτογραφία ${index + 1} από ${images.length}`} className="fixed inset-0 z-[80] bg-white flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-eu-line">
            <span className="text-eu-ink-3 text-[length:var(--fs-15)] tabular-nums truncate">{alt} · {index + 1} / {images.length}</span>
            <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 shrink-0 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 cursor-pointer"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="relative flex-1 min-h-0 [touch-action:pinch-zoom]">
            <Image key={`l-${src}`} src={src} alt={alt} fill sizes="100vw" unoptimized={!optimizable(src)} className="object-contain p-3 @md:p-8" />
            {images.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Προηγούμενη φωτογραφία" className="absolute left-2 @md:left-5 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white shadow-[var(--shadow-overlay)] border border-eu-line inline-flex items-center justify-center hover:bg-eu-surface cursor-pointer"><ChevronLeft className="size-6" aria-hidden /></button>
                <button type="button" onClick={() => go(1)} aria-label="Επόμενη φωτογραφία" className="absolute right-2 @md:right-5 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white shadow-[var(--shadow-overlay)] border border-eu-line inline-flex items-center justify-center hover:bg-eu-surface cursor-pointer"><ChevronRight className="size-6" aria-hidden /></button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <ul className="m-0 p-3 list-none flex flex-wrap justify-center gap-2 border-t border-eu-line">
              {images.map((im, k) => (
                <li key={im}><button type="button" onClick={() => onIndex(k)} aria-label={`Φωτογραφία ${k + 1}`} aria-current={k === index} className={`relative size-14 rounded-lg border-2 overflow-hidden bg-white cursor-pointer ${k === index ? "border-eu-navy" : "border-eu-line hover:border-eu-blue"}`}><Image src={im} alt="" fill sizes="56px" unoptimized={!optimizable(im)} className="object-contain p-1" /></button></li>
              ))}
            </ul>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
