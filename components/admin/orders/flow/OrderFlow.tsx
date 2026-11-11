"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, ArrowRightLeft, Check, ExternalLink, GitBranch, Loader2, Mail, Package, Phone, RefreshCw, Route, Undo2 } from "lucide-react";
import type { FlowBase } from "@/lib/orders/flow";
import type { OrderChain } from "@/lib/softone/order-chain";
import type { TransformPreview } from "@/lib/softone/transform";
import { markStepAction, rerouteAction } from "@/app/admin/(shell)/apostoles/delivery-actions";
import { erpCheckAction, resendConfirmationAction, stageMailAction, transformPreviewAction } from "@/app/admin/(shell)/orders/actions";
import { dmy, money } from "../chain/meta";
import { STATE_LABEL, buildFlow, nextOf, type FNode } from "./model";
import { PRIMARY_LABEL, StateIcon } from "./ui";

const FlowCanvas = dynamic(() => import("./FlowCanvas"), { ssr: false, loading: () => <div className="h-full rounded-xl bg-eu-surface animate-pulse" /> });

const btn = "inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 text-[length:var(--fs-14)] font-bold disabled:opacity-60";
const pri = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const sec = `${btn} border border-eu-line bg-white text-eu-ink hover:border-eu-navy`;
const CHIP: Record<FNode["state"], string> = { done: "bg-eu-green/10 text-eu-green", now: "bg-eu-blue/10 text-eu-blue", next: "bg-eu-surface text-eu-ink-3", problem: "bg-eu-red/10 text-eu-red" };
type Msg = { ok: boolean; text: string } | null;

/** «Ροή»: όλη η διαδρομή της παραγγελίας σε ένα διάγραμμα, με τις ενέργειες κάθε σταδίου (μετασχηματισμός, email, βήματα αποστολής). */
export function OrderFlow({ base, loadChain, canWrite, goTab }: { base: FlowBase; loadChain: () => Promise<OrderChain>; canWrite: boolean; goTab: (t: "order" | "softone") => void }) {
  const [chain, setChain] = useState<OrderChain | null>(null);
  const [loading, start] = useTransition();
  const load = useCallback(() => start(async () => setChain(await loadChain())), [loadChain]);
  const once = useRef(false);
  useEffect(() => { if (!once.current) { once.current = true; load(); } }, [load]);

  const { nodes, edges } = useMemo(() => buildFlow(base, chain), [base, chain]);
  const next = nextOf(nodes);
  const [sel, setSel] = useState<string | null>(null);
  const current = nodes.find((n) => n.id === sel) ?? next ?? nodes[0];
  const [auto, setAuto] = useState<string | null>(null);
  const onPrimary = useCallback((id: string) => { setSel(id); setAuto(id); }, []);
  const main = nodes.filter((n) => n.kind !== "mail");
  // στο κινητό το πάνελ είναι κάτω από τη λίστα: μετά την επιλογή φέρ' το στην οθόνη
  const pick = (id: string) => { setSel(id); requestAnimationFrame(() => document.getElementById("flow-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" })); };
  const mailsOf = (id: string) => nodes.filter((n) => n.kind === "mail" && n.parent === id);

  return (
    <div data-help="orders.flow" className="@container rounded-2xl border border-eu-line bg-white p-3 @lg:p-4 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-eu-muted text-[length:var(--fs-12)]">{base.order.number} · {money(base.order.total)}{base.route ? ` · ${base.route.modeLabel}` : ""}</div>
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ροή της παραγγελίας</h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-eu-ink-3 text-[length:var(--fs-12)]" data-help="orders.flow.legend">
          {(["done", "now", "next", "problem"] as const).map((s) => <span key={s} className="inline-flex items-center gap-1"><StateIcon state={s} /> {STATE_LABEL[s]}</span>)}
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink font-bold px-3 min-h-11 hover:border-eu-navy disabled:opacity-60"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Ανανέωση</button>
        </div>
      </div>

      {next && (
        <button type="button" data-help="orders.flow.next" onClick={() => setSel(next.id)} className={`text-left flex items-start gap-2 rounded-xl px-3 py-2.5 text-[length:var(--fs-14)] ${next.state === "problem" ? "bg-eu-red/10 text-eu-ink" : "bg-eu-blue/10 text-eu-ink"}`}>
          {next.state === "problem" ? <AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /> : <ArrowRight className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />}
          <span><b>{next.state === "problem" ? "Θέλει κίνηση" : "Επόμενο βήμα"}:</b> {next.title} · {next.sub}{next.primary ? ` → ${PRIMARY_LABEL[next.primary]}` : ""}</span>
        </button>
      )}
      {loading && !chain && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" aria-hidden /> Διαβάζω την πορεία στο SoftOne…</p>}

      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_20rem] min-w-0">
        <div data-help="orders.flow.canvas" className="hidden @3xl:block h-[30rem] rounded-xl border border-eu-line bg-eu-surface overflow-hidden">
          <FlowCanvas nodes={nodes} edges={edges} selected={current?.id ?? null} onSelect={setSel} onPrimary={onPrimary} canWrite={canWrite} />
        </div>
        <ol data-help="orders.flow.list" className="@3xl:hidden m-0 p-0 list-none grid gap-1.5" aria-label="Στάδια της παραγγελίας με τη σειρά">
          {main.map((n) => (
            <li key={n.id} className="grid gap-1">
              <Row n={n} on={n.id === current?.id} onClick={() => pick(n.id)} />
              {mailsOf(n.id).map((m) => <div key={m.id} className="pl-6"><Row n={m} on={m.id === current?.id} onClick={() => pick(m.id)} /></div>)}
            </li>
          ))}
        </ol>
        {current && <Panel key={current.id} n={current} base={base} canWrite={canWrite} goTab={goTab} autoRun={auto === current.id} onRan={() => setAuto(null)} reload={load} />}
      </div>
    </div>
  );
}

