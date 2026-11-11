"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, CircleDot, Clock, Loader2, MapPin, Package, RefreshCw, Search, Store, Truck, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODE_LABEL, STEP_LABEL, type RouteMode, type StepKey } from "@/lib/delivery/routing";
import { chooseCarrierAction, freightOptionsAction, markStepAction, rerouteAction } from "../delivery-actions";

type Who = { id: string; name: string; city?: string | null; phone: string | null } | null;
export interface RouteRow {
  orderId: string; number: string; orderStatus: string; total: number; createdAt: string;
  to: { name: string; city: string; zip: string; phone: string };
  mode: RouteMode; status: string; reason: string | null; cost: number | null;
  partner: Who; agency: Who; carrier: Who;
  courier: { carrier: string; tracking: string | null; status: string } | null;
  steps: { key: string; doneAt: string | null; ref: string | null; proof: string | null; note: string | null }[];
  waiting: string | null; days: number;
}
type Kpi = Record<"unrouted" | "stuck" | "agency" | "partner" | "freight" | "courier" | "delivered", number>;
type Filter = "all" | "unrouted" | "stuck" | "agency" | "partner" | "freight" | "courier" | "delivered";

const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
const day = (s: string) => new Date(s).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" });
const MODE_ICON: Record<RouteMode, typeof Truck> = { courier: Package, pickup: Store, partner: Store, agency: Building2, freight: Truck, unrouted: AlertTriangle };
/** χρώμα με νόημα: κόκκινο = θέλει απόφαση, πορτοκαλί = κόλλησε, μπλε τόνοι = σε κίνηση, πράσινο = παραδόθηκε */
const MODE_COLOR: Record<RouteMode, string> = { unrouted: "bg-eu-red", agency: "bg-eu-navy", partner: "bg-eu-blue", pickup: "bg-eu-blue/60", freight: "bg-eu-amber", courier: "bg-eu-ink-3" };

