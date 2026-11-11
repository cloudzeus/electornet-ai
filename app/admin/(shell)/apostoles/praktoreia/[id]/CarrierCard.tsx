"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Car, Check, Database, Handshake, Loader2, Plus, Receipt, RefreshCw, Search, Truck, X } from "lucide-react";
import { ROLE_LABEL, type CarrierRole } from "@/lib/delivery/routing";
import { carrierUsageAction, saveCarrierAction, setPartnerAgencyAction } from "../../delivery-actions";
import { EntityMap } from "@/components/admin/geo/EntityMap";
import { ExtraFields } from "@/components/admin/extra/ExtraFields";
import type { MapLine, MapMarker } from "@/components/admin/stores/StoreMapClient";
import type { ExtraValues, FieldDef } from "@/lib/custom-fields";

type P = { id: string; name: string; city: string | null; agency: string | null };
export interface CardData {
  carrier: { id: string; s1Id: string | null; code: string; name: string; role: CarrierRole; phone: string | null; email: string | null; afm: string | null; address: string | null; city: string | null; zip: string | null; hours: string | null; notes: string | null; active: boolean; s1Missing: boolean };
  s1: { ADDRESS?: string; ZIP?: string; CITY?: string; PHONE01?: string; EMAIL?: string; AFM?: string; CARRIERTYPE?: string; REMARKS?: string; syncedAt: string | null } | null;
  served: { id: string; name: string; city: string | null; s1Same: boolean }[];
  suggested: P[];
  partners: P[];
  vehicles: { id: string; s1Id: string | null; name: string; plate: string | null; weightKg: number | null; volumeM3: number | null; active: boolean; s1Missing: boolean; trdr: number | null }[] | null;
  rates: { id: string; name: string; status: string; updatedAt: string }[];
  rateLink: string | null;
  routes: { orderId: string; number: string; mode: string; status: string; at: string; partner: string | null }[];
  routeCount: number;
  point: { lat: number; lng: number; source: string | null; label: string | null } | null;
  mapOthers: MapMarker[];
  mapLines: MapLine[];
  defs: FieldDef[];
  extra: ExtraValues;
}
type Tab = "overview" | "details" | "partners" | "vehicles" | "rates" | "routes" | "extra";
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";
const lbl = "text-eu-ink-3 text-[length:var(--fs-13)] font-bold";
const card = "rounded-2xl border border-eu-line bg-white p-4 min-w-0";
const MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μάι", "Ιούν", "Ιούλ", "Αύγ", "Σεπ", "Οκτ", "Νοε", "Δεκ"];
const date = (s: string) => new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Athens" });

