"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, BookOpen, ChevronDown, CircleHelp, ExternalLink, Lightbulb, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { pageHelpAction } from "@/app/admin/(shell)/help/actions";
import { setHotspots, showHelpPart } from "./HelpSpotlight";

type Help = Awaited<ReturnType<typeof pageHelpAction>>;
const day = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" });

/**
 * «Βοήθεια» σε κάθε σελίδα της διαχείρισης (κουμπί στην κεφαλίδα ή F1): τι κάνει η σελίδα, τα σημεία της με
 * «Δείξε μου», «Πώς κάνω…» βήματα, συμβουλές, σχετικές σελίδες, τι άλλαξε πρόσφατα, και το wiki.
 */
export function HelpDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState<Help | undefined>(undefined);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "F1") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!open || loadedFor === pathname) return;
    let live = true;
    void pageHelpAction(pathname).then((h) => { if (live) { setHelp(h); setLoadedFor(pathname); } });
    return () => { live = false; };
  }, [open, pathname, loadedFor]);
  useEffect(() => { const d = ref.current; if (open && d && !d.open) d.showModal(); if (!open && d?.open) d.close(); }, [open]);

  const page = help?.page ?? null;
  const parts = page?.parts ?? [];
  const loading = open && loadedFor !== pathname;
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Βοήθεια για αυτή τη σελίδα (F1)" className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-10 text-eu-blue font-bold text-[length:var(--fs-14)] hover:bg-eu-surface">
        <CircleHelp className="size-4" aria-hidden /><span className="hidden @md:inline">Βοήθεια</span>
      </button>
      <dialog ref={ref} onClose={close} onCancel={close} aria-label="Βοήθεια" className="m-0 ml-auto h-dvh max-h-dvh w-[min(30rem,100vw)] max-w-[100vw] p-0 bg-white backdrop:bg-black/30 @container">
        <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] h-full">
          <header className="flex items-start gap-2 px-4 py-3 border-b border-eu-line">
            <CircleHelp className="size-5 mt-0.5 text-eu-blue shrink-0" aria-hidden />
            <div className="grid min-w-0 flex-1">
              <span className="text-eu-muted text-[length:var(--fs-12)] font-bold uppercase tracking-wide">{help?.gen.group ?? "Βοήθεια"}</span>
              <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight">{help?.gen.title ?? "Βοήθεια"}</h2>
            </div>
            <button type="button" onClick={close} aria-label="Κλείσιμο" className="size-10 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
          </header>

          <div className="overflow-y-auto px-4 py-3 grid gap-4 content-start">
            {loading ? <span className="inline-flex items-center gap-2 text-eu-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</span> : !help ? (
              <p className="m-0 text-eu-muted">Δεν υπάρχει οδηγός για αυτή τη σελίδα. Δες το wiki.</p>
            ) : (
              <>
                <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">{page?.summary ?? help.gen.doc}{!page && <span className="ml-1 rounded-full bg-eu-surface px-2 py-0.5 text-eu-muted text-[length:var(--fs-12)] font-bold align-middle">αυτόματος οδηγός</span>}</p>

                {parts.length > 0 && (
                  <section className="grid gap-1.5" aria-labelledby="h-parts">
                    <div className="flex items-center gap-2">
                      <h3 id="h-parts" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide flex-1">Σε αυτή τη σελίδα</h3>
                      <button type="button" onClick={() => { setHotspots(parts); close(); }} className="inline-flex items-center gap-1 rounded-full bg-eu-yellow text-eu-navy px-3 h-9 font-extrabold text-[length:var(--fs-13)] hover:brightness-95"><MapPin className="size-4" aria-hidden /> Σημεία βοήθειας</button>
                    </div>
                    <ol className="m-0 p-0 list-none grid gap-1">
                      {parts.map((p, i) => (
                        <li key={p.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 rounded-lg bg-eu-surface/70 px-2.5 py-2">
                          <span className="size-6 rounded-full bg-eu-navy text-white grid place-items-center font-extrabold text-[length:var(--fs-12)]" aria-hidden>{i + 1}</span>
                          <span className="grid gap-0.5 min-w-0">
                            <span className="flex items-center gap-2"><b className="text-eu-ink text-[length:var(--fs-14)] flex-1">{p.title}</b><button type="button" onClick={() => { close(); setTimeout(() => showHelpPart(p), 150); }} className="shrink-0 rounded-full px-2 h-7 font-bold text-eu-blue text-[length:var(--fs-12)] hover:bg-white">Δείξε μου</button></span>
                            <span className="text-eu-ink-2 text-[length:var(--fs-13)] leading-snug">{p.text}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {page?.tasks?.length ? (
                  <section className="grid gap-1.5" aria-labelledby="h-tasks">
                    <h3 id="h-tasks" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Πώς κάνω…</h3>
                    {page.tasks.map((t, i) => (
                      <details key={t.title} open={i === 0} className="group rounded-lg border border-eu-line">
                        <summary className="list-none cursor-pointer flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]">{t.title}<ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden /></summary>
                        <ol className="m-0 pl-8 pr-3 pb-3 grid gap-1 text-eu-ink-2 text-[length:var(--fs-14)] leading-snug">{t.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                        {t.link && <Link href={t.link.href} onClick={close} className="mx-3 mb-3 inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline">{t.link.label} <ArrowRight className="size-3.5" aria-hidden /></Link>}
                      </details>
                    ))}
                  </section>
                ) : null}

                {page?.tips?.length ? (
                  <ul className="m-0 p-0 list-none grid gap-1.5">
                    {page.tips.map((t) => <li key={t} className="flex items-start gap-2 rounded-lg bg-eu-chip/60 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)] leading-snug"><Lightbulb className="size-4 mt-px shrink-0 text-eu-blue" aria-hidden />{t}</li>)}
                  </ul>
                ) : null}

                {page?.related?.length ? (
                  <section className="grid gap-1" aria-labelledby="h-rel">
                    <h3 id="h-rel" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Σχετικά</h3>
                    <div className="flex flex-wrap gap-1.5">{page.related.map((r) => <Link key={r.href} href={r.href} onClick={close} className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-3 h-9 font-bold text-eu-navy text-[length:var(--fs-13)] hover:bg-eu-navy hover:text-white">{r.label}</Link>)}</div>
                  </section>
                ) : null}

                {help.gen.changes.length > 0 && (
                  <section className="grid gap-1" aria-labelledby="h-new">
                    <h3 id="h-new" className="m-0 inline-flex items-center gap-1.5 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide"><Sparkles className="size-3.5" aria-hidden /> Τι άλλαξε πρόσφατα</h3>
                    <ul className="m-0 p-0 list-none grid gap-1">{help.gen.changes.map((c) => <li key={c.hash} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 text-[length:var(--fs-13)]"><span className="text-eu-muted tabular-nums">{day(c.date)}</span><span className="text-eu-ink-2 leading-snug">{c.text}</span></li>)}</ul>
                  </section>
                )}
              </>
            )}
          </div>

          <footer className="flex flex-wrap items-center gap-2 border-t border-eu-line px-4 py-2.5">
            {help && <Link href={`/admin/help/p/${help.gen.slug}`} onClick={close} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue"><BookOpen className="size-4" aria-hidden /> Πλήρης οδηγός{help.gen.shots.desktop ? " με εικόνες" : ""}</Link>}
            <Link href="/admin/help" onClick={close} className="inline-flex items-center gap-1 rounded-full px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-surface">Όλο το wiki <ExternalLink className="size-3.5" aria-hidden /></Link>
          </footer>
        </div>
      </dialog>
    </>
  );
}
