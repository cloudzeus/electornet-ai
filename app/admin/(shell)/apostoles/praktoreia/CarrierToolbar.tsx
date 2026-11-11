"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABEL, type CarrierRole } from "@/lib/delivery/routing";
import { createCarrierAction, importCarriersAction } from "../delivery-actions";

export interface PartnerOpt { id: string; name: string; city: string | null; agency: string | null }
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";
const lbl = "text-eu-ink-3 text-[length:var(--fs-13)] font-bold";
const ROLES = Object.keys(ROLE_LABEL) as CarrierRole[];
type ImportResult = Awaited<ReturnType<typeof importCarriersAction>>;

/** Πάνω από τη λίστα: εισαγωγή από SoftOne + νέος μεταφορέας. */
export function CarrierToolbar({ total, lastSync, partners, canWrite }: { total: number; lastSync: string | null; partners: PartnerOpt[]; canWrite: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [open, setOpen] = useState(false);
  const run = () => start(async () => { setRes(await importCarriersAction()); router.refresh(); });
  return (
    <div data-help="agencies.toolbar" className="grid gap-2">
      <div className="rounded-2xl border border-eu-line bg-white p-3 flex flex-wrap items-center gap-3">
        <p className="m-0 flex-1 min-w-[200px] text-eu-ink-3 text-[length:var(--fs-14)]"><b className="text-eu-ink tabular-nums">{total}</b> μεταφορείς · τελευταία εισαγωγή από SoftOne: {lastSync ?? "ποτέ"}</p>
        {canWrite && <>
          <button type="button" disabled={busy} onClick={run} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Εισαγωγή από SoftOne
          </button>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 text-[length:var(--fs-14)]"><Plus className="size-4" aria-hidden /> Νέος μεταφορέας</button>
        </>}
      </div>
      {busy && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Διαβάζω μεταφορείς, οχήματα και προεπιλογές συνεργατών από το SoftOne. Μπορεί να πάρει ένα λεπτό.</p>}
      {res && !busy && (res.ok
        ? <div role="status" className="rounded-2xl border border-eu-green/40 bg-eu-green/10 p-3 text-eu-ink text-[length:var(--fs-14)] flex flex-wrap gap-x-5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-bold text-eu-green"><Check className="size-4" aria-hidden /> Έγινε η εισαγωγή</span>
            <span>Μεταφορείς: <b>{res.carriers.created}</b> νέοι, <b>{res.carriers.updated}</b> άλλαξαν{res.carriers.missing ? <>, <b>{res.carriers.missing}</b> δεν υπάρχουν πια</> : null}</span>
            <span>Συμπληρώθηκαν στοιχεία σε <b>{res.filled}</b></span>
            <span>Οχήματα: <b>{res.vehicles.fetched}</b></span>
            <span>Συνεργάτες με μεταφορέα στο SoftOne: <b>{res.partners.withCarrier}</b> από {res.partners.checked}</span>
          </div>
        : <p role="alert" className="m-0 rounded-2xl border border-eu-red/40 bg-eu-red/5 p-3 text-eu-ink text-[length:var(--fs-14)] inline-flex gap-2"><AlertTriangle className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /> Η εισαγωγή δεν ολοκληρώθηκε: {res.error}</p>)}
      <NewCarrierDialog open={open} onClose={() => setOpen(false)} partners={partners} />
    </div>
  );
}

function NewCarrierDialog({ open, onClose, partners }: { open: boolean; onClose: () => void; partners: PartnerOpt[] }) {
  const router = useRouter();
  const empty = { role: "agency" as CarrierRole, name: "", phone: "", email: "", afm: "", address: "", city: "", zip: "", hours: "", notes: "" };
  const [f, setF] = useState(empty);
  const [sel, setSel] = useState<PartnerOpt[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setDup(null); setErr(null); };
  const hits = useMemo(() => (q.length < 2 ? [] : partners.filter((p) => !sel.some((s) => s.id === p.id) && `${p.name} ${p.city ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6)), [q, partners, sel]);
  const close = () => { onClose(); setF(empty); setSel([]); setQ(""); setErr(null); setDup(null); };
  const save = () => start(async () => {
    try {
      const r = await createCarrierAction({ ...f, partnerIds: sel.map((s) => s.id) });
      if (!r.ok) { setDup(r.existing); return; }
      close(); router.push(`/admin/apostoles/praktoreia/${r.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Δεν αποθηκεύτηκε"); }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <DialogHeader>
          <DialogTitle>Νέος μεταφορέας</DialogTitle>
          <DialogDescription>Αποθηκεύεται μόνο στο eshop. Οι εγγραφές στο SoftOne είναι σε παύση, οπότε δεν δημιουργείται εκεί.</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto grid gap-3 sm:grid-cols-2 content-start pr-1">
          <label className="grid gap-1"><span className={lbl}>Τι είναι</span><select className={field} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as CarrierRole })}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select></label>
          <label className="grid gap-1"><span className={lbl}>Όνομα *</span><input className={field} value={f.name} onChange={set("name")} placeholder="π.χ. ΠΡΑΚΤΟΡΕΙΟ ΜΕΛΕΤΙΟΥ" autoFocus /></label>
          <label className="grid gap-1"><span className={lbl}>Τηλέφωνο</span><input className={field} value={f.phone} onChange={set("phone")} inputMode="tel" /></label>
          <label className="grid gap-1"><span className={lbl}>Email</span><input className={field} value={f.email} onChange={set("email")} type="email" /></label>
          <label className="grid gap-1"><span className={lbl}>ΑΦΜ</span><input className={field} value={f.afm} onChange={set("afm")} inputMode="numeric" maxLength={12} /><span className="text-eu-muted text-[length:var(--fs-12)]">Για να ταιριάξει αργότερα με το SoftOne και να μη γίνει διπλός</span></label>
          <label className="grid gap-1"><span className={lbl}>Διεύθυνση παραλαβής</span><input className={field} value={f.address} onChange={set("address")} /></label>
          <label className="grid gap-1"><span className={lbl}>Πόλη</span><input className={field} value={f.city} onChange={set("city")} /></label>
          <label className="grid gap-1"><span className={lbl}>Τ.Κ.</span><input className={field} value={f.zip} onChange={set("zip")} inputMode="numeric" maxLength={5} /></label>
          <label className="grid gap-1 sm:col-span-2"><span className={lbl}>Ωράριο παραλαβής</span><input className={field} value={f.hours} onChange={set("hours")} placeholder="π.χ. Δευ–Παρ 08:00–16:00" /></label>
          {f.role === "agency" && (
            <div className="grid gap-1 sm:col-span-2">
              <span className={lbl}>Συνεργάτες που εξυπηρετεί</span>
              {sel.length > 0 && <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">{sel.map((p) => (
                <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-eu-chip text-eu-navy pl-3 pr-1 text-[length:var(--fs-13)] font-bold">{p.name}{p.city ? ` · ${p.city}` : ""}
                  <button type="button" aria-label={`Αφαίρεση ${p.name}`} onClick={() => setSel(sel.filter((x) => x.id !== p.id))} className="size-9 grid place-items-center"><X className="size-3.5" aria-hidden /></button></li>))}</ul>}
              <label className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden /><input className={`${field} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Γράψε όνομα ή πόλη συνεργάτη" aria-label="Αναζήτηση συνεργάτη" /></label>
              {hits.length > 0 && <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line">{hits.map((p) => (
                <li key={p.id}><button type="button" onClick={() => { setSel([...sel, p]); setQ(""); }} className="w-full text-left px-3 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-chip">{p.name}<span className="text-eu-muted"> · {p.city ?? "—"}{p.agency ? ` · σήμερα: ${p.agency}` : ""}</span></button></li>))}</ul>}
            </div>
          )}
          <label className="grid gap-1 sm:col-span-2"><span className={lbl}>Σημειώσεις</span><textarea className={`${field} py-2 min-h-16`} value={f.notes} onChange={set("notes")} /></label>
        </div>
        <div className="grid gap-2">
          {dup && <p role="alert" className="m-0 rounded-xl border border-eu-amber/50 bg-eu-amber/10 p-3 text-eu-ink text-[length:var(--fs-14)]">Υπάρχει ήδη μεταφορέας με αυτό το όνομα ή τον ΑΦΜ: <Link className="font-bold text-eu-blue underline" href={`/admin/apostoles/praktoreia/${dup.id}`}>{dup.name}</Link>. Άνοιξέ τον αντί να φτιάξεις διπλό.</p>}
          {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold">Άκυρο</button>
            <button type="button" disabled={busy || f.name.trim().length < 3} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Δημιουργία</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
