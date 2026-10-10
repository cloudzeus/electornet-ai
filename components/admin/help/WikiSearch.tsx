"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, ListChecks, MapPin, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/help/server";

const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const KIND = { page: { t: "Σελίδα", I: FileText }, topic: { t: "Άρθρο", I: BookOpen }, task: { t: "Πώς κάνω", I: ListChecks }, part: { t: "Σημείο σελίδας", I: MapPin } } as const;

/** Αναζήτηση στο wiki καθώς γράφεις (σελίδες, άρθρα, «Πώς κάνω…», σημεία σελίδων)· «/» ή Ctrl/⌘ K για εστίαση. */
export function WikiSearch({ index, autoFocus = false }: { index: SearchEntry[]; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select");
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const hits = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return index.map((e) => {
      const t = norm(e.title), x = norm(`${e.text} ${e.where ?? ""}`);
      if (!words.every((w) => t.includes(w) || x.includes(w))) return null;
      const score = words.reduce((s, w) => s + (t.startsWith(w) ? 6 : t.includes(w) ? 4 : 1), 0) + (e.kind === "page" ? 1 : e.kind === "task" ? 0.5 : 0);
      return { e, score };
    }).filter((x): x is { e: SearchEntry; score: number } => !!x).sort((a, b) => b.score - a.score).slice(0, 12).map((x) => x.e);
  }, [q, index]);
  return (
    <div className="grid gap-2">
      <label className="relative block">
        <span className="sr-only">Αναζήτηση στο wiki</span>
        <Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
        <input ref={input} autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Τι ψάχνεις; π.χ. «προσφορές εβδομάδας», «voucher», «έγκριση»" className="w-full rounded-xl border-2 border-eu-line bg-white pl-11 pr-16 min-h-12 text-[length:var(--fs-16)] focus:border-eu-blue outline-none" />
        <kbd className="hidden @md:inline absolute right-3 top-1/2 -translate-y-1/2 rounded border border-eu-line bg-eu-surface px-1.5 font-mono text-eu-muted text-[length:var(--fs-12)]">/</kbd>
      </label>
      {q.trim() && (
        hits.length ? (
          <ul className="m-0 p-0 list-none grid gap-1 rounded-xl border border-eu-line bg-white p-1.5" aria-live="polite">
            {hits.map((h, i) => { const K = KIND[h.kind]; return (
              <li key={i}><Link href={h.href} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 min-h-12 hover:bg-eu-surface">
                <K.I className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
                <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{h.title}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug line-clamp-1">{K.t}{h.where ? ` · ${h.where}` : ""} · {h.text}</span></span>
              </Link></li>
            ); })}
          </ul>
        ) : <p className="m-0 rounded-xl bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-14)]">Δεν βρέθηκε κάτι με «{q}». Δοκίμασε μια λέξη (π.χ. «αποστολές», «αρχική»), ή δες τις σελίδες παρακάτω.</p>
      )}
    </div>
  );
}