export function ControlBoard({ rows, kpi, stuckDays, canWrite }: { rows: RouteRow[]; kpi: Kpi; stuckDays: number; canWrite: boolean }) {
  const [f, setF] = useState<Filter>(kpi.unrouted ? "unrouted" : "all");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<RouteRow | null>(null);
  const shown = useMemo(() => rows.filter((r) => {
    const okF = f === "all" ? r.status === "open" : f === "delivered" ? r.status === "delivered" : f === "stuck" ? r.status === "open" && r.mode !== "unrouted" && r.days >= stuckDays : f === "partner" ? r.status === "open" && (r.mode === "partner" || r.mode === "pickup") : r.status === "open" && r.mode === f;
    return okF && (!q || `${r.number} ${r.to.name} ${r.to.city} ${r.to.zip} ${r.partner?.name ?? ""} ${r.agency?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  }).sort((a, b) => b.days - a.days), [rows, f, q, stuckDays]);
  const openRows = rows.filter((r) => r.status === "open");
  const tiles: { k: Filter; label: string; n: number; tone: string; hint: string }[] = [
    { k: "unrouted", label: "Θέλουν μεταφορική", n: kpi.unrouted, tone: kpi.unrouted ? "border-eu-red bg-eu-red/5 text-eu-red" : "border-eu-line text-eu-green", hint: kpi.unrouted ? "Κανένας συνεργάτης δεν τις καλύπτει: διάλεξε μεταφορέα" : "Όλες έχουν δρομολόγηση" },
    { k: "stuck", label: `Ακίνητες ${stuckDays}+ ημέρες`, n: kpi.stuck, tone: kpi.stuck ? "border-eu-amber bg-eu-amber/10 text-eu-ink" : "border-eu-line text-eu-green", hint: kpi.stuck ? "Πάρε τηλέφωνο αυτόν που την έχει" : "Καμία καθυστέρηση" },
    { k: "agency", label: "Μέσω πρακτορείου", n: kpi.agency, tone: "border-eu-line text-eu-navy", hint: "Οδηγός → πρακτορείο → συνεργάτης" },
    { k: "partner", label: "Στους συνεργάτες", n: kpi.partner, tone: "border-eu-line text-eu-navy", hint: "Από απόθεμα ή για παραλαβή" },
    { k: "freight", label: "Μεταφορική", n: kpi.freight, tone: "border-eu-line text-eu-navy", hint: "Απευθείας στον πελάτη" },
    { k: "delivered", label: "Παραδόθηκαν (7 ημ.)", n: kpi.delivered, tone: "border-eu-line text-eu-green", hint: "Με απόδειξη παράδοσης" },
  ];
  const modes = (Object.keys(MODE_LABEL) as RouteMode[]).map((m) => ({ m, n: openRows.filter((r) => r.mode === m).length })).filter((x) => x.n);

  return (
    <div className="grid gap-4 min-w-0">
      <div data-help="kentro.kpi" className="grid grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-6 gap-2">
        {tiles.map((t) => (
          <button key={t.k} type="button" aria-pressed={f === t.k} onClick={() => setF(f === t.k ? "all" : t.k)} className={`rounded-2xl border-2 p-3 text-left grid gap-0.5 min-h-11 bg-white ${t.tone} ${f === t.k ? "ring-2 ring-eu-navy ring-offset-1" : ""}`}>
            <span className="text-[length:var(--fs-13)] font-bold text-eu-ink-3">{t.label}</span>
            <b className="text-[length:var(--fs-28)] tabular-nums leading-none">{t.n}</b>
            <span className="text-[length:var(--fs-13)] text-eu-muted leading-snug">{t.hint}</span>
          </button>
        ))}
      </div>

      {openRows.length > 0 && (
        <figure data-help="kentro.share" className="m-0 grid gap-1.5">
          <figcaption className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">{openRows.length} ανοιχτές παραδόσεις, ανά τρόπο</figcaption>
          <div className="flex h-3 rounded-full overflow-hidden bg-eu-chip" role="img" aria-label={modes.map((x) => `${MODE_LABEL[x.m]} ${x.n}`).join(", ")}>
            {modes.map((x) => <div key={x.m} className={MODE_COLOR[x.m]} style={{ width: `${(x.n / openRows.length) * 100}%` }} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13)] text-eu-ink-3">
            {modes.map((x) => <span key={x.m} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${MODE_COLOR[x.m]}`} aria-hidden />{MODE_LABEL[x.m]} <b className="text-eu-ink tabular-nums">{x.n}</b></span>)}
          </div>
        </figure>
      )}

      <label className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Παραγγελία, πελάτης, πόλη, Τ.Κ., συνεργάτης" aria-label="Αναζήτηση παράδοσης" className="w-full rounded-full border border-eu-line bg-white pl-9 pr-3 min-h-11 text-[length:var(--fs-14)]" />
      </label>

      <ul data-help="kentro.list" className="m-0 p-0 list-none grid gap-2">
        {shown.map((r) => <RouteCard key={r.orderId} r={r} stuck={r.days >= stuckDays} canWrite={canWrite} onPick={() => setPick(r)} />)}
        {!shown.length && <li className="rounded-2xl border border-eu-line bg-white p-6 text-center text-eu-muted text-[length:var(--fs-14)]">{f === "unrouted" ? "Καμία παράδοση δεν περιμένει επιλογή μεταφορικής." : "Καμία παράδοση με αυτά τα φίλτρα."}</li>}
      </ul>

      <CarrierPicker row={pick} onClose={() => setPick(null)} />
    </div>
  );
}