export function CarrierCard({ data, canWrite, canLink }: { data: CardData; canWrite: boolean; canLink: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  const c = data.carrier;
  const published = data.rates.find((r) => r.status === "published");
  const TABS: { k: Tab; label: string; n?: number }[] = [
    { k: "overview", label: "Επισκόπηση" }, { k: "details", label: "Στοιχεία" },
    { k: "partners", label: "Συνεργάτες", n: data.served.length }, { k: "vehicles", label: "Οχήματα", n: data.vehicles?.length ?? 0 },
    { k: "rates", label: "Τιμοκατάλογος" }, { k: "routes", label: "Αποστολές", n: data.routeCount }, { k: "extra", label: "Πρόσθετα στοιχεία" },
  ];
  return (
    <div className="grid gap-4 min-w-0">
      <div role="tablist" data-help="carrier.tabs" className="flex flex-wrap gap-1 border-b border-eu-line">
        {TABS.map((t) => (
          <button key={t.k} role="tab" type="button" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`px-3 min-h-11 text-[length:var(--fs-14)] -mb-px border-b-2 ${tab === t.k ? "border-eu-navy text-eu-ink font-bold" : "border-transparent text-eu-ink-3"}`}>
            {t.label}{t.n != null && <span className="ml-1.5 tabular-nums text-eu-muted">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 min-w-0">
          <div data-help="carrier.kpis" className="grid grid-cols-1 @md:grid-cols-3 gap-2">
            <Kpi icon={Handshake} value={data.served.length} label={data.served.length ? "συνεργάτες τον έχουν πρακτορείο" : "κανένας συνεργάτης δεν τον έχει πρακτορείο"} tone={data.served.length ? "ok" : c.role === "agency" ? "warn" : "plain"} onClick={() => setTab("partners")} />
            <Kpi icon={Truck} value={data.routeCount} label="αποστολές eshop μέσω αυτού" tone="plain" onClick={() => setTab("routes")} />
            <Kpi icon={Receipt} value={published ? "✓" : "—"} label={published ? `τιμοκατάλογος: ${published.name}` : "χωρίς τιμοκατάλογο: το κόστος δεν υπολογίζεται"} tone={published ? "ok" : data.rateLink ? "warn" : "plain"} onClick={() => setTab("rates")} />
          </div>
          {data.suggested.length > 0 && (
            <button type="button" onClick={() => setTab("partners")} className="rounded-2xl border border-eu-blue/30 bg-eu-chip/60 p-3 text-left text-eu-ink text-[length:var(--fs-14)] min-h-11 inline-flex items-center gap-2">
              <Database className="size-4 text-eu-blue shrink-0" aria-hidden /> <span><b>{data.suggested.length}</b> συνεργάτες έχουν αυτόν τον μεταφορέα ως προεπιλογή στο SoftOne αλλά όχι στο eshop. Δες τους στους Συνεργάτες.</span>
            </button>
          )}
          <section data-help="carrier.map" className={`${card} grid gap-2`}>
            <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">Στον χάρτη</h3>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]"><span className="text-eu-red font-bold">●</span> ο μεταφορέας · <span className="text-eu-green font-bold">●</span> οι συνεργάτες που εξυπηρετεί</p>
            <EntityMap entity="carrier" id={c.id} name={c.name} point={data.point} others={data.mapOthers} lines={data.mapLines} canWrite={canWrite} />
          </section>
          {c.s1Id ? <Usage id={c.id} /> : <p className={`${card} m-0 text-eu-ink-3 text-[length:var(--fs-14)]`}>Ο μεταφορέας υπάρχει μόνο στο eshop, οπότε δεν έχει παραστατικά στο SoftOne.</p>}
        </div>
      )}

      {tab === "details" && <Details data={data} canWrite={canWrite} />}
      {tab === "extra" && <ExtraFields entity="carrier" id={c.id} defs={data.defs} values={data.extra} canWrite={canWrite} />}
      {tab === "partners" && <Partners data={data} canLink={canLink} />}

      {tab === "vehicles" && (
        <div data-help="carrier.vehicles" className={card}>
          <h3 className="m-0 mb-1 text-eu-ink text-[length:var(--fs-16)] font-bold">Οχήματα <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">από SoftOne (TRUCKS), μόνο ανάγνωση</span></h3>
          {data.vehicles === null
            ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ο πίνακας οχημάτων δεν υπάρχει ακόμη στη βάση. Χρειάζεται το <code>prisma/sql/2026-11-11-carrier-vehicles.sql</code>.</p>
            : !data.vehicles.length
              ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα όχημα. Αν έχει στο SoftOne, πάτα «Εισαγωγή από SoftOne» στη λίστα μεταφορέων.</p>
              : <ul className="m-0 p-0 list-none divide-y divide-eu-line">{data.vehicles.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Car className="size-4 text-eu-blue shrink-0" aria-hidden />
                    <span className="flex-1 min-w-[180px]"><b className="text-eu-ink text-[length:var(--fs-14)]">{v.plate ?? v.name}</b>{v.plate && v.plate !== v.name && <span className="text-eu-ink-3 text-[length:var(--fs-14)]"> · {v.name}</span>}
                      <span className="block text-eu-muted text-[length:var(--fs-13)]">{[v.weightKg ? `${v.weightKg.toLocaleString("el-GR")} kg` : null, v.volumeM3 ? `${v.volumeM3.toLocaleString("el-GR")} m³` : null, `TRUCKS ${v.s1Id ?? "—"}`].filter(Boolean).join(" · ")}</span></span>
                    <span className={`text-[length:var(--fs-13)] font-bold rounded-full px-3 py-1 ${v.s1Missing ? "bg-eu-red/10 text-eu-red" : v.active ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface-2 text-eu-ink-3"}`}>{v.s1Missing ? "δεν υπάρχει πια" : v.active ? "ενεργό" : "ανενεργό"}</span>
                  </li>))}</ul>}
        </div>
      )}

      {tab === "rates" && (
        <div data-help="carrier.rates" className={`${card} grid gap-3`}>
          <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">Τιμοκατάλογος</h3>
          {data.rates.length
            ? <ul className="m-0 p-0 list-none divide-y divide-eu-line">{data.rates.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-[length:var(--fs-14)]"><span className="flex-1 min-w-[160px] text-eu-ink">{r.name}<span className="block text-eu-muted text-[length:var(--fs-13)]">ενημέρωση {date(r.updatedAt)}</span></span>
                  <span className={`font-bold rounded-full px-3 py-1 text-[length:var(--fs-13)] ${r.status === "published" ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface-2 text-eu-ink-3"}`}>{r.status === "published" ? "σε ισχύ" : "πρόχειρο"}</span></li>))}</ul>
            : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν υπάρχει τιμοκατάλογος. Χωρίς αυτόν το κέντρο ελέγχου δεν μπορεί να συγκρίνει κόστος με άλλους μεταφορείς.</p>}
          {data.rateLink
            ? <Link href={data.rateLink} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 text-[length:var(--fs-14)] w-fit">{data.rates.length ? "Άνοιγμα τιμοκαταλόγου" : "Δημιουργία τιμοκαταλόγου"} <ArrowRight className="size-4" aria-hidden /></Link>
            : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Τιμοκατάλογο έχουν μόνο τα πρακτορεία και οι οδηγοί μας. Άλλαξε τον ρόλο στα Στοιχεία αν χρειάζεται.</p>}
        </div>
      )}

      {tab === "routes" && (
        <div data-help="carrier.routes" className={card}>
          <h3 className="m-0 mb-1 text-eu-ink text-[length:var(--fs-16)] font-bold">Αποστολές eshop <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">οι 20 πιο πρόσφατες</span></h3>
          {data.routes.length
            ? <ul className="m-0 p-0 list-none divide-y divide-eu-line">{data.routes.map((r) => (
                <li key={r.orderId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[length:var(--fs-14)]">
                  <Link href={`/admin/orders/${r.number}`} className="font-bold text-eu-blue min-h-11 inline-flex items-center">{r.number}</Link>
                  <span className="flex-1 min-w-[160px] text-eu-ink-3">{r.mode}{r.partner ? ` · ${r.partner}` : ""} · {date(r.at)}</span>
                  <span className={`font-bold rounded-full px-3 py-1 text-[length:var(--fs-13)] ${r.status === "delivered" ? "bg-eu-green/10 text-eu-green" : "bg-eu-chip text-eu-navy"}`}>{r.status === "delivered" ? "παραδόθηκε" : "σε εξέλιξη"}</span>
                </li>))}</ul>
            : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία αποστολή του eshop δεν έχει περάσει ακόμη από αυτόν τον μεταφορέα.</p>}
          <Link href="/admin/apostoles/kentro" className="inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11">Κέντρο ελέγχου αποστολών <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: I, value, label, tone, onClick }: { icon: typeof Truck; value: number | string; label: string; tone: "ok" | "warn" | "plain"; onClick: () => void }) {
  const color = tone === "ok" ? "text-eu-green" : tone === "warn" ? "text-eu-amber" : "text-eu-navy";
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-eu-line bg-white p-3 text-left grid gap-1 hover:border-eu-blue min-h-11">
      <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)]"><I className="size-4" aria-hidden /> {label}</span>
      <b className={`${color} text-[length:var(--fs-24)] tabular-nums`}>{value}</b>
    </button>
  );
}

