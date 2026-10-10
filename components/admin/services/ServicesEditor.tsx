"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Database, ExternalLink, GripVertical, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { deleteServiceAction, importServicesAction, reorderServicesAction, saveServiceAction, toggleServiceAction, type ServiceInput } from "@/app/admin/(shell)/ypiresies/actions";
import { Area, MediaUrl, StringList, Txt } from "@/components/admin/cms/brand/fields";
import { PickerBrand } from "@/components/admin/cms/brand/ImagePicker";
import { ResultBanner } from "@/components/admin/settings/ui";

type Row = ServiceInput & { used: number };
const ADDON: { v: string; t: string; d: string }[] = [
  { v: "pdp", t: "Σελίδα προϊόντος", d: "Επιλογή δίπλα στο «Στο καλάθι»." },
  { v: "checkout", t: "Checkout", d: "Πρόταση στο καλάθι / checkout." },
  { v: "delivery", t: "Παράδοση με ραντεβού", d: "Επιλογή στην παράδοση από το κατάστημα." },
];
const EMPTY: Row = { id: null, slug: "", title: "", blurb: "", body: "", priceFrom: "", steps: [], faq: [], addonAt: [], image: "", active: true, used: 0 };
const eur = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")).toLocaleString("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }));

/**
 * Υπηρεσίες: λίστα με σειρά (σύρσιμο ή βέλη), ενεργή/ανενεργή, άνοιγμα για επεξεργασία, «Νέα υπηρεσία».
 * Πριν τη μεταφορά στη βάση φαίνονται οι αρχικές του σχεδίου (μόνο προβολή).
 */