function Row({ n, on, onClick }: { n: FNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`w-full text-left flex items-center gap-2.5 rounded-xl border px-3 min-h-12 py-2 transition-colors ${on ? "border-eu-blue bg-eu-blue/5" : n.state === "problem" ? "border-eu-red/40" : n.state === "next" ? "border-dashed border-eu-line" : "border-eu-line"}`}>
      <StateIcon state={n.state} mail={n.kind === "mail"} />
      <span className="min-w-0 grow grid">
        {n.code && <span className="font-mono text-eu-muted text-[length:var(--fs-11)] break-words">{n.code}</span>}
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{n.title}</span>
        <span className="text-eu-ink-3 text-[length:var(--fs-12)]">{n.sub}</span>
      </span>
    </button>
  );
}

function Panel({ n, base, canWrite, goTab, autoRun, onRan, reload }: { n: FNode; base: FlowBase; canWrite: boolean; goTab: (t: "order" | "softone") => void; autoRun: boolean; onRan: () => void; reload: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [preview, setPreview] = useState<TransformPreview | null>(null);
  const [ref, setRef] = useState("");
  const o = base.order;
  const run = (f: () => Promise<{ ok: boolean; message?: string; error?: string }>, refresh = true) => start(async () => {
    try { const r = await f(); setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error ?? r.message) ?? (r.ok ? "Έγινε" : "Δεν έγινε") }); if (refresh) router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Δεν έγινε" }); }
  });
  const showTransform = () => n.doc && start(async () => setPreview(await transformPreviewAction(o.id, n.doc!.findoc)));
  const stageMail = (findoc: number) => { if (window.confirm("Αποστολή email στον πελάτη για αυτό το στάδιο;")) run(() => stageMailAction(o.id, o.number, findoc)); };
  const resend = () => { if (window.confirm("Ξανά email επιβεβαίωσης στον πελάτη;")) run(() => resendConfirmationAction(o.id, o.number)); };
  const stepDone = (undo = false) => n.step && run(async () => { await markStepAction(o.id, n.step!.key, undo ? { undo } : { ref: ref.trim() || undefined }); return { ok: true, message: undo ? "Αναιρέθηκε" : "Σημειώθηκε ότι έγινε" }; });
  const reroute = () => { if (window.confirm("Νέα επιλογή διαδρομής; Τα βήματα που δεν έγιναν ξαναφτιάχνονται.")) run(async () => { const r = await rerouteAction(o.id); return { ok: true, message: `Νέα διαδρομή: ${r.reason}` }; }); };
  const erpCheck = () => run(async () => erpCheckAction(o.id), false);

  // κουμπί πάνω στον κόμβο: ό,τι μόνο διαβάζει τρέχει αμέσως· ό,τι γράφει ή στέλνει περιμένει το κουμπί του πάνελ
  const ranOnce = useRef(false);
  useEffect(() => {
    if (!autoRun || ranOnce.current) return;
    ranOnce.current = true; onRan();
    if (n.primary === "transform") showTransform();
    else if (n.primary === "erpCheck") erpCheck();
  });

  const r = base.route;
  const who = n.step?.key === "agency" ? r?.agency : n.step?.key === "partner" ? r?.partner : n.step?.key === "carrier" ? r?.carrier : null;
  const card = who ? (n.step?.key === "partner" ? `/admin/synergates/${who.id}` : `/admin/apostoles/praktoreia/${who.id}`) : null;
  const facts: [string, React.ReactNode][] =
    n.kind === "eshop" ? [["Σύνολο", money(o.total)], ["Ημερομηνία", dmy(o.createdAt)], ["Πληρωμή", `${o.paymentMethod ?? "—"}${o.paymentStatus ? ` · ${o.paymentStatus}` : ""}`]]
    : n.kind === "erp" ? [["Κατάσταση", n.sub], ...(base.erp?.error ? [["Σφάλμα", base.erp.error]] as [string, string][] : [])]
    : n.kind === "doc" && n.doc ? [["Αριθμός", n.doc.fincode || "—"], ["Ημερομηνία", dmy(n.doc.date)], ["Σύνολο", money(n.doc.total)], ["Σειρά", `${n.doc.series}${n.doc.seriesName ? ` · ${n.doc.seriesName}` : ""}`], ["FINDOC", n.doc.findoc]]
    : n.kind === "step" && n.step ? [["Βήμα", n.step.label], ...(who ? [["Ποιος", `${who.name}${who.city ? ` · ${who.city}` : ""}`]] as [string, string][] : []), ...(n.step.ref ? [["Αριθμός παραλαβής", n.step.ref]] as [string, string][] : []), ...(n.step.note ? [["Σημείωση", n.step.note]] as [string, string][] : []), ...(r?.reason ? [["Γιατί αυτή η διαδρομή", r.reason]] as [string, string][] : [])]
    : n.mail ? [["Κατάσταση", n.mail.status === "sent" ? "Στάλθηκε" : n.mail.status === "skipped" ? "Δεν στάλθηκε" : n.mail.status === "failed" ? "Απέτυχε" : "Σε αναμονή"], ["Πότε", new Date(n.mail.at).toLocaleString("el-GR")], ...(n.mail.error ? [["Σφάλμα", n.mail.error]] as [string, string][] : [])]
    : [];

  return (
    <aside id="flow-panel" data-help="orders.flow.panel" aria-live="polite" className="rounded-xl border border-eu-line p-3 grid gap-3 content-start min-w-0">
      <div className="grid gap-1 min-w-0">
        {n.code && <span className="font-mono text-eu-muted text-[length:var(--fs-12)] break-words">{n.code}</span>}
        <span className="font-bold text-eu-ink text-[length:var(--fs-16)] leading-tight">{n.title}</span>
        <span className={`justify-self-start inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${CHIP[n.state]}`}><StateIcon state={n.state} mail={n.kind === "mail"} /> {STATE_LABEL[n.state]} · {n.sub}</span>
      </div>
      {facts.length > 0 && <dl className="m-0 grid text-[length:var(--fs-13)]">{facts.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-1.5 border-t border-eu-line"><dt className="text-eu-muted">{k}</dt><dd className="m-0 text-right text-eu-ink-2 tabular-nums min-w-0 break-words">{v}</dd></div>)}</dl>}

      {preview && <TransformBox p={preview} />}
      {n.kind === "step" && !n.step?.doneAt && canWrite && (n.step?.key === "agency" || n.step?.key === "carrier") && (
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Αριθμός παραλαβής (προαιρετικά)</span><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className="rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0" /></label>
      )}

      <div data-help="orders.flow.actions" className="flex flex-wrap gap-2">
        {n.kind === "eshop" && <>{canWrite && <button type="button" disabled={busy} onClick={resend} className={sec}><Mail className="size-4" aria-hidden /> Ξανά επιβεβαίωση</button>}<button type="button" onClick={() => goTab("order")} className={sec}><Package className="size-4" aria-hidden /> Καρτέλα παραγγελίας</button></>}
        {n.kind === "erp" && <>{canWrite && <button type="button" disabled={busy} onClick={erpCheck} className={pri}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Έλεγχος στο SoftOne</button>}<button type="button" onClick={() => goTab("softone")} className={sec}><GitBranch className="size-4" aria-hidden /> Πορεία στο SoftOne</button></>}
        {n.kind === "doc" && <>
          {canWrite && n.primary === "transform" && <button type="button" disabled={busy} onClick={showTransform} className={pri}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRightLeft className="size-4" aria-hidden />} Προεπισκόπηση μετασχηματισμού</button>}
          {canWrite && <button type="button" disabled={busy} onClick={() => stageMail(n.doc!.findoc)} className={sec}><Mail className="size-4" aria-hidden /> Email πελάτη</button>}
          <button type="button" onClick={() => goTab("softone")} className={sec}><GitBranch className="size-4" aria-hidden /> Πορεία στο SoftOne</button>
        </>}
        {n.kind === "step" && <>
          {canWrite && (n.step?.doneAt
            ? <button type="button" disabled={busy} onClick={() => stepDone(true)} className={sec}><Undo2 className="size-4" aria-hidden /> Αναίρεση</button>
            : <button type="button" disabled={busy} onClick={() => stepDone()} className={pri}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Έγινε</button>)}
          {who?.phone && <a href={`tel:${who.phone}`} className={sec}><Phone className="size-4" aria-hidden /> {who.phone}</a>}
          {card && <Link href={card} className={sec}><ExternalLink className="size-4" aria-hidden /> Καρτέλα</Link>}
          {canWrite && <button type="button" disabled={busy} onClick={reroute} className={sec}><Route className="size-4" aria-hidden /> Άλλη διαδρομή</button>}
        </>}
        {n.kind === "mail" && canWrite && n.primary === "remail" && (n.mail?.findoc
          ? <button type="button" disabled={busy} onClick={() => stageMail(n.mail!.findoc!)} className={pri}><Mail className="size-4" aria-hidden /> Νέα αποστολή</button>
          : <button type="button" disabled={busy} onClick={resend} className={pri}><Mail className="size-4" aria-hidden /> Νέα αποστολή</button>)}
        {n.kind === "mail" && n.state === "problem" && <Link href="/admin/orders/enimerosi" className={sec}>Ρυθμίσεις ενημέρωσης</Link>}
      </div>
      {msg && <p role="status" className={`m-0 rounded-lg px-3 py-2 text-[length:var(--fs-13)] ${msg.ok ? "bg-eu-green/10 text-eu-ink" : "bg-eu-red/10 text-eu-ink"}`}>{msg.text}</p>}
      {busy && n.kind === "doc" && !preview && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Διαβάζω τις γραμμές και ρωτάω το SoftOne. Τίποτα δεν αποθηκεύεται.</p>}
      {n.kind === "step" && <button type="button" onClick={reload} className="justify-self-start text-eu-blue font-bold text-[length:var(--fs-13)] min-h-11">Ανανέωση της ροής</button>}
    </aside>
  );
}

