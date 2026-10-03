"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle, Info, Lightbulb, AlertTriangle, ListOrdered, X } from "lucide-react";
import { FIELD_HELP, type HelpTopic } from "@/lib/promo/help";

/**
 * «Τι κάνω εδώ;» — η βοήθεια κάθε σελίδας / βήματος. Ανοιχτή την πρώτη φορά· αν ο χρήστης την κλείσει, μένει κλειστή
 * σε αυτή τη σελίδα (θυμάται ο browser). Χωρίς setState στο effect: το <details> ανοίγει/κλείνει από το DOM.
 */
export function HelpPanel({ id, topic, compact = false }: { id: string; topic: HelpTopic; compact?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const key = `eu.help.${id}`;
  useEffect(() => {
    // κλειστό αν το έκλεισε ο χρήστης — και εξ ορισμού σε στενή οθόνη, για να φαίνεται πρώτα η δουλειά
    try { const v = localStorage.getItem(key); if (ref.current && (v === "closed" || (v == null && ref.current.getBoundingClientRect().width < 640))) ref.current.open = false; } catch { /* χωρίς αποθήκευση */ }
  }, [key]);
  const onToggle = () => { try { localStorage.setItem(key, ref.current?.open ? "open" : "closed"); } catch { /* χωρίς αποθήκευση */ } };
  return (
    <details ref={ref} open onToggle={onToggle} className="group rounded-2xl border border-eu-blue/25 bg-eu-chip/60 open:bg-eu-chip">
      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 min-h-12 font-extrabold text-eu-navy text-[length:var(--fs-15)] [&::-webkit-details-marker]:hidden">
        <HelpCircle className="size-5 text-eu-blue shrink-0" aria-hidden />
        <span className="flex-1">Τι κάνω εδώ; <span className="font-semibold text-eu-ink-2">· {topic.title}</span></span>
        <span className="text-eu-blue font-bold text-[length:var(--fs-13)] group-open:hidden">Άνοιγμα</span>
        <span className="text-eu-blue font-bold text-[length:var(--fs-13)] hidden group-open:inline">Κλείσιμο</span>
      </summary>
      <div className={`px-4 pb-4 grid gap-3 ${compact ? "" : "@4xl:grid-cols-2"} text-[length:var(--fs-14)] text-eu-ink-2 leading-relaxed`}>
        <p className="m-0 @4xl:col-span-2 text-eu-ink text-[length:var(--fs-15)]">{topic.what}</p>
        {topic.steps && (
          <div className="grid gap-1">
            <span className="font-bold text-eu-navy inline-flex items-center gap-1.5"><ListOrdered className="size-4" aria-hidden /> Βήματα</span>
            <ol className="m-0 pl-5 grid gap-1">{topic.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        )}
        {topic.tips && (
          <div className="grid gap-1">
            <span className="font-bold text-eu-green inline-flex items-center gap-1.5"><Lightbulb className="size-4" aria-hidden /> Καλό να ξέρεις</span>
            <ul className="m-0 pl-5 grid gap-1">{topic.tips.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {topic.watch && (
          <div className="grid gap-1">
            <span className="font-bold text-eu-amber inline-flex items-center gap-1.5"><AlertTriangle className="size-4" aria-hidden /> Προσοχή</span>
            <ul className="m-0 pl-5 grid gap-1">{topic.watch.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {topic.example && <p className="m-0"><span className="font-bold text-eu-navy">Παράδειγμα:</span> {topic.example}</p>}
        <Link href="/admin/prosfores/voitheia" className="justify-self-start font-bold text-eu-blue hover:underline min-h-10 inline-flex items-center @4xl:col-span-2">Οδηγοί βήμα-βήμα, γλωσσάρι και συχνές ερωτήσεις →</Link>
      </div>
    </details>
  );
}

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
