"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { FIELD_HELP } from "@/lib/promo/help";

/** Το «i» δίπλα σε ένα πεδίο: πατιέται (όχι μόνο hover), κλείνει με Esc ή κλικ έξω. */
export function Hint({ k, text }: { k?: keyof typeof FIELD_HELP | string; text?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();
  const body = text ?? (k ? FIELD_HELP[k] : "");
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!body) return null;
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label="Βοήθεια για αυτό το πεδίο" aria-expanded={open} aria-controls={id} onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="size-7 -my-1 grid place-items-center rounded-full text-eu-blue hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">
        <Info className="size-4" aria-hidden />
      </button>
      {open && (
        <span id={id} role="note" className="absolute z-30 left-0 top-8 w-[min(20rem,80vw)] rounded-xl bg-eu-navy text-white p-3 pr-9 text-[length:var(--fs-14)] font-normal leading-snug shadow-[var(--shadow-overlay)]">
          {body}
          <button type="button" aria-label="Κλείσιμο βοήθειας" onClick={() => setOpen(false)} className="absolute top-1.5 right-1.5 size-7 grid place-items-center rounded-full hover:bg-white/10"><X className="size-4" aria-hidden /></button>
        </span>
      )}
    </span>
  );
}