/** Παραστατικά SoftOne ανά μήνα: μπάρες, ο τρέχων μήνας τονισμένος, τιμή πάνω από κάθε μπάρα. */
function Usage({ id }: { id: string }) {
  const [st, setSt] = useState<{ loading: boolean; error?: string; months?: { m: string; n: number }[]; at?: string }>({ loading: true });
  const fetchUsage = (force: boolean) => carrierUsageAction(id, force).then((r) => setSt(r.ok ? { loading: false, months: r.usage?.months, at: r.usage?.at } : { loading: false, error: r.error }));
  const load = (force: boolean) => { setSt((s) => ({ ...s, loading: true, error: undefined })); fetchUsage(force); };
  useEffect(() => { fetchUsage(false); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...(st.months ?? []).map((m) => m.n));
  const total = (st.months ?? []).reduce((a, m) => a + m.n, 0);
  return (
    <div data-help="carrier.usage" className="rounded-2xl border border-eu-line bg-white p-4 min-w-0 grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold flex-1 min-w-[200px]">Παραστατικά με αυτόν τον μεταφορέα <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">SoftOne, 12 μήνες</span></h3>
        {st.months && <b className="text-eu-navy text-[length:var(--fs-20)] tabular-nums">{total.toLocaleString("el-GR")}</b>}
        <button type="button" disabled={st.loading} onClick={() => load(true)} aria-label="Ανανέωση από SoftOne" className="size-11 grid place-items-center rounded-full border border-eu-line disabled:opacity-50">{st.loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}</button>
      </div>
      {st.error && <p role="alert" className="m-0 text-eu-ink text-[length:var(--fs-14)] inline-flex gap-2"><AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden /> Δεν ήρθαν στοιχεία από το SoftOne: {st.error}</p>}
      {st.loading && !st.months && <div className="h-40 rounded-xl bg-eu-surface-2 animate-pulse" aria-label="Φόρτωση" />}
      {st.months && (total === 0
        ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα παραστατικό τους τελευταίους 12 μήνες. Το SoftOne γράφει μεταφορέα στα παραστατικά μόνο από το 2025· για παλιότερα πρακτορεία δες τα σχόλια των παραστατικών.</p>
        : <figure className="m-0 grid gap-1" aria-label={`Παραστατικά ανά μήνα, σύνολο ${total}`}>
            <div className="grid grid-cols-12 gap-1 items-end h-40 border-b border-eu-line">
              {st.months.map((m, i) => { const last = i === st.months!.length - 1; return (
                <div key={m.m} className="flex flex-col items-center justify-end h-full min-w-0" title={`${MONTHS[Number(m.m.slice(5)) - 1]} ${m.m.slice(0, 4)}: ${m.n}`}>
                  <span className={`tabular-nums text-[length:var(--fs-12)] ${last ? "text-eu-navy font-bold" : "text-eu-muted"}`}>{m.n || ""}</span>
                  <div className={`w-full max-w-8 rounded-t ${last ? "bg-eu-blue" : "bg-eu-blue/35"}`} style={{ height: `${(m.n / max) * 85}%`, minHeight: m.n ? 3 : 0 }} />
                </div>); })}
            </div>
            <div className="grid grid-cols-12 gap-1">{st.months.map((m) => <span key={m.m} className="text-center text-eu-muted text-[length:var(--fs-12)] truncate">{MONTHS[Number(m.m.slice(5)) - 1]}</span>)}</div>
            {st.at && <figcaption className="text-eu-muted text-[length:var(--fs-12)]">Ενημέρωση {new Date(st.at).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" })}. Ο τρέχων μήνας είναι μέχρι σήμερα.</figcaption>}
          </figure>)}
    </div>
  );
}

function Details({ data, canWrite }: { data: CardData; canWrite: boolean }) {
  const router = useRouter();
  const c = data.carrier;
  const [f, setF] = useState({ role: c.role, afm: c.afm ?? "", address: c.address ?? "", city: c.city ?? "", zip: c.zip ?? "", hours: c.hours ?? "", email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "" });
  const [busy, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };
  const s1 = data.s1;
  const S1ROWS: [string, string | undefined][] = s1 ? [["Διεύθυνση", [s1.ADDRESS, s1.ZIP, s1.CITY].filter(Boolean).join(", ")], ["Τηλέφωνο", s1.PHONE01], ["Email", s1.EMAIL], ["ΑΦΜ", s1.AFM], ["Τύπος", s1.CARRIERTYPE], ["Παρατηρήσεις", s1.REMARKS]] : [];
  return (
    <div className="grid gap-4 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
      <div data-help="carrier.details" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3 @xl:grid-cols-2 min-w-0">
        <label className="grid gap-1"><span className={lbl}>Ρόλος</span><select className={field} value={f.role} disabled={!canWrite} onChange={(e) => { setF({ ...f, role: e.target.value as CarrierRole }); setSaved(false); }}>{(Object.keys(ROLE_LABEL) as CarrierRole[]).map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select></label>
        <label className="grid gap-1"><span className={lbl}>ΑΦΜ</span><input className={field} value={f.afm} onChange={set("afm")} disabled={!canWrite} inputMode="numeric" maxLength={12} /></label>
        <label className="grid gap-1"><span className={lbl}>Τηλέφωνο</span><input className={field} value={f.phone} onChange={set("phone")} disabled={!canWrite} inputMode="tel" /></label>
        <label className="grid gap-1"><span className={lbl}>Email</span><input className={field} value={f.email} onChange={set("email")} disabled={!canWrite} type="email" /></label>
        <label className="grid gap-1 @xl:col-span-2"><span className={lbl}>Διεύθυνση παραλαβής</span><input className={field} value={f.address} onChange={set("address")} disabled={!canWrite} /></label>
        <label className="grid gap-1"><span className={lbl}>Πόλη</span><input className={field} value={f.city} onChange={set("city")} disabled={!canWrite} /></label>
        <label className="grid gap-1"><span className={lbl}>Τ.Κ.</span><input className={field} value={f.zip} onChange={set("zip")} disabled={!canWrite} inputMode="numeric" maxLength={5} /></label>
        <label className="grid gap-1 @xl:col-span-2"><span className={lbl}>Ωράριο παραλαβής</span><input className={field} value={f.hours} onChange={set("hours")} disabled={!canWrite} placeholder="π.χ. Δευ–Παρ 08:00–16:00" /></label>
        <label className="grid gap-1 @xl:col-span-2"><span className={lbl}>Σημειώσεις</span><textarea className={`${field} py-2 min-h-20`} value={f.notes} onChange={set("notes")} disabled={!canWrite} /></label>
        {canWrite && <div className="@xl:col-span-2 flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => start(async () => { await saveCarrierAction(c.id, f); setSaved(true); router.refresh(); })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
          {saved && <span role="status" className="text-eu-green font-bold text-[length:var(--fs-14)]">Αποθηκεύτηκε</span>}
        </div>}
      </div>
      <div data-help="carrier.s1" className="rounded-2xl border border-eu-line bg-eu-surface p-4 grid gap-2 min-w-0">
        <h3 className="m-0 text-eu-ink text-[length:var(--fs-15)] font-bold inline-flex items-center gap-1.5"><Database className="size-4 text-eu-blue" aria-hidden /> Στο SoftOne</h3>
        {s1 ? <>
          <dl className="m-0 grid gap-1.5">{S1ROWS.map(([k, v]) => <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-[length:var(--fs-14)]"><dt className="text-eu-ink-3">{k}</dt><dd className="m-0 text-eu-ink [overflow-wrap:anywhere]">{v || "—"}</dd></div>)}</dl>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Μόνο ανάγνωση. Η εισαγωγή συμπληρώνει τα κενά πεδία στα αριστερά, χωρίς να σβήνει ό,τι έχεις γράψει.{s1.syncedAt ? ` Τελευταία εισαγωγή ${date(s1.syncedAt)}.` : ""}</p>
        </> : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Δεν υπάρχει στο SoftOne. Όταν ανοίξουν ξανά οι εγγραφές, μπορεί να δημιουργηθεί εκεί με τα ίδια στοιχεία.</p>}
      </div>
    </div>
  );
}

function Partners({ data, canLink }: { data: CardData; canLink: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const c = data.carrier;
  const served = new Set(data.served.map((p) => p.id));
  const hits = useMemo(() => (q.length < 2 ? [] : data.partners.filter((p) => !served.has(p.id) && `${p.name} ${p.city ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)), [q, data.partners]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = async (pid: string, to: string | null) => {
    setBusy(pid); setErr(null);
    try { await setPartnerAgencyAction(pid, to); setQ(""); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Δεν αποθηκεύτηκε"); } finally { setBusy(null); }
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full font-bold px-4 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50";
  return (
    <div className="grid gap-4 min-w-0">
      {c.role !== "agency" && <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-3 text-eu-ink text-[length:var(--fs-14)]">Ο ρόλος του δεν είναι «Πρακτορείο». Οι συνεργάτες δένονται με πρακτορεία· άλλαξε τον ρόλο στα Στοιχεία αν αυτός είναι πρακτορείο.</p>}
      {err && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
      <div data-help="carrier.partners" className="rounded-2xl border border-eu-line bg-white p-4 min-w-0 grid gap-2">
        <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">Συνεργάτες που εξυπηρετεί <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">εδώ ο οδηγός μας αφήνει τα προϊόντα τους</span></h3>
        {data.served.length
          ? <ul className="m-0 p-0 list-none divide-y divide-eu-line">{data.served.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="flex-1 min-w-[180px]"><Link href={`/admin/synergates/${p.id}`} className="font-bold text-eu-ink hover:text-eu-blue text-[length:var(--fs-14)]">{p.name}</Link><span className="block text-eu-muted text-[length:var(--fs-13)]">{p.city ?? "—"}{p.s1Same ? " · το ίδιο και στο SoftOne" : ""}</span></span>
                {canLink && <button type="button" disabled={busy === p.id} onClick={() => link(p.id, null)} className={`${btn} border border-eu-line text-eu-ink-3`}>{busy === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />} Αφαίρεση</button>}
              </li>))}</ul>
          : <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένας συνεργάτης ακόμη.</p>}
        {canLink && c.role === "agency" && (
          <div className="grid gap-1 pt-2">
            <label className="relative max-w-md"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden /><input className={`${field} pl-9 rounded-full`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Προσθήκη: όνομα ή πόλη συνεργάτη" aria-label="Προσθήκη συνεργάτη" /></label>
            {hits.length > 0 && <ul className="m-0 p-0 list-none rounded-lg border border-eu-line divide-y divide-eu-line max-w-xl">{hits.map((p) => (
              <li key={p.id}><button type="button" disabled={!!busy} onClick={() => link(p.id, c.id)} className="w-full text-left px-3 min-h-11 text-[length:var(--fs-14)] hover:bg-eu-chip inline-flex items-center gap-2"><Plus className="size-4 text-eu-blue shrink-0" aria-hidden /><span>{p.name}<span className="text-eu-muted"> · {p.city ?? "—"}{p.agency ? ` · σήμερα: ${p.agency}` : ""}</span></span></button></li>))}</ul>}
          </div>
        )}
      </div>
      {data.suggested.length > 0 && (
        <div data-help="carrier.suggested" className="rounded-2xl border border-eu-blue/30 bg-eu-chip/50 p-4 min-w-0 grid gap-2">
          <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold inline-flex items-center gap-1.5"><Database className="size-4 text-eu-blue" aria-hidden /> Προεπιλεγμένος μεταφορέας στο SoftOne</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Στην καρτέλα πελάτη του SoftOne αυτοί οι συνεργάτες έχουν αυτόν τον μεταφορέα, αλλά στο eshop όχι.</p>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line/70">{data.suggested.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="flex-1 min-w-[180px]"><b className="text-eu-ink text-[length:var(--fs-14)]">{p.name}</b><span className="block text-eu-muted text-[length:var(--fs-13)]">{p.city ?? "—"} · {p.agency ? `στο eshop: ${p.agency}` : "χωρίς πρακτορείο στο eshop"}</span></span>
              {canLink && c.role === "agency" && <button type="button" disabled={busy === p.id} onClick={() => link(p.id, c.id)} className={`${btn} bg-eu-navy text-white`}>{busy === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Ορισμός</button>}
            </li>))}</ul>
        </div>
      )}
    </div>
  );
}
