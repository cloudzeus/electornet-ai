"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Car, Check, ChevronDown, Loader2, Package, Search, Sparkles, Truck, User } from "lucide-react";
import { ROLE_LABEL, type CarrierRole } from "@/lib/delivery/routing";
import { saveCarrierAction, setRolesAction } from "../delivery-actions";

export interface CarrierRow { id: string; s1Id: string | null; code: string; name: string; role: CarrierRole; phone: string | null; address: string | null; city: string | null; zip: string | null; hours: string | null; email: string | null; notes: string | null; active: boolean; partners: number; suggested: CarrierRole }
const ICON: Record<CarrierRole, typeof Truck> = { driver: User, courier: Package, agency: Building2, "partner-vehicle": Car, other: Truck };
const ROLES = Object.keys(ROLE_LABEL) as CarrierRole[];
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";

export function CarrierRoles({ rows, canWrite }: { rows: CarrierRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [role, setRole] = useState<CarrierRole | "all" | "pending">("all"), [open, setOpen] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const pending = rows.filter((r) => r.role === "other" && r.suggested !== "other");
  const counts = Object.fromEntries(ROLES.map((r) => [r, rows.filter((x) => x.role === r).length])) as Record<CarrierRole, number>;
  const shown = useMemo(() => rows.filter((r) => (role === "all" || (role === "pending" ? r.role === "other" && r.suggested !== "other" : r.role === role)) && (!q || `${r.name} ${r.code} ${r.s1Id ?? ""} ${r.city ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, role]);
  const acceptAll = () => start(async () => { await setRolesAction(pending.map((r) => ({ id: r.id, role: r.suggested }))); router.refresh(); });

  return (
    <div className="grid gap-4 min-w-0">
      <div data-help="agencies.roles" className="grid grid-cols-2 @2xl:grid-cols-5 gap-2">
        {ROLES.map((r) => { const I = ICON[r]; return (
          <button key={r} type="button" onClick={() => setRole(role === r ? "all" : r)} aria-pressed={role === r} className={`rounded-2xl border p-3 text-left grid gap-1 min-h-11 ${role === r ? "border-eu-navy bg-eu-chip" : "border-eu-line bg-white hover:border-eu-blue"}`}>
            <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)] font-bold"><I className="size-4" aria-hidden /> {ROLE_LABEL[r]}</span>
            <b className="text-eu-navy text-[length:var(--fs-22)] tabular-nums">{counts[r]}</b>
          </button>
        ); })}
      </div>

      {pending.length > 0 && (
        <div data-help="agencies.suggest" className="rounded-2xl border border-eu-blue/30 bg-eu-chip/60 p-4 flex flex-wrap items-center gap-3">
          <Sparkles className="size-5 text-eu-blue shrink-0" aria-hidden />
          <p className="m-0 flex-1 min-w-[220px] text-eu-ink text-[length:var(--fs-14)]"><b>{pending.length}</b> μεταφορείς έχουν πρόταση ρόλου από τον κωδικό SoftOne (1xxx οδηγοί μας, 2xxx couriers) ή το όνομα (πρακτορείο, ίδιο με συνεργάτη). Έλεγξέ τις με το φίλτρο «Με πρόταση» ή δέξου όλες.</p>
          <button type="button" onClick={() => setRole("pending")} className="rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)]">Με πρόταση</button>
          {canWrite && <button type="button" disabled={busy} onClick={acceptAll} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποδοχή όλων</button>}
        </div>
      )}

      <label className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Όνομα, πινακίδα, κωδικός, πόλη" aria-label="Αναζήτηση μεταφορέα" className="w-full rounded-full border border-eu-line bg-white pl-9 pr-3 min-h-11 text-[length:var(--fs-14)]" />
      </label>

      <ul className="m-0 p-0 list-none grid gap-2">
        {shown.map((r) => <Row key={r.id} r={r} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} canWrite={canWrite} />)}
        {!shown.length && <li className="text-eu-muted text-[length:var(--fs-14)] p-4">Κανένας μεταφορέας με αυτά τα φίλτρα.</li>}
      </ul>
    </div>
  );
}

function Row({ r, open, toggle, canWrite }: { r: CarrierRow; open: boolean; toggle: () => void; canWrite: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ role: r.role, address: r.address ?? "", city: r.city ?? "", zip: r.zip ?? "", hours: r.hours ?? "", email: r.email ?? "", phone: r.phone ?? "", notes: r.notes ?? "" });
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const I = ICON[r.role];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };
  return (
    <li className="rounded-2xl bg-white border border-eu-line min-w-0">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left min-h-11">
        <I className="size-5 text-eu-blue shrink-0" aria-hidden />
        <span className="flex-1 min-w-[180px]"><b className="text-eu-ink text-[length:var(--fs-15)]">{r.name}</b><span className="block text-eu-muted text-[length:var(--fs-13)]">{r.s1Id ? `SOCARRIER ${r.s1Id}` : "μόνο eshop"} · {r.code}{r.city ? ` · ${r.city}` : ""}</span></span>
        <span className="text-[length:var(--fs-13)] font-bold rounded-full bg-eu-chip text-eu-navy px-3 py-1">{ROLE_LABEL[r.role]}</span>
        {r.role === "other" && r.suggested !== "other" && <span className="text-[length:var(--fs-13)] text-eu-blue font-bold">Πρόταση: {ROLE_LABEL[r.suggested]}</span>}
        {r.partners > 0 && <span className="text-[length:var(--fs-13)] text-eu-ink-3">{r.partners} συνεργάτες</span>}
        <ChevronDown className={`size-4 text-eu-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-eu-line p-3 grid gap-3 @2xl:grid-cols-3">
          <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ρόλος</span>
            <select className={field} value={f.role} disabled={!canWrite} onChange={(e) => { setF({ ...f, role: e.target.value as CarrierRole }); setSaved(false); }}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select>
          </label>
          <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Τηλέφωνο</span><input className={field} value={f.phone} onChange={set("phone")} disabled={!canWrite} inputMode="tel" /></label>
          <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Email</span><input className={field} value={f.email} onChange={set("email")} disabled={!canWrite} type="email" /></label>
          {f.role === "agency" && <>
            <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Διεύθυνση παραλαβής</span><input className={field} value={f.address} onChange={set("address")} disabled={!canWrite} /></label>
            <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Πόλη</span><input className={field} value={f.city} onChange={set("city")} disabled={!canWrite} /></label>
            <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Τ.Κ.</span><input className={field} value={f.zip} onChange={set("zip")} disabled={!canWrite} inputMode="numeric" maxLength={5} /></label>
            <label className="grid gap-1 @2xl:col-span-3"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ωράριο παραλαβής</span><input className={field} value={f.hours} onChange={set("hours")} disabled={!canWrite} placeholder="π.χ. Δευ–Παρ 08:00–16:00" /></label>
          </>}
          <label className="grid gap-1 @2xl:col-span-3"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Σημειώσεις</span><textarea className={`${field} py-2 min-h-20`} value={f.notes} onChange={set("notes")} disabled={!canWrite} /></label>
          <div className="@2xl:col-span-3 flex flex-wrap items-center gap-3">
            <Link href={`/admin/apostoles/praktoreia/${r.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 text-[length:var(--fs-14)]">Καρτέλα: συνεργάτες, οχήματα, αποστολές <ArrowRight className="size-4" aria-hidden /></Link>
          {canWrite && <>
            <button type="button" disabled={busy} onClick={() => start(async () => { await saveCarrierAction(r.id, f); setSaved(true); router.refresh(); })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
            {saved && <span role="status" className="text-eu-green font-bold text-[length:var(--fs-14)]">Αποθηκεύτηκε</span>}
          </>}
          </div>
        </div>
      )}
    </li>
  );
}