function RouteCard({ r, stuck, canWrite, onPick }: { r: RouteRow; stuck: boolean; canWrite: boolean; onPick: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [ref, setRef] = useState(""), [proof, setProof] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const I = MODE_ICON[r.mode];
  const who = r.mode === "agency" ? r.agency : r.mode === "freight" ? r.carrier : r.partner;
  const lastDone = [...r.steps].reverse().find((s) => s.doneAt);
  const run = (fn: () => Promise<unknown>) => start(async () => { setErr(null); try { await fn(); setRef(""); setProof(""); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "Δεν έγινε"); } });
  const needsRef = r.waiting === "agency" || r.waiting === "carrier";
  return (
    <li className={`rounded-2xl bg-white border p-3 grid gap-2.5 min-w-0 ${r.mode === "unrouted" ? "border-eu-red/50" : stuck && r.status === "open" ? "border-eu-amber" : "border-eu-line"}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <I className={`size-5 shrink-0 mt-0.5 ${r.mode === "unrouted" ? "text-eu-red" : "text-eu-blue"}`} aria-hidden />
        <div className="flex-1 min-w-[200px]">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Link href={`/admin/orders/${encodeURIComponent(r.number)}`} className="font-mono font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline">{r.number}</Link>
            <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{day(r.createdAt)} · {eur(r.total)}</span>
          </div>
          <div className="text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-1"><MapPin className="size-3.5 text-eu-muted" aria-hidden />{r.to.name || "—"} · {r.to.city} {r.to.zip}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-eu-navy text-[length:var(--fs-13)]">{MODE_LABEL[r.mode]}</div>
          {who && <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{who.name}{who.phone ? <> · <a href={`tel:${who.phone}`} className="text-eu-blue">{who.phone}</a></> : null}</div>}
          {r.status === "open" && r.mode !== "unrouted" && <div className={`text-[length:var(--fs-13)] inline-flex items-center gap-1 ${stuck ? "text-eu-amber font-bold" : "text-eu-muted"}`}><Clock className="size-3.5" aria-hidden />{r.days === 0 ? "σήμερα" : `${r.days} ημ. στο ίδιο βήμα`}</div>}
        </div>
      </div>

      {r.mode === "unrouted" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-eu-red/5 p-2.5">
          <p className="m-0 flex-1 min-w-[200px] text-eu-ink text-[length:var(--fs-14)]">{r.reason}</p>
          {canWrite && <>
            <button type="button" onClick={onPick} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11 text-[length:var(--fs-14)]"><Truck className="size-4" aria-hidden /> Διάλεξε μεταφορική</button>
            <button type="button" disabled={busy} onClick={() => run(() => rerouteAction(r.orderId))} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-navy disabled:opacity-60" title="Μετά από αλλαγή σε συνεργάτη ή απόθεμα">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Ξανά δρομολόγηση</button>
          </>}
        </div>
      ) : (
        <ol className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Σκέλη διαδρομής">
          {r.steps.map((s) => {
            const now = s.key === r.waiting;
            return (
              <li key={s.key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--fs-13)] ${s.doneAt ? "bg-eu-green/10 text-eu-ink" : now ? "bg-eu-chip text-eu-navy font-bold ring-1 ring-eu-navy" : "bg-eu-surface text-eu-muted"}`}>
                {s.doneAt ? <Check className="size-3.5 text-eu-green" aria-hidden /> : <CircleDot className="size-3.5" aria-hidden />}
                {STEP_LABEL[s.key as StepKey] ?? s.key}{s.doneAt ? ` · ${day(s.doneAt)}` : ""}{s.ref ? ` · ${s.ref}` : ""}{s.proof ? ` · ${s.proof}` : ""}
              </li>
            );
          })}
          {r.courier && <li className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2.5 py-1 text-[length:var(--fs-13)] text-eu-ink-3">Voucher {r.courier.carrier} {r.courier.tracking ?? ""} · {r.courier.status}</li>}
        </ol>
      )}

      {canWrite && r.status === "open" && r.waiting && (
        <div data-help="kentro.step" className="flex flex-wrap items-end gap-2">
          {needsRef && <label className="grid gap-0.5 min-w-[160px] flex-1 max-w-xs"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Αρ. παραλαβής (προαιρετικό)</span><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className="rounded-lg border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-14)]" /></label>}
          {r.waiting === "customer" && <label className="grid gap-0.5 min-w-[160px] flex-1 max-w-xs"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ποιος παρέλαβε</span><input value={proof} onChange={(e) => setProof(e.target.value)} maxLength={80} placeholder="όνομα παραλήπτη" className="rounded-lg border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-14)]" /></label>}
          <button type="button" disabled={busy} onClick={() => run(() => markStepAction(r.orderId, r.waiting as StepKey, { ref, proof }))} className="inline-flex items-center gap-1.5 rounded-full bg-eu-green text-white font-extrabold px-4 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} {STEP_LABEL[r.waiting as StepKey]}</button>
          {lastDone && <button type="button" disabled={busy} onClick={() => run(() => markStepAction(r.orderId, lastDone.key as StepKey, { undo: true }))} className="inline-flex items-center gap-1 rounded-full px-3 min-h-11 text-[length:var(--fs-13)] text-eu-ink-3 hover:text-eu-navy"><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>}
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </li>
  );
}

