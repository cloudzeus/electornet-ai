"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { saveSetTextsAction } from "@/app/admin/(shell)/catalog/actions";

/**
 * Κείμενα προϊόντος-σετ: όνομα, σύντομη και αναλυτική περιγραφή. Αποθηκεύονται μόνο στο eshop — το σετ δεν έχει δικό
 * του είδος στο SoftOne. Τα χαρακτηριστικά και οι διαστάσεις είναι του κύριου είδους.
 */
export function SetTextsEditor({ productId, initial, canWrite, mainHref }: { productId: string; initial: { title: string; summary: string; description: string }; canWrite: boolean; mainHref: string | null }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const dirty = v.title !== initial.title || v.summary !== initial.summary || v.description !== initial.description;
  const save = () => start(async () => {
    const r = await saveSetTextsAction(productId, v);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  });
  const field = "w-full rounded-lg border border-eu-line bg-white px-3 py-2 text-[length:var(--fs-14)] text-eu-ink disabled:bg-eu-surface";
  return (
    <section data-help="catalog.set.texts" className="rounded-xl border border-eu-line bg-white p-3 grid gap-3 min-w-0">
      <div className="grid gap-0.5">
        <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Κείμενα του σετ</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Αποθηκεύονται στο eshop: το σετ δεν έχει δικό του είδος στο SoftOne, οπότε εκεί δεν γράφεται τίποτα. Χαρακτηριστικά και διαστάσεις είναι του κύριου είδους{mainHref ? <> (<a href={mainHref} className="font-bold text-eu-blue hover:underline">καρτέλα κύριου είδους</a>)</> : null}.</p>
      </div>
      <label className="grid gap-1"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Όνομα στο site</span>
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} disabled={!canWrite} maxLength={200} className={`${field} min-h-11`} /></label>
      <label className="grid gap-1"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Σύντομη περιγραφή <span className="font-normal text-eu-muted">· κάτω από το όνομα στη σελίδα</span></span>
        <textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} disabled={!canWrite} rows={2} maxLength={4000} className={field} /></label>
      <label className="grid gap-1"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Αναλυτική περιγραφή <span className="font-normal text-eu-muted">· μία παράγραφος ανά γραμμή</span></span>
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} disabled={!canWrite} rows={8} maxLength={20000} className={field} /></label>
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && <button type="button" onClick={save} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>}
        {dirty && !busy && <button type="button" onClick={() => { setV(initial); setMsg(null); }} className="rounded-full px-3 min-h-11 text-eu-ink-3 font-bold text-[length:var(--fs-13)] hover:text-eu-ink">Αναίρεση</button>}
        {msg && <span role="status" className={`text-[length:var(--fs-13)] font-semibold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
        {!canWrite && <span className="text-eu-muted text-[length:var(--fs-13)]">Μόνο ανάγνωση: χρειάζεται το δικαίωμα «Επεξεργασία προϊόντων».</span>}
      </div>
    </section>
  );
}
