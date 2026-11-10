"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Check, CloudOff, GitBranch, Package, RefreshCw } from "lucide-react";
import type { OrderChain, OrderChainNode } from "@/lib/softone/order-chain";
import { TONE, amountOf, depths, dmy, metaOf, money, stateOf, titleOf, type Tone } from "./meta";

const ChainFlow = dynamic(() => import("./ChainFlow"), { ssr: false, loading: () => <div className="h-full rounded-xl bg-eu-surface animate-pulse" /> });

type Tab = "order" | "softone";

/** Καρτέλες της παραγγελίας: «Παραγγελία» (η σελίδα όπως ήταν) και «Πορεία στο SoftOne» (φορτώνει όταν ανοίξει). */
export function OrderTabs({ load, number, initial = "order", children }: { load: () => Promise<OrderChain>; number: string; initial?: Tab; children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>(initial);
  const pick = (t: Tab) => { setTab(t); const u = new URL(location.href); if (t === "softone") u.searchParams.set("tab", "softone"); else u.searchParams.delete("tab"); history.replaceState(null, "", u); };
  const tabs: { id: Tab; label: string; Icon: typeof Package }[] = [{ id: "order", label: "Παραγγελία", Icon: Package }, { id: "softone", label: "Πορεία στο SoftOne", Icon: GitBranch }];
  return (
    <div className="grid gap-4 min-w-0">
      <div role="tablist" aria-label="Καρτέλες παραγγελίας" data-help="orders.tabs" className="flex gap-1 border-b border-eu-line print:hidden">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => pick(id)}
            className={`inline-flex items-center gap-1.5 px-3 min-h-11 -mb-px border-b-2 font-bold text-[length:var(--fs-14)] transition-colors ${tab === id ? "border-eu-blue text-eu-blue" : "border-transparent text-eu-ink-3 hover:text-eu-ink"}`}>
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-order" aria-labelledby="tab-order" hidden={tab !== "order"}>{children}</div>
      {tab === "softone" && <div role="tabpanel" id="panel-softone" aria-labelledby="tab-softone"><SoftonePanel load={load} number={number} /></div>}
    </div>
  );
}

