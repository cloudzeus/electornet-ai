"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveExtraAction, saveFieldDefAction } from "@/app/admin/(shell)/synergates/card-actions";
import { FIELD_TYPES, type ExtraValues, type FieldDef, type FieldEntity, type FieldType } from "@/lib/custom-fields";

const input = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";
const lbl = "text-eu-ink-3 text-[length:var(--fs-13)] font-bold";
const NOUN: Record<FieldEntity, string> = { partner: "συνεργάτες", carrier: "μεταφορείς" };

/** «Πρόσθετα στοιχεία»: πεδία που ορίζει η διαχείριση (ίδια για όλους τους {NOUN}), με τιμές ανά καρτέλα. */
export function ExtraFields({ entity, id, defs, values, canWrite }: { entity: FieldEntity; id: string; defs: FieldDef[]; values: ExtraValues; canWrite: boolean }) {
  const router = useRouter();
  const active = defs.filter((d) => d.active);
  const [v, setV] = useState<ExtraValues>(values);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dlg, setDlg] = useState<FieldDef | "new" | null>(null);
  const dirty = active.some((d) => (v[d.key] ?? null) !== (values[d.key] ?? null));
  const groups = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    for (const d of active) m.set(d.groupName ?? "Γενικά", [...(m.get(d.groupName ?? "Γενικά") ?? []), d]);
    return [...m];
  }, [active]);
  const set = (k: string, x: string | boolean | null) => { setV({ ...v, [k]: x }); setMsg(null); };
  const save = () => start(async () => {
    const r = await saveExtraAction(entity, id, v);
    setMsg(r.ok ? { ok: true, text: "Αποθηκεύτηκε" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  });

  return (
    <div data-help="extra.fields" className="grid gap-4 min-w-0">
      <div className="rounded-2xl border border-eu-line bg-white p-4 flex flex-wrap items-center gap-3">
        <p className="m-0 flex-1 min-w-[220px] text-eu-ink-3 text-[length:var(--fs-14)]">Στοιχεία που δεν υπάρχουν στο SoftOne: όροι συμφωνίας, ώρες, σύνδεσμοι σε αρχεία. Κάθε πεδίο που προσθέτεις εμφανίζεται σε όλους τους {NOUN[entity]}.</p>
        {canWrite && <button type="button" onClick={() => setDlg("new")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Νέο πεδίο</button>}
      </div>

      {!active.length && <p className="m-0 rounded-2xl border border-dashed border-eu-line p-4 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν έχουν οριστεί πρόσθετα πεδία ακόμη.{canWrite ? " Πάτα «Νέο πεδίο» για το πρώτο, π.χ. «Λήξη σύμβασης» ή «Σύμβαση (σύνδεσμος)»." : ""}</p>}

      {groups.map(([g, list]) => (
        <section key={g} className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 min-w-0">
          <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">{g}</h3>
          <div className="grid gap-3 @2xl:grid-cols-2">
            {list.map((d) => (
              <div key={d.id} className="grid gap-1 min-w-0">
                <span className="flex items-center gap-1.5"><span className={lbl}>{d.label}</span>
                  {canWrite && <button type="button" onClick={() => setDlg(d)} aria-label={`Αλλαγή πεδίου ${d.label}`} className="size-9 grid place-items-center text-eu-muted hover:text-eu-navy"><Pencil className="size-3.5" aria-hidden /></button>}</span>
                <Value d={d} value={v[d.key] ?? null} onChange={(x) => set(d.key, x)} disabled={!canWrite} />
                {d.help && <span className="text-eu-muted text-[length:var(--fs-12)]">{d.help}</span>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {canWrite && active.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !dirty} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
          {msg && <span role={msg.ok ? "status" : "alert"} className={`font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</span>}
        </div>
      )}
      {dlg && <FieldDialog entity={entity} def={dlg === "new" ? null : dlg} groups={[...new Set(defs.map((d) => d.groupName).filter(Boolean) as string[])]} onClose={() => setDlg(null)} />}
    </div>
  );
}

function Value({ d, value, onChange, disabled }: { d: FieldDef; value: string | number | boolean | null; onChange: (v: string | boolean | null) => void; disabled: boolean }) {
  const s = value == null ? "" : String(value);
  if (d.type === "bool") return (
    <div className="flex gap-2" role="radiogroup" aria-label={d.label}>
      {([[true, "Ναι"], [false, "Όχι"], [null, "—"]] as const).map(([x, t]) => (
        <button key={t} type="button" role="radio" aria-checked={value === x} disabled={disabled} onClick={() => onChange(x)} className={`rounded-full px-4 min-h-11 text-[length:var(--fs-14)] font-bold border ${value === x ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink"}`}>{t}</button>
      ))}
    </div>
  );
  if (d.type === "select") return <select className={input} value={s} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={d.label}><option value="">—</option>{d.options.map((o) => <option key={o}>{o}</option>)}</select>;
  if (d.type === "link") return (
    <div className="flex gap-2 min-w-0">
      <input className={input} value={s} disabled={disabled} onChange={(e) => onChange(e.target.value)} type="url" inputMode="url" placeholder="https://…" aria-label={d.label} />
      {/^https?:\/\//.test(s) && <a href={s} target="_blank" rel="noreferrer" aria-label={`Άνοιγμα ${d.label}`} className="shrink-0 size-11 grid place-items-center rounded-lg border border-eu-line text-eu-blue"><ExternalLink className="size-4" aria-hidden /></a>}
    </div>
  );
  return <input className={input} value={s} disabled={disabled} onChange={(e) => onChange(e.target.value)} type={d.type === "date" ? "date" : "text"} inputMode={d.type === "number" ? "decimal" : undefined} aria-label={d.label} />;
}

function FieldDialog({ entity, def, groups, onClose }: { entity: FieldEntity; def: FieldDef | null; groups: string[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ label: def?.label ?? "", type: (def?.type ?? "text") as FieldType, options: (def?.options ?? []).join("\n"), groupName: def?.groupName ?? "", help: def?.help ?? "", active: def?.active ?? true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveFieldDefAction(entity, { id: def?.id, ...f, options: f.options.split("\n") });
    if (!r.ok) { setErr(r.error); return; }
    onClose(); router.refresh();
  });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <DialogHeader>
          <DialogTitle>{def ? "Αλλαγή πεδίου" : "Νέο πεδίο"}</DialogTitle>
          <DialogDescription>Εμφανίζεται στα «Πρόσθετα στοιχεία» όλων των καρτελών. Για αρχεία βάλε τύπο «Σύνδεσμος» και κόλλησε το link από Drive ή SharePoint.</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto grid gap-3 content-start pr-1">
          <label className="grid gap-1"><span className={lbl}>Όνομα *</span><input className={input} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="π.χ. Λήξη σύμβασης" autoFocus /></label>
          <label className="grid gap-1"><span className={lbl}>Τύπος</span><select className={input} value={f.type} disabled={!!def} onChange={(e) => setF({ ...f, type: e.target.value as FieldType })}>{Object.entries(FIELD_TYPES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{def && <span className="text-eu-muted text-[length:var(--fs-12)]">Ο τύπος δεν αλλάζει, για να μη χαλάσουν οι τιμές που έχουν γραφτεί.</span>}</label>
          {f.type === "select" && <label className="grid gap-1"><span className={lbl}>Επιλογές, μία ανά γραμμή</span><textarea className={`${input} py-2 min-h-24`} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></label>}
          <label className="grid gap-1"><span className={lbl}>Ομάδα</span><input className={input} value={f.groupName} onChange={(e) => setF({ ...f, groupName: e.target.value })} list="extra-groups" placeholder="π.χ. Συμφωνία" /><datalist id="extra-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
          <label className="grid gap-1"><span className={lbl}>Εξήγηση κάτω από το πεδίο</span><input className={input} value={f.help} onChange={(e) => setF({ ...f, help: e.target.value })} /></label>
          {def && <label className="flex items-center gap-2 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ενεργό (αν το σβήσεις κρύβεται, οι τιμές μένουν)</label>}
        </div>
        <div className="grid gap-2">
          {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold">Άκυρο</button>
            <button type="button" disabled={busy || f.label.trim().length < 2} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
