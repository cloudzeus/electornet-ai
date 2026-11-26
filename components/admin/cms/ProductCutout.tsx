"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, Scissors, Trash2, X } from "lucide-react";
import { cutoutDecideAction, cutoutPreviewAction } from "@/app/admin/(shell)/cms/home/actions";

type Preview = Awaited<ReturnType<typeof cutoutPreviewAction>>;
/** Φόντα δοκιμής: τα χρώματα των έτοιμων σχεδίων banner. */
const BACK = [{ key: "dark", label: "Μαύρο", cls: "bg-[#05060f]" }, { key: "navy", label: "Μπλε", cls: "bg-eu-navy" }, { key: "yellow", label: "Κίτρινο", cls: "bg-eu-yellow" }] as const;
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue";

/**
 * «Αφαίρεση φόντου» ενός προϊόντος για τα banners: πριν / μετά, δοκιμή πάνω στα χρώματα του banner και επιβεβαίωση.
 * Τίποτα δεν αποθηκεύεται πριν την «Επιβεβαίωση»· η φωτογραφία του καταλόγου δεν αλλάζει ποτέ.
 */
export function ProductCutoutDialog({ id, title, photo, saved, onClose, onDone }: { id: string; title: string; /** η φωτογραφία του καταλόγου */ photo: string | null; /** η φωτογραφία χωρίς φόντο που ισχύει ήδη (null = δεν έχει) */ saved: string | null; onClose: () => void; onDone: (url: string | null) => void }) {
  const [fresh, setFresh] = useState(!saved);
  const [res, setRes] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"keep" | "drop" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!fresh) return;
    let live = true;
    cutoutPreviewAction(id).then((r) => { if (live) setRes(r); }, () => { if (live) setRes({ ok: false, error: "Η αφαίρεση φόντου δεν έγινε. Δοκίμασε ξανά." }); });
    return () => { live = false; };
  }, [id, fresh]);
  const decide = (keep: boolean) => {
    setBusy(keep ? "keep" : "drop"); setErr(null);
    cutoutDecideAction(id, keep).then((r) => { if (r.ok) onDone(r.url); else { setErr(r.error); setBusy(null); } }, () => { setErr("Η αποθήκευση δεν έγινε. Δοκίμασε ξανά."); setBusy(null); });
  };
  return <CutoutView title={title} photo={photo ?? (res?.ok ? res.original : null)} after={fresh ? (res?.ok ? res.src : null) : saved} state={!fresh ? "saved" : !res ? "loading" : res.ok ? (res.clean ? "clean" : "check") : "error"} error={err ?? (fresh && res && !res.ok ? res.error : null)} busy={busy} onClose={onClose} onKeep={() => decide(true)} onDrop={() => decide(false)} onRedo={() => { setRes(null); setFresh(true); }} />;
}

