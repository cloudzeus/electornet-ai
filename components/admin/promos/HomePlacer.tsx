"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArchiveRestore, Check, CircleAlert, CircleCheck, House, Loader2, Trash2 } from "lucide-react";
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
  const [spot, setSpot] = useState("deals");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    void homeSpotsAction(id).then((r) => { if (on) setData(r); }).catch(() => { if (on) setData({ spots: [], canWrite: false, canPublish: false }); });
    return () => { on = false; };
  }, [id, tick]);

  const run = (to: string | null) => start(async () => {
    setMsg(null);
    const r = await placeOnHomeAction(id, to);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: to
      ? r.live ? `Μπήκε στην αρχική.${live ? " Οι πελάτες τη βλέπουν σε λίγα δευτερόλεπτα." : " Θα φανεί μόλις η προσφορά γίνει ενεργή."}` : "Μπήκε στο πρόχειρο της αρχικής. Θα φανεί όταν τη δημοσιεύσει κάποιος με δικαίωμα δημοσίευσης."
      : r.live ? "Βγήκε από την αρχική." : "Βγήκε από το πρόχειρο της αρχικής. Η αλλαγή θα φανεί με την επόμενη δημοσίευση της αρχικής." });
    setTick((t) => t + 1);
    router.refresh();
  });

  if (!data) return <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)] min-h-11"><Loader2 className="size-4 animate-spin" aria-hidden /> Κοιτάζω την αρχική…</p>;
  const here = data.spots.filter((s) => s.here), cur = data.spots.find((s) => s.key === spot);

  return (
    <div data-help="promo.home-place" className="grid gap-3 rounded-xl bg-white border-2 border-eu-navy/20 p-3 @md:p-4">
      <div className="grid gap-0.5">
        <h5 className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><House className="size-5 text-eu-blue" aria-hidden /> Βάλε την στην αρχική σελίδα</h5>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Διάλεξε σημείο και πάτα το κουμπί. Τα προϊόντα του καλαθιού της εμφανίζονται εκεί μόνα τους, όσο τρέχει η προσφορά.</p>
      </div>
      {here.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-1.5">
          {here.map((s) => <li key={s.key} className="flex items-start gap-2 rounded-lg bg-eu-green/10 px-3 py-2 text-eu-green font-bold text-[length:var(--fs-14)]"><CircleCheck className="size-4 mt-0.5 shrink-0" aria-hidden />Είναι ήδη στην αρχική: {s.label}</li>)}
        </ul>
      )}
      {!data.canWrite ? <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />Δεν έχεις δικαίωμα να αλλάζεις την αρχική. Ζήτα το από τον διαχειριστή.</p> : (
        <>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2">Σε ποιο σημείο;
            <select value={spot} onChange={(e) => setSpot(e.target.value)} className="w-full rounded-xl border-2 border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus-visible:border-eu-blue">
              {data.spots.map((s) => <option key={s.key} value={s.key}>{s.label}{s.here ? " — είναι ήδη εδώ" : ""}</option>)}
            </select>
          </label>
          {cur?.taken && <p className="m-0 flex items-start gap-2 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden /><span>Εκεί είναι τώρα η προσφορά <b>«{cur.taken}»</b>. Η ενότητα χωρά μία προσφορά: αν συνεχίσεις, αυτή παίρνει τη θέση της. Για να φαίνονται και οι δύο, διάλεξε «Νέα σειρά».</span></p>}
          {!data.canPublish && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Δεν έχεις δικαίωμα δημοσίευσης της αρχικής: η αλλαγή μπαίνει στο πρόχειρό της και φαίνεται όταν τη δημοσιεύσει κάποιος που έχει.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || cur?.here} onClick={() => run(spot)} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}{cur?.here ? "Είναι ήδη εδώ" : "Βάλε την εδώ"}</button>
            {here.length > 0 && <button type="button" disabled={busy} onClick={() => run(null)} className={`${btn} border-2 border-eu-line bg-white text-eu-red hover:border-eu-red`}><Trash2 className="size-4" aria-hidden />Βγάλε την από την αρχική</button>}
          </div>
        </>
      )}
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
