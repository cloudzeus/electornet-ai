"use client";

import { useEffect, useMemo, useState } from "react";
import { StickerSvg, stickerAnimationClass, stickerPlacementStyle } from "@/components/stickers/StickerSvg";
import { layoutStickers, type CardSticker, type Placed, type Zone } from "@/lib/stickers/layout";

/**
 * Τα stickers ενός προϊόντος πάνω στη φωτογραφία της κάρτας: διάταξη χωρίς επικαλύψεις (lib/stickers/layout) και, όταν
 * είναι περισσότερα από το όριο, απαλή εναλλαγή στην τελευταία θέση κάθε 3″ — σταματά με «λιγότερη κίνηση».
 */
export function CardStickers({ stickers, max, reserved, scale = 1, idPrefix }: { stickers: CardSticker[]; max: number; reserved: Partial<Record<Zone, boolean>>; scale?: number; idPrefix: string }) {
  const layout = useMemo(() => layoutStickers(stickers, { max, reserved }), [stickers, max, reserved]);
  const [turn, setTurn] = useState(0);
  const n = layout.rotating.length;
  useEffect(() => {
    if (n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setTurn((v) => (v + 1) % n), 3000);
    return () => clearInterval(t);
  }, [n]);
  const one = (p: Placed, i: number, extra?: { visible: boolean }) => {
    const params = { ...p.s.params, x: p.x, y: p.y, size: Math.round(p.s.params.size * scale) };
    return (
      <span key={`${p.s.key}-${i}`} className={`pointer-events-none z-[1] transition-opacity duration-500 ${extra && !extra.visible ? "opacity-0" : "opacity-100"}`} style={stickerPlacementStyle(params)} aria-hidden={extra && !extra.visible ? true : undefined}>
        <StickerSvg p={params} id={`${idPrefix}-${p.s.key}-${i}`} className={stickerAnimationClass[params.animation]} />
      </span>
    );
  };
  return (
    <>
      {layout.placed.map((p, i) => one(p, i))}
      {layout.rotating.map((p, i) => one(p, 100 + i, { visible: i === turn % Math.max(1, n) }))}
    </>
  );
}

/** Όλα τα stickers του προϊόντος σε σειρά (σελίδα προϊόντος) — χωρίς όριο και χωρίς εναλλαγή. */
export function StickerRow({ stickers, idPrefix }: { stickers: CardSticker[]; idPrefix: string }) {
  if (!stickers.length) return null;
  return (
    <ul className="m-0 p-0 list-none flex flex-wrap items-center gap-3" aria-label="Προσφορές και σήματα του προϊόντος">
      {[...stickers].sort((a, b) => a.priority - b.priority).map((s) => (
        <li key={s.key}><StickerSvg p={{ ...s.params, size: Math.min(96, s.params.size), rotate: 0 }} id={`${idPrefix}-${s.key}`} /></li>
      ))}
    </ul>
  );
}