function TransformBox({ p }: { p: TransformPreview }) {
  if (!p.ok) return <p role="alert" className="m-0 rounded-lg bg-eu-red/10 px-3 py-2 text-[length:var(--fs-13)] text-eu-ink inline-flex gap-2"><AlertTriangle className="size-4 shrink-0 text-eu-red mt-0.5" aria-hidden /> {p.error}</p>;
  return (
    <div data-help="orders.flow.transform" className="grid gap-2 rounded-xl border border-eu-line bg-eu-surface p-3 text-[length:var(--fs-13)]">
      <div className="font-bold text-eu-ink">Θα γινόταν: {p.targets.map((t) => `${t.name} (σειρά ${t.series})`).join(" ή ")}</div>
      <ul className="m-0 p-0 list-none grid gap-1">
        {p.lines.map((l) => (
          <li key={l.mtrlines} className="flex justify-between gap-3 border-t border-eu-line pt-1">
            <span className="min-w-0 break-words"><span className="font-mono text-eu-muted text-[length:var(--fs-11)]">{l.code}</span> {l.name}</span>
            <span className={`shrink-0 tabular-nums ${l.left ? "text-eu-ink" : "text-eu-muted"}`}>{l.left ? `${l.left} από ${l.qty}` : "έγινε"}</span>
          </li>
        ))}
      </ul>
      {p.check && <p className={`m-0 rounded-lg px-2.5 py-1.5 ${p.check.ok ? "bg-eu-green/10" : "bg-eu-red/10"}`}>{p.check.message}</p>}
      <p className="m-0 rounded-lg bg-eu-amber/10 px-2.5 py-1.5 text-eu-ink inline-flex gap-2"><AlertTriangle className="size-4 shrink-0 text-eu-amber mt-0.5" aria-hidden /> {p.why}</p>
    </div>
  );
}