export function ServicesEditor({ initial, fromDb, canWrite }: { initial: Row[]; fromDb: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const editable = fromDb && canWrite;
  const run = (f: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) => start(async () => { const r = await f(); setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" }); if (r.ok) { after?.(); router.refresh(); } });
  const reorder = (from: number, to: number) => {
    const l = [...rows]; const [x] = l.splice(from, 1); l.splice(to, 0, x); setRows(l);
    run(() => reorderServicesAction(l.map((r) => r.id!).filter(Boolean)));
  };
  return (
    <PickerBrand.Provider value={{ brandId: null, brandName: "Euronics" }}>
      <div className="grid gap-4">
        {!fromDb && (
          <div className="rounded-2xl border-2 border-eu-amber/60 bg-eu-amber/10 p-4 grid gap-2">
            <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Οι υπηρεσίες είναι ακόμη οι αρχικές του σχεδίου ({rows.length}).</p>
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">Για να τις επεξεργαστείς ή να προσθέσεις νέες, μετάφερέ τες στη βάση. Δεν αλλάζει τίποτα στο site — ίδια κείμενα, τιμές και σειρά.</p>
            {canWrite && <button type="button" disabled={busy} onClick={() => run(importServicesAction)} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-5 min-h-12 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Database className="size-4" aria-hidden />} Μεταφορά στη βάση</button>}
          </div>
        )}
        {msg && <div className="relative"><ResultBanner ok={msg.ok}><span className="block pr-8">{msg.text}</span></ResultBanner><button type="button" onClick={() => setMsg(null)} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 grid place-items-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button></div>}
        {editable && open !== "new" && <button type="button" onClick={() => setOpen("new")} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-chip"><Plus className="size-5" aria-hidden /> Νέα υπηρεσία</button>}
        {editable && open === "new" && <ServiceForm row={EMPTY} busy={busy} onCancel={() => setOpen(null)} onSave={(r) => run(() => saveServiceAction(r), () => setOpen(null))} />}
        <ol className="m-0 p-0 list-none grid gap-2" onDragOver={(e) => e.preventDefault()}>
          {rows.map((r, i) => {
            const key = r.id ?? r.slug;
            const isOpen = open === key;
            return (
              <li key={key} className={`rounded-xl border bg-white ${r.active ? "border-eu-line" : "border-eu-line opacity-70"} ${drag === i ? "opacity-40" : ""}`}
                onDragOver={(e) => { if (drag != null) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (drag != null && drag !== i) reorder(drag, i); setDrag(null); }}>
                <div className="flex items-center gap-1 pr-1">
                  {editable && <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag(i); }} onDragEnd={() => setDrag(null)} aria-hidden title="Σύρε για αλλαγή σειράς" className="grid place-items-center w-9 self-stretch cursor-grab text-eu-muted hover:text-eu-ink"><GripVertical className="size-5" /></span>}
                  <span className="w-7 shrink-0 text-center font-extrabold text-eu-muted text-[length:var(--fs-13)] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="size-11 shrink-0 rounded-lg bg-eu-surface bg-cover bg-center" style={r.image ? { backgroundImage: `url("${r.image.replace(/"/g, "")}")` } : undefined} aria-hidden />
                  <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="flex-1 min-w-0 grid text-left px-2 py-2 min-h-14">
                    <span className={`font-bold text-[length:var(--fs-15)] leading-snug ${r.active ? "text-eu-ink" : "text-eu-muted line-through decoration-1"}`}>{r.title}</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug line-clamp-1">{r.blurb}</span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {eur(r.priceFrom) && <span className="rounded-full bg-eu-chip text-eu-navy px-2 py-0.5 text-[length:var(--fs-13)] font-bold">από {eur(r.priceFrom)}</span>}
                      {r.addonAt.map((a) => <span key={a} className="rounded-full bg-eu-surface text-eu-ink-2 px-2 py-0.5 text-[length:var(--fs-13)] font-bold">{ADDON.find((x) => x.v === a)?.t}</span>)}
                    </span>
                  </button>
                  {editable && (
                    <label className="inline-flex items-center gap-2 min-h-11 px-1 cursor-pointer select-none" title={r.active ? "Ενεργή — πάτα για απενεργοποίηση" : "Ανενεργή — πάτα για ενεργοποίηση"}>
                      <input type="checkbox" role="switch" checked={r.active} onChange={(e) => { const v = e.target.checked; setRows((l) => l.map((x, k) => (k === i ? { ...x, active: v } : x))); run(() => toggleServiceAction(r.id!, v)); }} className="sr-only peer" aria-label={`${r.title}: ενεργή`} />
                      <span aria-hidden className="relative w-11 h-6 rounded-full bg-eu-line peer-checked:bg-eu-green transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue" />
                    </label>
                  )}
                  {editable && <>
                    <button type="button" disabled={i === 0 || busy} onClick={() => reorder(i, i - 1)} aria-label={`${r.title}: πιο πάνω`} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                    <button type="button" disabled={i === rows.length - 1 || busy} onClick={() => reorder(i, i + 1)} aria-label={`${r.title}: πιο κάτω`} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                  </>}
                  <ChevronDown className={`size-5 shrink-0 mx-1 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </div>
                {isOpen && (
                  <div className="border-t border-eu-line p-3 @md:p-4">
                    {editable ? (
                      <ServiceForm row={r} busy={busy} onCancel={() => setOpen(null)} onSave={(x) => run(() => saveServiceAction(x), () => setOpen(null))}
                        onDelete={() => { if (window.confirm(r.used ? `Η «${r.title}» υπάρχει σε ${r.used} παραγγελίες και δεν διαγράφεται — θα γίνει ανενεργή.` : `Οριστική διαγραφή της «${r.title}»; (Για να μη φαίνεται χωρίς να χαθεί, κλείσε τον διακόπτη.)`)) run(() => (r.used ? toggleServiceAction(r.id!, false) : deleteServiceAction(r.id!)), () => setOpen(null)); }} />
                    ) : (
                      <div className="grid gap-2 text-[length:var(--fs-14)] text-eu-ink-2"><p className="m-0">{r.body || r.blurb}</p><a href={`/ypiresies/${r.slug}`} target="_blank" rel="noreferrer" className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold underline min-h-11">Η σελίδα της υπηρεσίας <ExternalLink className="size-4" aria-hidden /></a></div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </PickerBrand.Provider>
  );
}

/** Φόρμα υπηρεσίας: βασικά (τίτλος, περιγραφή, τιμή, εικόνα), πού προσφέρεται, σελίδα (κείμενο, βήματα, ερωτήσεις). */
function ServiceForm({ row, busy, onSave, onCancel, onDelete }: { row: Row; busy: boolean; onSave: (r: ServiceInput) => void; onCancel: () => void; onDelete?: () => void }) {
  const [f, setF] = useState<Row>(row);
  const set = (p: Partial<Row>) => setF((x) => ({ ...x, ...p }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(f); }} className={`grid gap-4 ${row.id ? "" : "rounded-2xl border-2 border-eu-navy bg-white p-3 @md:p-4"}`}>
      {!row.id && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Νέα υπηρεσία</h2>}
      <fieldset className="m-0 p-0 border-0 grid gap-3">
        <legend className="font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide mb-1">Βασικά</legend>
        <Txt label="Τίτλος" value={f.title} onChange={(v) => set({ title: v })} max={80} placeholder="π.χ. Εγκατάσταση κλιματιστικού" />
        <Area label="Σύντομη περιγραφή" value={f.blurb} onChange={(v) => set({ blurb: v })} max={200} rows={2} help="Φαίνεται στις κάρτες (αρχική, hero, σελίδα προϊόντος)." />
        <div className="grid @xl:grid-cols-2 gap-3">
          <Txt label="Τιμή «από» (€)" value={f.priceFrom} onChange={(v) => set({ priceFrom: v.replace(/[^\d.,]/g, "") })} placeholder="κενό = χωρίς τιμή" help="0 = δωρεάν. Σε πρόσθετη υπηρεσία είναι η τιμή στο καλάθι." />
          <Txt label="Διεύθυνση σελίδας" value={f.slug} onChange={(v) => set({ slug: v })} placeholder="αυτόματα από τον τίτλο" mono help={`/ypiresies/${f.slug || "…"}`} />
        </div>
        <MediaUrl label="Εικόνα" value={f.image} onChange={(v) => set({ image: v })} help="Προαιρετική — από τα Media ή τα προϊόντα." />
      </fieldset>
      <fieldset className="m-0 p-0 border-0 grid gap-2">
        <legend className="font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide mb-1">Προσφέρεται ως πρόσθετη υπηρεσία</legend>
        <div className="grid @xl:grid-cols-3 gap-2">
          {ADDON.map((a) => { const on = f.addonAt.includes(a.v); return (
            <label key={a.v} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 min-h-14 cursor-pointer ${on ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
              <input type="checkbox" checked={on} onChange={() => set({ addonAt: on ? f.addonAt.filter((x) => x !== a.v) : [...f.addonAt, a.v] })} className="mt-1 size-4 accent-eu-navy" />
              <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{a.t}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{a.d}</span></span>
            </label>
          ); })}
        </div>
        <span className="text-eu-muted text-[length:var(--fs-13)]">Τίποτα επιλεγμένο = μόνο σελίδα πληροφοριών, χωρίς αγορά.</span>
      </fieldset>
      <details className="rounded-xl border border-eu-line" open={!row.id ? false : undefined}>
        <summary className="list-none cursor-pointer flex items-center gap-2 px-3 min-h-12 font-bold text-eu-ink text-[length:var(--fs-15)]">Σελίδα της υπηρεσίας <span className="font-normal text-eu-muted text-[length:var(--fs-13)]">· κείμενο, βήματα, ερωτήσεις</span></summary>
        <div className="grid gap-3 p-3 pt-0">
          <Area label="Κείμενο σελίδας" value={f.body} onChange={(v) => set({ body: v })} rows={5} />
          <StringList label="Πώς λειτουργεί (βήματα)" items={f.steps} onChange={(v) => set({ steps: v })} addLabel="Νέο βήμα" max={12} />
          <div className="grid gap-2">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Συχνές ερωτήσεις</span>
            {f.faq.map((q, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-eu-line p-2">
                <Txt label={`Ερώτηση ${i + 1}`} value={q.q} onChange={(v) => set({ faq: f.faq.map((x, k) => (k === i ? { ...x, q: v } : x)) })} />
                <Area label="Απάντηση" value={q.a} onChange={(v) => set({ faq: f.faq.map((x, k) => (k === i ? { ...x, a: v } : x)) })} rows={2} />
                <button type="button" onClick={() => set({ faq: f.faq.filter((_, k) => k !== i) })} className="justify-self-end inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><X className="size-4" aria-hidden /> Αφαίρεση</button>
              </div>
            ))}
            <button type="button" onClick={() => set({ faq: [...f.faq, { q: "", a: "" }] })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Νέα ερώτηση</button>
          </div>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-5 min-h-12 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} {row.id ? "Αποθήκευση" : "Δημιουργία"}</button>
        <button type="button" onClick={onCancel} className="rounded-full px-4 min-h-12 font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-surface">Άκυρο</button>
        {row.id && <a href={`/ypiresies/${row.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold underline min-h-12 text-[length:var(--fs-14)]">Η σελίδα <ExternalLink className="size-4" aria-hidden /></a>}
        {onDelete && <button type="button" onClick={onDelete} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 min-h-12 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>}
      </div>
    </form>
  );
}