function CarrierPicker({ row, onClose }: { row: RouteRow | null; onClose: () => void }) {
  const router = useRouter();
  const [opts, setOpts] = useState<Awaited<ReturnType<typeof freightOptionsAction>> | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [sel, setSel] = useState<string>(""), [cost, setCost] = useState("");
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  if (row && loadedFor !== row.orderId) {
    setLoadedFor(row.orderId); setOpts(null); setSel(""); setCost(""); setErr(null);
    freightOptionsAction(row.orderId).then(setOpts, () => setOpts([]));
  }
  const chosen = opts?.find((o) => o.id === sel);
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) { onClose(); setLoadedFor(null); } }}>
      <DialogContent className="max-w-lg max-h-[85dvh] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
        <DialogHeader>
          <DialogTitle>Μεταφορική απευθείας στον πελάτη</DialogTitle>
          <DialogDescription>{row ? `${row.number} · ${row.to.city} ${row.to.zip}. ${row.reason ?? ""}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 grid gap-1.5 content-start" data-help="kentro.picker">
          {!opts ? <p className="m-0 text-eu-muted inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Υπολογίζω το κόστος ανά μεταφορέα…</p>
            : !opts.length ? <p className="m-0 text-eu-ink-3">Δεν υπάρχουν μεταφορείς με ρόλο πρακτορείο, οδηγός ή courier. Όρισέ τους στα <Link href="/admin/apostoles/praktoreia" className="text-eu-blue font-bold">Πρακτορεία</Link>.</p>
            : opts.map((o, i) => (
              <label key={o.id} className={`flex items-center gap-3 rounded-xl border p-2.5 min-h-11 cursor-pointer ${sel === o.id ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                <input type="radio" name="carrier" className="size-5" checked={sel === o.id} onChange={() => { setSel(o.id); setCost(o.cost != null ? (o.cost / 100).toString() : ""); }} />
                <span className="flex-1 min-w-0"><b className="text-eu-ink text-[length:var(--fs-14)]">{o.name}</b><span className="block text-eu-muted text-[length:var(--fs-13)]">{o.role === "driver" ? "Οδηγός μας" : o.role === "courier" ? "Courier" : "Πρακτορείο"}{o.city ? ` · ${o.city}` : ""}{o.zone ? ` · ζώνη ${o.zone}` : ""}</span></span>
                <span className="text-right text-[length:var(--fs-14)]">{o.cost != null ? <b className={i === 0 ? "text-eu-green" : "text-eu-navy"}>{eur(o.cost / 100)}</b> : <span className="text-eu-muted">χωρίς τιμοκατάλογο</span>}{i === 0 && o.cost != null && <span className="block text-eu-green text-[length:var(--fs-13)] font-bold">φθηνότερο</span>}</span>
              </label>
            ))}
        </div>
        <div className="grid gap-2">
          {chosen && <label className="grid gap-0.5"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Κόστος για εμάς €</span><input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="άγνωστο" className="rounded-lg border border-eu-line px-2.5 min-h-11 text-[length:var(--fs-14)]" /></label>}
          {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
          <button type="button" disabled={!chosen || busy} onClick={() => start(async () => {
            try { await chooseCarrierAction(row!.orderId, sel, cost.trim() ? Math.round(Number(cost.replace(",", ".")) * 100) : null); onClose(); setLoadedFor(null); router.refresh(); }
            catch (e) { setErr(e instanceof Error ? e.message : "Δεν έγινε"); }
          })} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Truck className="size-4" aria-hidden />} Ανάθεση{chosen ? ` σε ${chosen.name}` : ""}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
