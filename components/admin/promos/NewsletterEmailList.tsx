"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FileSpreadsheet, Loader2, Trash2, Upload, UserCheck, UserX } from "lucide-react";
import { sx } from "@/components/ui/sx";
import { estimateRecipients, setEmailList } from "@/app/admin/(shell)/prosfores/newsletter/actions";

const n = (v: number) => v.toLocaleString("el-GR");

/**
 * Λίστα διευθύνσεων από Excel / CSV / επικόλληση για ένα newsletter: στέλνεται μόνο σε αυτές, και μόνο σε όσες έχουν
 * συναίνεση. Η μπάρα δείχνει πόσες από τη λίστα θα το λάβουν και πόσες μένουν εκτός. Αποθηκεύεται αμέσως.
 */
export function NewsletterEmailList({ id, count }: { id: string; count: number | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [total, setTotal] = useState(count);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [note, setNote] = useState<{ invalid: string[]; over: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const file = useRef<HTMLInputElement>(null);

  // λίστα που υπήρχε ήδη: πόσες από αυτές θα το λάβουν σήμερα
  useEffect(() => {
    if (count == null) return;
    let on = true;
    void estimateRecipients(id).then((r) => { if (on && r.ok) setRecipients(r.recipients); }).catch(() => {});
    return () => { on = false; };
  }, [id, count]);

  const run = (form: FormData | null) => start(async () => {
    setErr(null); setNote(null);
    const r = await setEmailList(id, form);
    if (!r.ok) { setErr(r.error); return; }
    setTotal(form ? r.total : null); setRecipients(form ? r.recipients : null);
    if (form && (r.invalid.length || r.over)) setNote({ invalid: r.invalid, over: r.over });
    setPaste("");
    router.refresh();
  });

  const out = total != null && recipients != null ? total - recipients : 0;
  const bar = sx({ width: total ? `${Math.round(((recipients ?? 0) / total) * 100)}%` : "0%" });
  return (
    <div data-help="newsletter.list" className="grid gap-3 rounded-xl border border-eu-line p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid min-w-0 flex-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4 text-eu-green" aria-hidden /> Λίστα email από Excel</span>
          <span className="text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">Ανέβασε Excel ή CSV με μία στήλη emails (έως 10.000). Το newsletter πάει μόνο σε αυτές τις διευθύνσεις, και μόνο σε όσες έχουν δώσει συναίνεση.</span>
        </span>
        <input ref={file} type="file" accept=".xlsx,.csv,.txt" className="sr-only" aria-label="Αρχείο με emails" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); run(fd); e.target.value = ""; }} />
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}{busy ? "Διαβάζω…" : total != null ? "Νέο αρχείο" : "Επιλογή αρχείου"}
        </button>
      </div>
      <details>
        <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-8 inline-flex items-center">ή επικόλλησε emails</summary>
        <div className="grid gap-2 pt-1">
          <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Emails, ένα ανά γραμμή" placeholder={"Ένα email ανά γραμμή\nmaria@example.gr\nnikos@example.gr"} className="w-full rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-15)] bg-white font-mono" />
          <button type="button" disabled={busy || !paste.trim()} onClick={() => { const fd = new FormData(); fd.set("paste", paste); run(fd); }} className="justify-self-start rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-chip disabled:opacity-40">Χρήση αυτών των emails</button>
        </div>
      </details>
      {err && <p role="alert" className="m-0 flex items-start gap-2 rounded-xl bg-eu-red/10 px-3 py-2 text-eu-red font-bold text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{err}</p>}
      {total != null && (
        <div role="status" className="grid gap-2 rounded-xl bg-eu-surface p-3">
          {bar.node}
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Λίστα με {n(total)} {total === 1 ? "διεύθυνση" : "διευθύνσεις"}</span>
          {recipients != null && (
            <>
              <span className="block h-3 rounded-full bg-eu-amber/40 overflow-hidden" aria-hidden><span className={`block h-full rounded-full bg-eu-green ${bar.className}`} /></span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)]">
                <span className="inline-flex items-center gap-1.5 font-bold text-eu-green"><UserCheck className="size-4" aria-hidden /> {n(recipients)} θα το λάβουν</span>
                {out > 0 && <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink-2"><UserX className="size-4 text-eu-amber" aria-hidden /> {n(out)} μένουν εκτός</span>}
              </span>
              {out > 0 && <span className="text-eu-ink-3 text-[length:var(--fs-12)] leading-snug">Μένουν εκτός όσες διευθύνσεις δεν έχουν εγγραφεί στο newsletter ή δεν δέχονται προσφορές, και όσες έχουν διαγραφεί. Ο νόμος δεν επιτρέπει αποστολή χωρίς συναίνεση.</span>}
              {recipients === 0 && <span className="font-bold text-eu-red text-[length:var(--fs-13)]">Καμία διεύθυνση της λίστας δεν έχει συναίνεση — το newsletter δεν θα σταλεί σε κανέναν.</span>}
            </>
          )}
          {note && (note.invalid.length > 0 || note.over > 0) && (
            <span className="text-eu-ink-2 text-[length:var(--fs-12)] leading-snug break-words">
              {note.over > 0 && <>Το αρχείο είχε {n(note.over)} διευθύνσεις πάνω από το όριο των 10.000 και δεν μπήκαν. </>}
              {note.invalid.length > 0 && <>Δεν είναι έγκυρα emails και αγνοήθηκαν: <span className="font-mono">{note.invalid.slice(0, 12).join(" · ")}</span>{note.invalid.length > 12 ? " …" : ""}</>}
            </span>
          )}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Να αφαιρεθεί η λίστα; Το newsletter θα πηγαίνει ξανά σε όλο το κοινό που έχεις διαλέξει παραπάνω.")) run(null); }} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-ink-2 text-[length:var(--fs-13)] hover:border-eu-red hover:text-eu-red disabled:opacity-50"><Trash2 className="size-3.5" aria-hidden /> Αφαίρεση λίστας</button>
        </div>
      )}
    </div>
  );
}
