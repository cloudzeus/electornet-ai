"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Search, Store } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { choosePartnerAction, partnerOptionsAction } from "@/app/admin/(shell)/apostoles/delivery-actions";

type Opts = Awaited<ReturnType<typeof partnerOptionsAction>>;

/** Αλλαγή του συνεργάτη / καταστήματος που αναλαμβάνει μια παραγγελία (Κέντρο ελέγχου και ροή παραγγελίας). */
export function PartnerPicker({ order, onClose }: { order: { id: string; number: string; where: string } | null; onClose: () => void }) {
  const router = useRouter();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [sel, setSel] = useState(""), [q, setQ] = useState("");
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const load = (id: string, term = "") => { setOpts(null); setSel(""); setErr(null); partnerOptionsAction(id, term).then(setOpts, () => setOpts({ known: false, current: null, stores: [] })); };
  if (order && loadedFor !== order.id) { setLoadedFor(order.id); setQ(""); load(order.id); }
  const chosen = opts?.stores.find((s) => s.id === sel);
  const close = () => { onClose(); setLoadedFor(null); };
  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg max-h-[85dvh] grid grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3">
        <DialogHeader>
          <DialogTitle>Αλλαγή συνεργάτη / καταστήματος</DialogTitle>
          <DialogDescription>{order ? `${order.number} · ${order.where}. Το κατάστημα που διαλέγεις αναλαμβάνει όλη την παραγγελία. Το ποσό του πελάτη δεν αλλάζει.` : ""}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (order) load(order.id, q); }} className="flex gap-2">
          <label className="flex-1 min-w-0 grid gap-0.5"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ψάξε άλλο κατάστημα (όνομα ή πόλη)</span><input value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="κενό = τα κοντινότερα στον πελάτη" className="rounded-lg border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-14)]" /></label>
          <button type="submit" className="self-end inline-flex items-center gap-1.5 rounded-full border border-eu-line px-4 min-h-11 font-bold text-eu-navy text-[length:var(--fs-14)]"><Search className="size-4" aria-hidden /> Αναζήτηση</button>
        </form>
        <div className="overflow-y-auto min-h-0 grid gap-1.5 content-start" data-help="kentro.partner">
          {!opts ? <p className="m-0 text-eu-muted inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Μετράω την οδική απόσταση από τον πελάτη…</p>
            : <>
              {!opts.known && !q.trim() && <p className="m-0 rounded-lg bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-13)]">Ο χάρτης δεν απάντησε, οπότε η απόσταση είναι άγνωστη. Βλέπεις τα καταστήματα της πόλης του πελάτη.</p>}
              {!opts.stores.length && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν βρέθηκε συνεργαζόμενο κατάστημα{q.trim() ? " με αυτή την αναζήτηση" : " κοντά στον πελάτη"}. Ψάξε με όνομα ή πόλη.</p>}
              {opts.stores.map((s) => (
                <label key={s.id} className={`flex items-center gap-3 rounded-xl border p-2.5 min-h-11 cursor-pointer ${sel === s.id ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                  <input type="radio" name="partner-store" className="size-5" checked={sel === s.id} onChange={() => setSel(s.id)} />
                  <span className="flex-1 min-w-0"><b className="text-eu-ink text-[length:var(--fs-14)]">{s.name}</b>
                    <span className="block text-eu-muted text-[length:var(--fs-13)]">{s.city} · {s.agency ? <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" aria-hidden /> μέσω του πρακτορείου του</span> : "παραδίδει απευθείας"}{opts.current === s.partnerId ? " · ο τωρινός συνεργάτης" : ""}</span></span>
                  <span className="text-right text-[length:var(--fs-14)] shrink-0">{s.km != null ? <b className={s.km <= 15 ? "text-eu-green" : "text-eu-navy"}>{String(s.km).replace(".", ",")} χλμ</b> : <span className="text-eu-muted">άγνωστη απόσταση</span>}</span>
                </label>
              ))}
            </>}
        </div>
        <div className="grid gap-2">
          {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
          <button type="button" disabled={!chosen || busy} onClick={() => start(async () => {
            try { await choosePartnerAction(order!.id, sel, chosen!.km); close(); router.refresh(); }
            catch (e) { setErr(e instanceof Error ? e.message : "Δεν έγινε"); }
          })} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Store className="size-4" aria-hidden />} Ανάθεση{chosen ? ` σε ${chosen.name}` : ""}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
