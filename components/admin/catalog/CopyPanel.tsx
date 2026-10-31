"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Database, RotateCcw } from "lucide-react";
import { draftCopyAction, saveCopyAction } from "@/app/admin/(shell)/catalog/enrich-actions";

type Draft = { short: string; long: string; examples: string[]; specCount: number; costUsd: number; model: string };

/**
 * «Περιγραφή με AI»: πρόχειρο σύντομης και αναλυτικής περιγραφής σε γλώσσα marketing, από το όνομα, την κατηγορία και τα
 * χαρακτηριστικά, με ύφος από περιγραφές της ίδιας κατηγορίας. Ο διαχειριστής διορθώνει, τσεκάρει τι κρατά και αποθηκεύει
 * στο SoftOne (και από εκεί στο e-shop). Στην αναλυτική αλλάζει μόνο το κείμενο — οι γραμμές χαρακτηριστικών μένουν.
 */
export function CopyPanel({ productId, canWrite, current }: { productId: string; canWrite: boolean; current: { short: string | null; long: string | null } }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [short, setShort] = useState(""), [long, setLong] = useState("");
  const [useShort, setUseShort] = useState(true), [useLong, setUseLong] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const router = useRouter();

  const make = () => startDraft(async () => {
    setMsg(null);
    const r = await draftCopyAction(productId).catch(() => ({ error: "Η δημιουργία απέτυχε — δοκίμασε ξανά." }));
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    setDraft(r); setShort(r.short); setLong(r.long); setUseShort(true); setUseLong(true);
  });
  const save = () => startSave(async () => {
    const r = await saveCopyAction(productId, { short: useShort ? short : undefined, long: useLong ? long : undefined }).catch(() => null);
    if (!r) { setMsg({ ok: false, text: "Η αποθήκευση απέτυχε." }); return; }
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setDraft(null); router.refresh(); }
  });

  const field = (label: string, on: boolean, setOn: (v: boolean) => void, value: string, set: (v: string) => void, now: string | null, rows: number, help: string) => (
    <div className="grid gap-1.5 min-w-0">
      <label className="flex items-center gap-2 min-h-11 cursor-pointer">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-5 shrink-0 accent-eu-navy" />
        <b className="text-eu-ink text-[length:var(--fs-14)]">{label}</b>
        <span className="text-eu-muted text-[length:var(--fs-12)]">{help}</span>
      </label>
      <textarea value={value} onChange={(e) => set(e.target.value)} rows={rows} disabled={!on} className="w-full rounded-xl border border-eu-line bg-white px-3 py-2 text-eu-ink text-[length:var(--fs-14)] leading-relaxed disabled:opacity-50" />
      <details className="text-[length:var(--fs-13)] text-eu-ink-3">
        <summary className="cursor-pointer font-bold min-h-9 flex items-center">Τώρα στο SoftOne {now ? `(${now.length.toLocaleString("el-GR")} χαρ.)` : "(κενό)"}</summary>
        <p className="m-0 mt-1 whitespace-pre-line break-words">{now || "—"}</p>
      </details>
    </div>
  );

  return (
    <div className="grid gap-2 rounded-2xl border border-eu-line p-3 min-w-0" data-help="enrich.copy">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Περιγραφή με AI</h4>
        <span className="text-eu-muted text-[length:var(--fs-13)]">σύντομη και αναλυτική, σε γλώσσα marketing, από τα χαρακτηριστικά και με ύφος της ίδιας κατηγορίας</span>
      </div>
      {canWrite && !draft && (
        <button type="button" onClick={make} disabled={drafting} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue disabled:opacity-60">
          {drafting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {drafting ? "Γράφεται… (έως 1 λεπτό)" : "Δημιουργία περιγραφής"}
        </button>
      )}
      {draft && (
        <div className="grid gap-3 min-w-0">
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">
            Από {draft.specCount} χαρακτηριστικά{draft.examples.length ? ` · ύφος από: ${draft.examples.join(" · ")}` : " · χωρίς παραδείγματα κατηγορίας"}{draft.costUsd ? ` · κόστος $${draft.costUsd.toFixed(3)}` : ""}. Έλεγξε ότι όλα ισχύουν πριν την αποθήκευση.
          </p>
          {field("Σύντομη περιγραφή", useShort, setUseShort, short, setShort, current.short, 3, "κάτω από τον τίτλο")}
          {field("Αναλυτική περιγραφή", useLong, setUseLong, long, setLong, current.long, 10, "αλλάζει μόνο το κείμενο· τα χαρακτηριστικά μένουν")}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving || (!useShort && !useLong)} className="inline-flex items-center gap-2 rounded-full bg-eu-green text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Database className="size-4" aria-hidden />} Αποθήκευση στο SoftOne
            </button>
            <button type="button" onClick={make} disabled={drafting || saving} className="inline-flex items-center gap-2 rounded-full border border-eu-line bg-white text-eu-ink px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:border-eu-navy disabled:opacity-50">
              {drafting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />} Νέα πρόταση
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full px-3 min-h-11 font-bold text-eu-ink-3 text-[length:var(--fs-14)] cursor-pointer hover:text-eu-ink">Ακύρωση</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-ink" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}
