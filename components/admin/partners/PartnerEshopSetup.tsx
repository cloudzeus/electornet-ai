"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Check, Circle, Loader2, MapPin, Save, Sparkles } from "lucide-react";
import type { PartnerDelivery } from "@/lib/delivery/routing";
import { partnerImpactAction, savePartnerDeliveryAction } from "@/app/admin/(shell)/apostoles/delivery-actions";

export interface SetupStep { key: string; label: string; done: boolean; hint: string }
export interface AgencyOption { id: string; name: string; city: string | null; suggested: boolean }

/** Αρχικοποίηση συνεργάτη για το eshop: τι λείπει (6 βήματα), ποιους Τ.Κ. εξυπηρετεί, τι μπορεί, ποιο πρακτορείο τον τροφοδοτεί. */
export function PartnerEshopSetup({ partnerId, steps, initial, agencyId, agencies, defaultZip, canWrite }: { partnerId: string; steps: SetupStep[]; initial: PartnerDelivery; agencyId: string | null; agencies: AgencyOption[]; defaultZip: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [zips, setZips] = useState(initial.zips.join(", ") || (defaultZip ? defaultZip.slice(0, 3) : ""));
  const [f, setF] = useState({ homeDelivery: initial.homeDelivery, bulkyOk: initial.bulkyOk, installs: initial.installs, eta: initial.eta });
  const [agency, setAgency] = useState(agencyId ?? "");
  const [impact, setImpact] = useState<{ orders: number; total: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const [calc, startCalc] = useTransition();
  const done = steps.filter((s) => s.done).length;
  const check = (k: "homeDelivery" | "bulkyOk" | "installs", label: string) => (
    <label className="flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] text-eu-ink"><input type="checkbox" className="size-5" checked={f[k]} disabled={!canWrite} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <section data-help="partner.eshop-setup" className="@container rounded-xl border border-eu-line bg-white p-3 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 font-heading font-bold text-[length:var(--fs-16)]">Αρχικοποίηση για το eshop</h3>
        <span className={`text-[length:var(--fs-13)] font-bold ${done === steps.length ? "text-eu-green" : "text-eu-amber"}`}>{done} από {steps.length} έτοιμα</span>
      </div>
      <div className="h-2 rounded-full bg-eu-chip overflow-hidden" aria-hidden><div className="h-full bg-eu-green" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol data-help="partner.eshop-steps" className="m-0 p-0 list-none grid gap-1.5 @2xl:grid-cols-2">
        {steps.map((s) => (
          <li key={s.key} className="flex gap-2 items-start text-[length:var(--fs-14)]">
            {s.done ? <Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-label="έτοιμο" /> : <Circle className="size-4 text-eu-muted shrink-0 mt-0.5" aria-label="εκκρεμεί" />}
            <span><b className={s.done ? "text-eu-ink" : "text-eu-ink-3"}>{s.label}</b><span className="block text-eu-muted text-[length:var(--fs-13)]">{s.hint}</span></span>
          </li>
        ))}
      </ol>

      <div data-help="partner.eshop-zips" className="grid gap-1">
        <label htmlFor="zips" className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden /> Τ.Κ. που εξυπηρετεί (προθέματα ή πλήρεις)</label>
        <textarea id="zips" value={zips} disabled={!canWrite} onChange={(e) => { setZips(e.target.value); setImpact(null); }} className="rounded-lg border border-eu-line bg-white px-2.5 py-2 min-h-20 text-[length:var(--fs-14)] w-full" placeholder="π.χ. 521, 522 ή 52100, 52200" />
        <div className="flex flex-wrap items-center gap-3 text-[length:var(--fs-13)]">
          <button type="button" disabled={calc} onClick={() => startCalc(async () => setImpact(await partnerImpactAction(zips)))} className="inline-flex items-center gap-1 text-eu-blue font-bold min-h-11">{calc ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Πόσες παραγγελίες θα έπαιρνε;</button>
          {impact && <span className="text-eu-ink">Τους τελευταίους 6 μήνες: <b className="text-eu-navy">{impact.orders}</b> από {impact.total} παραγγελίες μεταφορικής ή ραντεβού είχαν αυτούς τους Τ.Κ.{impact.orders === 0 ? " Κανένα όφελος ακόμη: έλεγξε τους Τ.Κ." : ""}</span>}
        </div>
      </div>

      <div data-help="partner.eshop-caps" className="grid gap-x-4 @2xl:grid-cols-2">
        {check("homeDelivery", "Παραδίδει στο σπίτι του πελάτη")}
        {check("bulkyOk", "Παραδίδει ογκώδη (λευκές συσκευές, μεγάλες τηλεοράσεις)")}
        {check("installs", "Κάνει εγκατάσταση (παραγγελίες με ραντεβού)")}
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Χρόνος παράδοσης που βλέπει ο πελάτης</span><input value={f.eta} disabled={!canWrite} maxLength={60} onChange={(e) => setF({ ...f, eta: e.target.value })} placeholder="π.χ. 2–4 εργάσιμες" className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full" /></label>
      </div>

      <div data-help="partner.eshop-agency" className="grid gap-1">
        <label htmlFor="agency" className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-1"><Building2 className="size-3.5" aria-hidden /> Πρακτορείο που τον τροφοδοτεί</label>
        <select id="agency" value={agency} disabled={!canWrite} onChange={(e) => setAgency(e.target.value)} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full max-w-xl">
          <option value="">Χωρίς πρακτορείο (μόνο από δικό του απόθεμα)</option>
          {agencies.map((a) => <option key={a.id} value={a.id}>{a.suggested ? "★ " : ""}{a.name}{a.city ? ` · ${a.city}` : ""}</option>)}
        </select>
        <span className="text-eu-muted text-[length:var(--fs-13)]">{agencies.length ? "★ = το χρησιμοποιούν συνεργάτες της ίδιας περιοχής. " : ""}Δεν βλέπεις το πρακτορείο; Όρισέ το στα <Link href="/admin/apostoles/praktoreia" className="text-eu-blue font-bold">Πρακτορεία</Link>.</span>
      </div>

      {msg && <p role="status" className={`m-0 rounded-xl p-3 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      {canWrite && (
        <button type="button" disabled={busy} onClick={() => start(async () => {
          try { const r = await savePartnerDeliveryAction(partnerId, { ...f, zips }, agency || null); setMsg({ ok: true, t: `Αποθηκεύτηκε: ${r.zips} Τ.Κ. Οι νέες παραγγελίες της περιοχής δρομολογούνται σε αυτόν.` }); router.refresh(); }
          catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Δεν αποθηκεύτηκε" }); }
        })} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>
      )}
    </section>
  );
}
