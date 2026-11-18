"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArchiveRestore, Check, CircleAlert, CircleCheck, EyeOff, House, Loader2, Plus, Trash2 } from "lucide-react";
import { bulkAction, homeSpotsAction, placeOnHomeAction } from "@/app/admin/(shell)/prosfores/actions";

type Spots = Awaited<ReturnType<typeof homeSpotsAction>>;
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer disabled:opacity-50";

/**
 * «Βάλε την στην αρχική» με ένα πάτημα: ο χρήστης διαλέγει σημείο από λίστα (η ενότητα «Προσφορές της εβδομάδας» ή νέα
 * σειρά κάτω από μια ενότητα) και πατά ένα κουμπί — χωρίς να ανοίξει τον editor της αρχικής. Με το ίδιο κουμπί τη βγάζει.
 */
export function HomePlacer({ id, live }: { id: string; live: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Spots | null>(null);
  const [spot, setSpot] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    void homeSpotsAction(id).then((r) => { if (on) setData(r); }).catch(() => { if (on) setData({ spots: [], canWrite: false, canPublish: false }); });
    return () => { on = false; };
  }, [id, tick]);

  const run = (to: string | null, remove = false) => start(async () => {
    setMsg(null);
    const r = await placeOnHomeAction(id, to, remove);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: to && !remove
      ? r.live ? `Μπήκε στην αρχική.${live ? " Οι πελάτες τη βλέπουν μέσα σε 1 λεπτό." : " Θα φανεί μόλις η προσφορά γίνει ενεργή."}` : "Μπήκε στο πρόχειρο της αρχικής. Θα φανεί όταν τη δημοσιεύσει κάποιος με δικαίωμα δημοσίευσης."
      : r.live ? (to ? "Βγήκε από αυτό το σημείο της αρχικής. Οι πελάτες το βλέπουν μέσα σε 1 λεπτό." : "Βγήκε από όλα τα σημεία της αρχικής.") : "Βγήκε από το πρόχειρο της αρχικής. Η αλλαγή θα φανεί με την επόμενη δημοσίευση της αρχικής." });
    setTick((t) => t + 1);
    router.refresh();
  });

  if (!data) return <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Κοιτάζω την αρχική…</p>;
  const here = data.spots.filter((s) => s.here), cur = data.spots.find((s) => s.key === spot && !s.off && !s.here) ?? null;
  const deals = data.spots.find((s) => s.key === "deals"), top = data.spots.find((s) => s.key === "top");
  const rows = data.spots.filter((s) => s.section);
  const can = data.canWrite;

  /** Ένα σημείο του χάρτη όπου μπαίνει σειρά προϊόντων: κενό (διαλέγεται), επιλεγμένο, ήδη πιασμένο από την προσφορά ή κλειστό. */
  const slot = (s: Spots["spots"][number]) => s.here ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 border-eu-green bg-eu-green/10 pl-3 pr-1.5 py-1.5">
      <span className="flex flex-1 basis-40 items-center gap-2 text-eu-green font-bold text-[length:var(--fs-14)]"><CircleCheck className="size-4 shrink-0" aria-hidden />Η προσφορά είναι εδώ</span>
      {can && <button type="button" disabled={busy} onClick={() => run(s.key, true)} aria-label={`Αφαίρεση από την αρχική: ${s.label}`} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-red text-[length:var(--fs-13)] hover:border-eu-red cursor-pointer disabled:opacity-50"><Trash2 className="size-4" aria-hidden />Αφαίρεση</button>}
    </div>
  ) : s.off ? null : (
    <button type="button" disabled={!can || busy} aria-pressed={cur?.key === s.key} aria-label={s.label} onClick={() => setSpot(s.key)}
      className={`w-full rounded-lg border-2 px-3 min-h-11 flex items-center gap-2 text-left font-bold text-[length:var(--fs-14)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${cur?.key === s.key ? "border-eu-navy bg-eu-navy text-white" : "border-dashed border-eu-blue/50 text-eu-blue hover:border-eu-navy hover:bg-eu-chip"}`}>
      {cur?.key === s.key ? <><Check className="size-4 shrink-0" aria-hidden />Εδώ θα μπει η σειρά της προσφοράς<span aria-hidden className="ml-auto hidden @md:flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="h-5 w-7 rounded bg-white/30" />)}</span></> : <><Plus className="size-4 shrink-0" aria-hidden />Βάλε τη σειρά εδώ</>}
    </button>
  );

  return (
    <div data-help="promo.home-place" className="grid gap-3 rounded-xl bg-white border-2 border-eu-navy/20 p-3 @md:p-4 @container">
      <div className="grid gap-0.5">
        <h5 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><House className="size-5 text-eu-blue" aria-hidden /> Βάλε την στην αρχική σελίδα</h5>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Από κάτω είναι η αρχική του site, από πάνω προς τα κάτω. Πάτα το σημείο όπου θέλεις να μπει η προσφορά και μετά το κουμπί «Εφαρμογή».</p>
      </div>
      {!can && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />Δεν έχεις δικαίωμα να αλλάζεις την αρχική. Ζήτα το από τον διαχειριστή.</p>}

      <div role="group" aria-label="Η αρχική σελίδα του site" className="grid gap-1.5 rounded-xl border border-eu-line bg-eu-surface/60 p-2 @md:p-3">
        <span className="flex items-center gap-1.5 text-eu-muted font-bold text-[length:var(--fs-12)]"><span aria-hidden className="flex gap-1"><span className="size-2 rounded-full bg-eu-line-3" /><span className="size-2 rounded-full bg-eu-line-3" /><span className="size-2 rounded-full bg-eu-line-3" /></span>euronics.gr · αρχική</span>
        {top && slot(top)}
        {rows.map((s) => {
          const isDeals = s.key === "after:deals" && deals;
          const dealsOn = isDeals && cur?.key === "deals";
          return (
            <div key={s.key} className="grid gap-1.5">
              {s.off ? (
                <div className="rounded-lg border border-dashed border-eu-line bg-white/50 px-3 py-2 flex flex-wrap items-center gap-x-2 text-eu-muted text-[length:var(--fs-13)]"><EyeOff className="size-4 shrink-0" aria-hidden /><span className="line-through">{s.section}</span><span>κρυμμένη στο site · δεν μπαίνει σειρά κάτω της</span></div>
              ) : isDeals ? (
                <div className={`rounded-lg border-2 bg-white p-2.5 grid gap-2 ${deals.here ? "border-eu-green" : dealsOn ? "border-eu-navy" : "border-eu-line"}`}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><b className="text-eu-ink text-[length:var(--fs-14)]">{s.section}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">έτοιμη ενότητα με αντίστροφη μέτρηση · χωρά μία προσφορά</span></span>
                  {deals.here ? (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-eu-green/10 pl-3 pr-1.5 py-1.5">
                      <span className="flex flex-1 basis-40 items-center gap-2 text-eu-green font-bold text-[length:var(--fs-14)]"><CircleCheck className="size-4 shrink-0" aria-hidden />Δείχνει αυτή την προσφορά</span>
                      {can && <button type="button" disabled={busy} onClick={() => run("deals", true)} aria-label="Αφαίρεση από την ενότητα «Προσφορές της εβδομάδας»" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-red text-[length:var(--fs-13)] hover:border-eu-red cursor-pointer disabled:opacity-50"><Trash2 className="size-4" aria-hidden />Αφαίρεση</button>}
                    </div>
                  ) : (
                    <button type="button" disabled={!can || busy} aria-pressed={!!dealsOn} onClick={() => setSpot("deals")} className={`w-full rounded-lg border-2 px-3 min-h-11 flex items-center gap-2 text-left font-bold text-[length:var(--fs-14)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${dealsOn ? "border-eu-navy bg-eu-navy text-white" : "border-dashed border-eu-blue/50 text-eu-blue hover:border-eu-navy hover:bg-eu-chip"}`}>
                      {dealsOn ? <Check className="size-4 shrink-0" aria-hidden /> : <Plus className="size-4 shrink-0" aria-hidden />}{dealsOn ? "Η ενότητα θα δείχνει αυτή την προσφορά" : deals.taken ? `Δείχνει τώρα «${deals.taken}» · βάλε αυτήν στη θέση της` : "Δείξε εδώ αυτή την προσφορά"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-eu-line bg-white px-3 py-2 text-eu-ink-2 font-semibold text-[length:var(--fs-14)]">{s.section}</div>
              )}
              {slot(s)}
            </div>
          );
        })}
      </div>

      {can && (
        <div className="grid gap-2">
          {cur?.key === "deals" && deals?.taken && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /><span>Η ενότητα δείχνει τώρα την προσφορά <b>«{deals.taken}»</b> και χωρά μία: αν συνεχίσεις, αυτή παίρνει τη θέση της. Για να φαίνονται και οι δύο, διάλεξε ένα «Βάλε τη σειρά εδώ».</span></p>}
          {!data.canPublish && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν έχεις δικαίωμα δημοσίευσης της αρχικής: η αλλαγή μπαίνει στο πρόχειρό της και φαίνεται όταν τη δημοσιεύσει κάποιος που έχει.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !cur} onClick={() => cur && run(cur.key)} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}Εφαρμογή στο επιλεγμένο σημείο</button>
            {!cur && <span className="text-eu-ink-3 text-[length:var(--fs-14)]">Πάτα πρώτα ένα σημείο στον χάρτη από πάνω.</span>}
            {here.length > 1 && <button type="button" disabled={busy} onClick={() => run(null)} className={`${btn} border-2 border-eu-line bg-white text-eu-red hover:border-eu-red`}><Trash2 className="size-4" aria-hidden />Βγάλε την από όλα τα σημεία</button>}
          </div>
        </div>
      )}
      {here.length > 0 && <a href="/" target="_blank" rel="noopener noreferrer" className="justify-self-start font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Δες την αρχική του site (νέα καρτέλα)</a>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 rounded-lg px-3 py-2 font-bold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}

/** Προσφορά στο αρχείο: εξήγηση και επαναφορά με ένα πάτημα (γυρίζει πρόχειρη, για έλεγχο ημερομηνιών και δημοσίευση). */
export function ArchivedBanner({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div data-help="promo.restore" role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-eu-amber/60 bg-eu-amber/10 p-3 @md:p-4">
      <span className="grid flex-1 basis-64 min-w-0"><b className="text-eu-ink text-[length:var(--fs-16)]">Αυτή η προσφορά είναι στο αρχείο</b><span className="text-eu-ink-2 text-[length:var(--fs-14)]">Δεν τρέχει και δεν αλλάζει. Με την επαναφορά γίνεται πρόχειρη: βάζεις νέες ημερομηνίες και τη δημοσιεύεις ξανά.</span>{err && <span className="text-eu-red font-bold text-[length:var(--fs-14)]">{err}</span>}</span>
      <button type="button" disabled={busy} onClick={() => start(async () => { const r = await bulkAction([id], "restore"); if (r.changed) router.replace(`/admin/prosfores/${id}?step=3`); else setErr("Δεν έγινε η επαναφορά. Δοκίμασε ξανά."); router.refresh(); })} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}Επαναφορά από το αρχείο</button>
    </div>
  );
}
