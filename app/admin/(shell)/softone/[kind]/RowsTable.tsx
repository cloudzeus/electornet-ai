"use client";
import { useState, useTransition } from "react";
import { Check, Loader2, Plus, X, AlertTriangle, Link2, ImagePlus } from "lucide-react";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";
import type { LookupField } from "@/lib/softone/lookups";
import { saveRow, addRow } from "../actions";

type Row = Record<string, unknown> & { id: string; code: string; name: string; active: boolean; s1Id: string | null; s1Name: string | null; s1Missing: boolean; s1SyncedAt?: string | null };

function MediaUrlField({ f, value, onChange }: { f: LookupField; value: unknown; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const url = value ? String(value) : "";
  return (
    <div className="grid gap-1 @lg:col-span-2">
      <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">{f.label}</span>
      <div className="flex items-center gap-3 rounded-lg border border-eu-line p-2 bg-white min-h-12">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-10 max-w-[140px] object-contain rounded bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:12px_12px]" />
        ) : <span className="text-eu-muted text-[length:var(--fs-13)]">Χωρίς λογότυπο</span>}
        <span className="flex-1 min-w-0 truncate text-eu-muted text-[length:var(--fs-13)]">{url}</span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-9 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><ImagePlus className="size-4" aria-hidden /> {url ? "Αλλαγή" : "Επιλογή / upload"}</button>
        {url && <button type="button" onClick={() => onChange("")} aria-label="Αφαίρεση" className="size-9 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-red/10 hover:text-eu-red"><X className="size-4" aria-hidden /></button>}
      </div>
      {f.help && <span className="text-eu-muted text-[length:var(--fs-13)]">{f.help}</span>}
      {open && <MediaPickerDialog accept={["image", "file"]} multiple={false} canWrite onSelect={(a) => { if (a[0]) onChange(a[0].url); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Field({ f, value, onChange }: { f: LookupField; value: unknown; onChange: (v: unknown) => void }) {
  const cls = "rounded-lg border border-eu-line px-2 min-h-9 text-[length:var(--fs-14)] w-full bg-white";
  if (f.type === "media") return <MediaUrlField f={f} value={value} onChange={onChange} />;
  if (f.type === "boolean") return <label className="inline-flex items-center gap-2 min-h-9 text-[length:var(--fs-14)]"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-eu-navy" /> {f.label}</label>;
  if (f.type === "select") return <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label={f.label} className={cls}>{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return <input type={f.type === "number" ? "number" : "text"} step="any" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value)} placeholder={f.label} aria-label={f.label} className={cls} />;
}

/** Editable table of our rows for one lookup kind: inline edit of our columns, S1 mirror read-only, add own row. */
export function RowsTable({ kind, rows: initial, editable, columns }: { kind: string; rows: Row[]; editable: LookupField[]; columns: string[] }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const label = (f: LookupField | undefined, v: unknown) => {
    if (v == null || v === "") return "—";
    // eslint-disable-next-line @next/next/no-img-element
    if (f?.type === "media") return <img src={String(v)} alt="" className="h-7 max-w-[96px] object-contain" />; if (f?.type === "select") return f.options?.find((o) => o.value === String(v))?.label ?? String(v); if (f?.type === "boolean") return v ? "Ναι" : "Όχι"; if (typeof v === "object") return (v as { name?: string }).name ?? "—"; return String(v); };
  const begin = (r: Row) => { setEditing(r.id); setDraft({ code: r.code, name: r.name, active: r.active, ...Object.fromEntries(editable.map((f) => [f.key, r[f.key]])) }); setErr(null); };
  const commit = () => start(async () => { try { const res = await saveRow(kind, editing!, draft); setRows((rs) => rs.map((r) => (r.id === editing ? { ...r, ...(res.row as Row) } : r))); setEditing(null); } catch (e) { setErr((e as Error).message); } });
  const create = () => start(async () => { const res = await addRow(kind, draft as { code: string; name: string }); if (res.ok) { setAdding(false); window.location.reload(); } else setErr(res.error); });
  const fieldByKey = (k: string) => editable.find((f) => f.key === k);
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setAdding(true); setEditing(null); setDraft({ code: "", name: "", active: true }); setErr(null); }} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-13)] px-3 min-h-9 hover:bg-eu-chip"><Plus className="size-4" aria-hidden /> Δική μας εγγραφή</button>
      </div>
      {err && <p className="m-0 rounded-lg bg-eu-red/10 text-eu-red p-2 text-[length:var(--fs-13)] font-bold">{err}</p>}
      {adding && (
        <div className="rounded-xl border-2 border-eu-navy p-3 grid gap-2 bg-white">
          <div className="font-bold text-eu-ink text-[length:var(--fs-14)]">Νέα εγγραφή χωρίς αντιστοιχία στο SoftOne</div>
          <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2">
            <input value={String(draft.code ?? "")} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="Κωδικός" className="rounded-lg border border-eu-line px-2 min-h-9 text-[length:var(--fs-14)]" />
            <input value={String(draft.name ?? "")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Όνομα" className="rounded-lg border border-eu-line px-2 min-h-9 text-[length:var(--fs-14)]" />
            {editable.map((f) => <Field key={f.key} f={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />)}
          </div>
          <div className="flex gap-2"><button type="button" onClick={create} disabled={pending || !String(draft.code ?? "").trim() || !String(draft.name ?? "").trim()} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-4 min-h-9 disabled:opacity-60">{pending ? "…" : "Δημιουργία"}</button><button type="button" onClick={() => setAdding(false)} className="rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-9">Άκυρο</button></div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-eu-line bg-white">
        <table className="w-full text-[length:var(--fs-14)]">
          <thead><tr className="text-left text-eu-muted bg-eu-surface"><th className="py-2 px-3 font-bold">Κωδικός</th><th className="py-2 px-3 font-bold">Όνομα (site)</th>{columns.map((c) => <th key={c} className="py-2 px-3 font-bold">{fieldByKey(c)?.label ?? (c === "district" ? "Νομός" : c)}</th>)}<th className="py-2 px-3 font-bold">Ενεργό</th><th className="py-2 px-3 font-bold">SoftOne</th><th className="py-2 px-3"></th></tr></thead>
          <tbody>
            {rows.map((r) => editing === r.id ? (
              <tr key={r.id} className="border-t border-eu-line-2 bg-eu-chip/40">
                <td className="py-2 px-3 align-top"><input value={String(draft.code ?? "")} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="rounded-lg border border-eu-line px-2 min-h-9 w-28 text-[length:var(--fs-14)]" /></td>
                <td className="py-2 px-3 align-top" colSpan={1 + columns.length}>
                  <div className="grid gap-2">
                    <input value={String(draft.name ?? "")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-lg border border-eu-line px-2 min-h-9 w-full text-[length:var(--fs-14)]" />
                    {editable.length > 0 && <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2">{editable.map((f) => <Field key={f.key} f={f} value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />)}</div>}
                  </div>
                </td>
                <td className="py-2 px-3 align-top"><label className="inline-flex items-center gap-1 min-h-9"><input type="checkbox" checked={!!draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-4 accent-eu-navy" /></label></td>
                <td className="py-2 px-3 align-top text-eu-muted text-[length:var(--fs-13)]">{r.s1Id ? `${r.s1Id} · ${r.s1Name}` : "—"}</td>
                <td className="py-2 px-3 align-top whitespace-nowrap"><button type="button" onClick={commit} disabled={pending} aria-label="Αποθήκευση" className="size-9 rounded-full bg-eu-navy text-white inline-flex items-center justify-center mr-1 disabled:opacity-60">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}</button><button type="button" onClick={() => setEditing(null)} aria-label="Άκυρο" className="size-9 rounded-full bg-eu-surface inline-flex items-center justify-center"><X className="size-4" aria-hidden /></button></td>
              </tr>
            ) : (
              <tr key={r.id} className={`border-t border-eu-line-2 ${r.active ? "" : "opacity-60"}`}>
                <td className="py-2 px-3 font-mono text-[length:var(--fs-13)] text-eu-ink whitespace-nowrap">{r.code}</td>
                <td className="py-2 px-3 text-eu-ink font-semibold">{r.name}{r.s1Name && r.s1Name !== r.name && <div className="text-eu-muted text-[length:var(--fs-13)] font-normal">SoftOne: {r.s1Name}</div>}</td>
                {columns.map((c) => <td key={c} className="py-2 px-3 text-eu-ink-3">{label(fieldByKey(c), r[c])}</td>)}
                <td className="py-2 px-3">{r.active ? <span className="text-eu-green font-bold">Ναι</span> : <span className="text-eu-muted">Όχι</span>}</td>
                <td className="py-2 px-3 whitespace-nowrap text-[length:var(--fs-13)]">{r.s1Id ? <span className={`inline-flex items-center gap-1 ${r.s1Missing ? "text-eu-amber font-bold" : "text-eu-ink-3"}`}>{r.s1Missing ? <AlertTriangle className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />} {r.s1Id}{r.s1Missing ? " · λείπει πια" : ""}</span> : <span className="text-eu-muted">δική μας</span>}</td>
                <td className="py-2 px-3 text-right"><button type="button" onClick={() => begin(r)} className="rounded-full border border-eu-line font-bold text-[length:var(--fs-13)] px-3 min-h-8 hover:border-eu-blue">Επεξεργασία</button></td>
              </tr>
            ))}
            
          </tbody>
        </table>
      </div>
    </div>
  );
}