/** Η όψη του παραθύρου, χωρίς κλήσεις στον server. */
export function CutoutView({ title, photo, after, state, error, busy, onClose, onKeep, onDrop, onRedo }: { title: string; photo: string | null; after: string | null; state: "loading" | "clean" | "check" | "error" | "saved"; error: string | null; busy: "keep" | "drop" | null; onClose: () => void; onKeep: () => void; onDrop: () => void; onRedo: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [back, setBack] = useState<(typeof BACK)[number]["key"]>("dark");
  // χωρίς close() στο cleanup: στο StrictMode θα έκλεινε αμέσως (το event close → onClose)
  useEffect(() => { const d = dlg.current; if (d && !d.open) d.showModal(); }, []);
  const frame = "relative aspect-square rounded-lg border border-eu-line overflow-hidden";
  return (
    <dialog ref={dlg} onClose={onClose} aria-labelledby="pcut-title" data-help="home.deals-cutout-dialog" className="m-auto w-[min(44rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-xl p-0 backdrop:bg-eu-ink/45 shadow-[var(--shadow-overlay)]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b border-eu-line px-3 py-2">
        <h3 id="pcut-title" className="m-0 min-w-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)] inline-flex items-start gap-1.5"><Scissors className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span className="line-clamp-2">Αφαίρεση φόντου · {title}</span></h3>
        <button type="button" aria-label="Κλείσιμο" onClick={() => dlg.current?.close()} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface cursor-pointer"><X className="size-4" aria-hidden /></button>
      </div>
      <div className="p-3 grid gap-3 text-[length:var(--fs-14)]">
        <div className={`grid gap-3 ${photo ? "grid-cols-2" : "max-w-[22rem] mx-auto w-full"}`}>
          {photo && <figure className="m-0 grid gap-1 min-w-0 content-start">
            <figcaption className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Πριν</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία από τη βιβλιοθήκη, όπως στη λίστα */}
            <div className={`${frame} bg-white`}><img src={photo} alt="" className="size-full object-contain p-[6%]" /></div>
          </figure>}
          <figure className="m-0 grid gap-1 min-w-0 content-start">
            <figcaption className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">{state === "saved" ? "Τώρα στα banners" : "Μετά · στο banner"}</figcaption>
            <div className={`${frame} ${BACK.find((b) => b.key === back)!.cls}`} aria-busy={state === "loading"}>
              {/* eslint-disable-next-line @next/next/no-img-element -- προεπισκόπηση data: από τον server */}
              {after ? <img src={after} alt="Το προϊόν χωρίς φόντο" className="size-full object-contain p-[6%]" />
                : state === "loading" ? <span className="absolute inset-0 grid place-items-center content-center gap-2 text-white text-[length:var(--fs-13)]"><Loader2 className="size-6 animate-spin" aria-hidden />Βγάζω το φόντο… (μέχρι 20″)</span>
                : <span className="absolute inset-0 grid place-items-center content-center gap-1 p-4 text-center text-white font-bold text-[length:var(--fs-13)]"><AlertTriangle className="size-5" aria-hidden />Δεν βγήκε φωτογραφία</span>}
            </div>
          </figure>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Χρώμα δοκιμής πίσω από το προϊόν">
          <span className="text-eu-muted text-[length:var(--fs-13)]">Δες το πάνω σε:</span>
          {BACK.map((b) => <button key={b.key} type="button" aria-pressed={back === b.key} onClick={() => setBack(b.key)} className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-11 font-bold text-[length:var(--fs-13)] cursor-pointer ${back === b.key ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-navy/50"}`}><span className={`size-4 rounded-full border border-eu-line ${b.cls}`} aria-hidden />{b.label}</button>)}
        </div>
        {state === "clean" && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-green/10 px-3 py-2 text-eu-ink-2"><Check className="size-4 mt-0.5 shrink-0 text-eu-green" aria-hidden /><span><b>Το προϊόν βγήκε ολόκληρο.</b> Δες το και στα άλλα χρώματα και πάτα «Επιβεβαίωση».</span></p>}
        {state === "check" && <p role="alert" className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink-2"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /><span><b>Σύγκρινέ το με το «Πριν».</b> Ο έλεγχος βρήκε ότι μαζί με το φόντο ίσως σβήστηκε και κομμάτι του προϊόντος. Αν λείπει κάτι, πάτα «Ακύρωση»: το προϊόν μένει όπως ήταν, σε λευκό πλαίσιο.</span></p>}
        {error && <p role="alert" className="m-0 rounded-lg bg-eu-red/10 text-eu-red px-3 py-2 font-bold text-[length:var(--fs-13)]">{error}</p>}
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug">Η φωτογραφία του καταλόγου δεν αλλάζει. Η νέα μπαίνει στη βιβλιοθήκη, στον φάκελο «Προϊόντα χωρίς φόντο», και τη δείχνουν όλα τα banners που έχουν αυτό το προϊόν.{state === "saved" ? " Με την «Κατάργηση» το προϊόν ξαναφαίνεται σε λευκό πλαίσιο." : ""}</p>
        <div className="flex flex-wrap justify-end gap-2">
          {state === "saved" ? <>
            <button type="button" disabled={!!busy} onClick={onDrop} className={`${btn} mr-auto border-2 border-eu-red/40 text-eu-red hover:bg-eu-red/10`}>{busy === "drop" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}Κατάργηση</button>
            <button type="button" disabled={!!busy} onClick={onRedo} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}><RotateCcw className="size-4" aria-hidden />Φτιάξ’ την ξανά</button>
            <button type="button" onClick={() => dlg.current?.close()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>Εντάξει</button>
          </> : <>
            <button type="button" onClick={() => dlg.current?.close()} className="rounded-full px-4 min-h-11 font-bold text-eu-ink-2 hover:bg-eu-surface cursor-pointer">Ακύρωση</button>
            <button type="button" disabled={!after || !!busy} onClick={onKeep} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy === "keep" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}Επιβεβαίωση</button>
          </>}
        </div>
      </div>
    </dialog>
  );
}