export function SoftonePanel({ load: fetchChain, number }: { load: () => Promise<OrderChain>; number: string }) {
  const [data, setData] = useState<OrderChain | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const load = useCallback(() => start(async () => { const r = await fetchChain(); setData(r); if (r.ok) setSel((s) => s ?? r.focus); }), [fetchChain]);
  const once = useRef(false);
  useEffect(() => { if (!once.current) { once.current = true; load(); } }, [load]);

  if (!data) return <Skeleton />;
  if (!data.ok) {
    const notSent = data.reason === "not-sent";
    return (
      <div data-help="orders.softone" className="rounded-2xl border border-eu-line bg-white p-6 grid justify-items-center text-center gap-2">
        <span className={`size-11 rounded-full inline-flex items-center justify-center ${notSent ? "bg-eu-surface text-eu-ink-3" : "bg-eu-red/10 text-eu-red"}`}>{notSent ? <CloudOff className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}</span>
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">{notSent ? "Δεν έχει σταλεί στο SoftOne" : "Δεν φορτώθηκε η πορεία"}</h3>
        <p className="m-0 max-w-[52ch] text-eu-ink-3 text-[length:var(--fs-14)]">{notSent ? `Δεν βρέθηκε παραστατικό με αριθμό ${number}. Η πορεία εμφανίζεται μόλις η παραγγελία καταχωρηθεί στο ERP.` : "Η σύνδεση με το ERP απέτυχε ή άργησε. Δοκίμασε ξανά σε λίγο."}</p>
        <button type="button" onClick={load} disabled={pending} className="mt-1 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-chip disabled:opacity-60"><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> Δοκίμασε ξανά</button>
      </div>
    );
  }
  const { nodes, root } = data;
  const { depth, kids } = depths(nodes, root);
  const current = nodes.find((n) => n.findoc === sel) ?? nodes[0];
  const edges = nodes.reduce((a, n) => a + n.parents.length, 0);
  // ύψος καμβά από την ψηλότερη στήλη (όχι άδειος χώρος για μία σειρά)
  const perDepth = [...depth.values()].reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map<number, number>());
  const flowRem = Math.min(32, Math.max(15, Math.max(...perDepth.values()) * 8.2 + 5));
  return (
    <div data-help="orders.softone" className="@container rounded-2xl border border-eu-line bg-white p-3 @lg:p-4 grid gap-3 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">FINDOC {root}</div>
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Πορεία στο SoftOne</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{nodes.length} παραστατικά · {edges} μετασχηματισμοί{data.truncated ? " · εμφανίζονται τα πρώτα (πολύ μεγάλη αλυσίδα)" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">Ενημ. {new Date(data.at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span>
          <button type="button" onClick={load} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-ink font-bold text-[length:var(--fs-13)] px-3 min-h-11 hover:border-eu-navy disabled:opacity-60"><RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> Ανανέωση</button>
        </div>
      </div>

      <Stages nodes={nodes} kids={kids} />

      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_17rem] min-w-0">
        <div data-help="orders.softone.flow" style={{ height: `${flowRem}rem` }} className="hidden @3xl:block rounded-xl border border-eu-line bg-eu-surface overflow-hidden">
          <ChainFlow nodes={nodes} root={root} selected={current?.findoc ?? null} onSelect={setSel} />
        </div>
        <ol data-help="orders.softone.list" className="@3xl:hidden m-0 p-0 list-none grid gap-1.5" aria-label="Παραστατικά με τη σειρά">
          {[...nodes].sort((a, b) => depth.get(a.findoc)! - depth.get(b.findoc)! || a.date.localeCompare(b.date)).map((n) => {
            const { tone, Icon } = metaOf(n); const on = n.findoc === current?.findoc;
            return (
              <li key={n.findoc} style={{ paddingLeft: `${Math.min(depth.get(n.findoc)!, 4) * 0.9}rem` }}>
                <button type="button" onClick={() => setSel(n.findoc)} aria-pressed={on} className={`w-full text-left flex items-center gap-2.5 rounded-xl border px-3 min-h-14 py-2 transition-colors ${on ? "border-eu-blue bg-eu-blue/5" : "border-eu-line hover:border-eu-navy"}`}>
                  <span className={`size-8 shrink-0 rounded-lg inline-flex items-center justify-center ${TONE[tone].icon}`}><Icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 grow grid gap-0.5"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2">{titleOf(n)}</span><span className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums break-words">{n.fincode || n.findoc} · {dmy(n.date)} · {amountOf(n)}</span><span className="flex gap-1"><span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-bold ${TONE[tone].chip}`}>{stateOf(n, !!kids.get(n.findoc)?.length)}</span>{n.shared && <span className="rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-bold bg-eu-amber/10 text-eu-amber">κοινό</span>}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
        {current && <Details n={current} nodes={nodes} hasKids={!!kids.get(current.findoc)?.length} onSelect={setSel} />}
      </div>

      <Legend nodes={nodes} />
    </div>
  );
}

/** Στάδια με μια ματιά: τι έχει γίνει από όσα συνήθως ακολουθούν μια παραγγελία. */
function Stages({ nodes, kids }: { nodes: OrderChainNode[]; kids: Map<number, number[]> }) {
  const tones = nodes.map((n) => metaOf(n).tone);
  const first = (t: Tone) => nodes.find((n) => metaOf(n).tone === t);
  const processed = nodes.filter((n) => metaOf(n).tone === "order").length > 1 || !!kids.get(nodes[0]?.findoc)?.length;
  const cancelled = first("cancel");
  const steps = [
    { label: "Παραγγελία", done: true, date: nodes[0]?.date },
    { label: "Επεξεργασία", done: processed, date: nodes.find((n, i) => i > 0)?.date },
    { label: "Παραστατικό", done: tones.includes("doc"), date: first("doc")?.date },
    { label: "Δελτίο αποστολής", done: tones.includes("ship"), date: first("ship")?.date },
  ];
  return (
    <ol data-help="orders.softone.stages" className="m-0 p-0 list-none grid grid-cols-2 @xl:grid-cols-4 gap-2">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-2 min-w-0">
          <span className={`size-8 shrink-0 rounded-full inline-flex items-center justify-center ${s.done ? "bg-eu-blue text-white" : "border border-dashed border-eu-muted text-eu-muted"}`}>{s.done ? <Check className="size-4" aria-hidden /> : <span className="size-1.5 rounded-full bg-current" />}</span>
          <span className="min-w-0 leading-tight"><span className={`block font-bold text-[length:var(--fs-13)] ${s.done ? "text-eu-ink" : "text-eu-ink-3"}`}>{s.label}</span><span className="block text-eu-muted text-[length:var(--fs-12)] tabular-nums">{s.done ? dmy(s.date ?? "") : "δεν έγινε ακόμη"}</span></span>
        </li>
      ))}
      {cancelled && <li className="col-span-full rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-13)] px-3 py-2 inline-flex items-center gap-2"><AlertTriangle className="size-4" aria-hidden /> {titleOf(cancelled)} στις {dmy(cancelled.date)}</li>}
    </ol>
  );
}

function Details({ n, nodes, hasKids, onSelect }: { n: OrderChainNode; nodes: OrderChainNode[]; hasKids: boolean; onSelect: (f: number) => void }) {
  const { tone, Icon } = metaOf(n);
  const from = nodes.filter((x) => n.parents.includes(x.findoc));
  const to = nodes.filter((x) => x.parents.includes(n.findoc));
  const rows: [string, React.ReactNode][] = [["Αριθμός", n.fincode || "—"], ["Ημερομηνία", dmy(n.date)], ...(n.shared ? [["Αυτή η παραγγελία", `${money(n.ownNet)} χωρίς ΦΠΑ`], ["Σύνολο εγγράφου", `${money(n.total)} (κοινό με άλλες παραγγελίες)`]] as [string, string][] : [["Σύνολο", money(n.total)]] as [string, string][]), ["Σειρά", `${n.series}${n.seriesName ? ` · ${n.seriesName}` : ""}`], ["Κατάσταση", stateOf(n, hasKids)], ["FINDOC", n.findoc]];
  const link = (x: OrderChainNode) => <button key={x.findoc} type="button" onClick={() => onSelect(x.findoc)} className="text-eu-blue font-bold hover:underline text-left">{titleOf(x)}</button>;
  return (
    <aside data-help="orders.softone.details" aria-live="polite" className="rounded-xl border border-eu-line p-3 grid gap-2 content-start text-[length:var(--fs-13)] min-w-0">
      <div className="flex items-center gap-2 min-w-0"><span className={`size-8 shrink-0 rounded-lg inline-flex items-center justify-center ${TONE[tone].icon}`}><Icon className="size-4" aria-hidden /></span><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight">{titleOf(n)}</span></div>
      <dl className="m-0 grid">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-1.5 border-t border-eu-line"><dt className="text-eu-muted">{k}</dt><dd className="m-0 text-right text-eu-ink-2 tabular-nums min-w-0 break-words">{v}</dd></div>)}</dl>
      {from.length > 0 && <div className="grid gap-0.5 border-t border-eu-line pt-1.5"><span className="text-eu-muted">Προήλθε από</span>{from.map(link)}{n.viaRoot && <span className="text-eu-muted text-[length:var(--fs-12)]">μόνο μέσω CCCFINDOCS (χωρίς σύνδεση γραμμών)</span>}</div>}
      {to.length > 0 && <div className="grid gap-0.5 border-t border-eu-line pt-1.5"><span className="text-eu-muted">Έγινε</span>{to.map(link)}</div>}
    </aside>
  );
}

function Legend({ nodes }: { nodes: OrderChainNode[] }) {
  const present = [...new Set(nodes.map((n) => metaOf(n).tone))];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-eu-ink-3 text-[length:var(--fs-12)]">
      {present.map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${TONE[t].bar}`} aria-hidden /> {TONE[t].label}</span>)}
      <span className="hidden @3xl:inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-eu-blue" aria-hidden /> από γραμμές</span>
      {nodes.some((n) => n.viaRoot) && <span className="hidden @3xl:inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-eu-muted" aria-hidden /> μόνο CCCFINDOCS</span>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3" aria-busy="true" aria-label="Φόρτωση από το SoftOne">
      <div className="h-5 w-48 rounded bg-eu-surface animate-pulse" />
      <div className="grid grid-cols-2 @xl:grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-full bg-eu-surface animate-pulse" />)}</div>
      <div className="h-64 rounded-xl bg-eu-surface animate-pulse" />
    </div>
  );
}
