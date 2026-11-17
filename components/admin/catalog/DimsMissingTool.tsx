"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, FileSearch, Globe, Leaf, Loader2, PencilLine, RefreshCw, Save, SearchX, Square, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { searchDimsAction, saveDimsAction, syncPlanAction, syncRunAction, missingRowsAction } from "@/app/admin/(shell)/catalog/dimensions/missing/actions";
import type { MissingOverview, MissingRow, SearchMode, SaveOutcome, SavePick } from "@/lib/catalog/dims-missing";
import type { RowProposal } from "@/lib/catalog/dims-missing-core";

const n = (v: number) => v.toLocaleString("el-GR", { maximumFractionDigits: 2 });
const PAGE = 50;
const CHUNK: Record<SearchMode, number> = { content: 20, eprel: 6, web: 2 };
type Filter = "all" | "ready" | "review" | "none" | "pending";
const STATUS = {
  ready: { label: "Έτοιμο", cls: "bg-eu-green/12 text-eu-green", Icon: Check },
  review: { label: "Απαιτεί ενέργεια", cls: "bg-eu-yellow/30 text-eu-ink", Icon: AlertTriangle },
  none: { label: "Δεν βρέθηκε", cls: "bg-eu-red/10 text-eu-red", Icon: SearchX },
  pending: { label: "Δεν ψάχτηκε", cls: "bg-eu-surface text-eu-ink-3", Icon: CircleDashed },
} as const;
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * «Διαστάσεις και βάρος που λείπουν»: τα ενεργά προϊόντα χωρίς διαστάσεις ή βάρος, μαζική αναζήτηση σε τρία βήματα
 * (χαρακτηριστικά που έχουμε → EPREL → internet) και αποθήκευση των προτάσεων που εγκρίνει ο διαχειριστής.
 */
export function DimsMissingTool({ overview, canWrite, s1On, eprelKey }: { overview: MissingOverview; canWrite: boolean; s1On: boolean; eprelKey: boolean }) {
  const [rows, setRows] = useState(overview.rows);
  const [props, setProps] = useState<Map<string, RowProposal>>(new Map());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<{ label: string; done: number; total: number; found: number; cost: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState<{ s1: number; eshop: number; failed: string[] } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [webLimit, setWebLimit] = useState(50);
  const stop = useRef(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [manual, setManual] = useState<MissingRow | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const statusOf = (id: string) => props.get(id)?.status ?? "pending";
  const counts = useMemo(() => { const c = { ready: 0, review: 0, none: 0, pending: 0 }; for (const r of rows) c[props.get(r.id)?.status ?? "pending"]++; return c; }, [rows, props]);
  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("el");
    return rows.filter((r) => (filter === "all" || (props.get(r.id)?.status ?? "pending") === filter) && (!t || `${r.title} ${r.sku} ${r.brand} ${r.category}`.toLocaleLowerCase("el").includes(t)));
  }, [rows, props, filter, q]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), cur = Math.min(page, pages);
  const total = overview.active, missing = rows.length, complete = total - missing - overview.sets;
  const pct = (v: number) => `${Math.max(v ? 1.5 : 0, (v / total) * 100)}%`;

  async function run(mode: SearchMode, ids: string[], label: string) {
    if (!ids.length) return setMsg({ ok: true, text: "Δεν έμεινε προϊόν για αυτό το βήμα." });
    stop.current = false; setMsg(null); setSaved(null);
    let found = 0, cost = 0, failed = 0, done = 0;
    setBusy({ label, done, total: ids.length, found, cost });
    try {
      for (let i = 0; i < ids.length && !stop.current; i += CHUNK[mode]) {
        const part = ids.slice(i, i + CHUNK[mode]);
        const r = await searchDimsAction(part, mode);
        found += r.proposals.filter((p) => p.status !== "none").length; cost += r.costUsd; failed += r.failed.length; done += part.length;
        setProps((m) => { const x = new Map(m); for (const p of r.proposals) x.set(p.id, p); return x; });
        setSel((s) => { const x = new Set(s); for (const p of r.proposals) if (p.status === "ready") x.add(p.id); else x.delete(p.id); return x; });
        setBusy({ label, done, total: ids.length, found, cost });
      }
      setMsg({ ok: true, text: `${label}: ελέγχθηκαν ${n(done)}, βρέθηκε τιμή σε ${n(found)}${failed ? `, ${n(failed)} δεν διαβάστηκαν` : ""}${cost ? ` · κόστος ${cost.toFixed(2)} $` : ""}.` });
    } catch { setMsg({ ok: false, text: "Η αναζήτηση σταμάτησε από σφάλμα. Ό,τι βρέθηκε ως εδώ έμεινε στη λίστα· ξαναπάτα για να συνεχίσει." }); }
    setBusy(null);
  }
  const open = rows.filter((r) => statusOf(r.id) !== "ready");

  /** `only`: άμεση αποθήκευση ενός προϊόντος (κουμπί στη γραμμή «Απαιτεί ενέργεια»)· αλλιώς όλα τα τσεκαρισμένα. */
  async function save(only?: string, manualPick?: SavePick) {
    const picks: SavePick[] = manualPick ? [manualPick] : rows.filter((r) => (only ? r.id === only : sel.has(r.id)) && props.get(r.id)).map((r) => { const p = props.get(r.id)!; return { productId: r.id, dims: p.dims && { w: p.dims.w, h: p.dims.h, d: p.dims.d, label: p.dims.label, raw: p.dims.raw }, weight: p.weight && { kg: p.weight.kg, label: p.weight.label, raw: p.weight.raw } }; });
    if (!picks.length) return;
    stop.current = false; setMsg(null); setSavingId(only ?? null);
    const all: SaveOutcome[] = [];
    setBusy({ label: "Αποθήκευση", done: 0, total: picks.length, found: 0, cost: 0 });
    try {
      for (let i = 0; i < picks.length && !stop.current; i += 10) {
        all.push(...(await saveDimsAction(picks.slice(i, i + 10))));
        setBusy({ label: "Αποθήκευση", done: all.length, total: picks.length, found: all.filter((o) => o.ok).length, cost: 0 });
      }
    } catch { setMsg({ ok: false, text: "Η αποθήκευση σταμάτησε από σφάλμα. Όσα πρόλαβαν αποθηκεύτηκαν." }); }
    const ok = new Set(all.filter((o) => o.ok).map((o) => o.id));
    const title = (id: string) => rows.find((r) => r.id === id)?.title ?? id;
    if (manualPick) setManual(null);
    setSaved({ s1: all.filter((o) => o.ok && o.s1 === "written").length, eshop: all.filter((o) => o.ok && o.s1 !== "written").length, failed: all.filter((o) => !o.ok || o.s1 === "error").map((o) => `${title(o.id)}: ${o.message ?? "σφάλμα"}`) });
    setRows((l) => l.filter((r) => !ok.has(r.id)));
    setSel((s) => new Set([...s].filter((id) => !ok.has(id))));
    setBusy(null); setSavingId(null);
  }

  /** Συγχρονισμός με το SoftOne: πρώτα ποια διαφέρουν (μία ανάγνωση), μετά ανά παρτίδα, και στο τέλος η λίστα ξανά από τη βάση. */
  async function sync() {
    stop.current = false; setMsg(null); setSaved(null);
    const label = "Συγχρονισμός με SoftOne";
    setBusy({ label, done: 0, total: 1, found: 0, cost: 0 });
    try {
      const ids = await syncPlanAction();
      let done = 0, ok = 0, written = 0; const failed: string[] = [];
      for (let i = 0; i < ids.length && !stop.current; i += 6) {
        setBusy({ label, done, total: ids.length, found: ok, cost: 0 });
        const r = await syncRunAction(ids.slice(i, i + 6));
        done += Math.min(6, ids.length - i); ok += r.done; written += r.written; failed.push(...r.failed.map((f) => f.error));
      }
      setRows(await missingRowsAction());
      setMsg({ ok: !failed.length, text: !ids.length ? "Το eshop και το SoftOne συμφωνούν ήδη· δεν χρειάστηκε καμία αλλαγή." : `Συγχρονισμός: ενημερώθηκαν ${n(ok)} από ${n(ids.length)} προϊόντα· σε ${n(written)} συμπληρώθηκαν κενά πεδία στο SoftOne${failed.length ? ` · ${n(failed.length)} απέτυχαν (${failed[0]})` : ""}${done < ids.length ? " · σταμάτησε πριν τελειώσει, πάτα ξανά για τα υπόλοιπα" : ""}.` });
    } catch { setMsg({ ok: false, text: "Ο συγχρονισμός σταμάτησε από σφάλμα. Πάτα ξανά για να συνεχίσει από εκεί που έμεινε." }); }
    setBusy(null);
  }
  /** Συγχρονισμός ενός προϊόντος με το SoftOne (ίδιος κανόνας με τον μαζικό). */
  async function syncOne(r: MissingRow) {
    setMsg(null); setSaved(null); setSyncingId(r.id);
    try {
      const o = await syncRunAction([r.id]);
      const next = await missingRowsAction();
      setRows(next);
      const gone = !next.some((x) => x.id === r.id);
      setMsg(o.failed.length ? { ok: false, text: `${r.title}: ${o.failed[0].error}` } : { ok: true, text: `${r.title}: ${o.written ? "συμπληρώθηκαν κενά πεδία στο SoftOne και " : ""}διαβάστηκε ξανά από το SoftOne. ${gone ? "Έχει πλέον διαστάσεις και βάρος και έφυγε από τη λίστα." : "Του λείπουν ακόμη στοιχεία· το SoftOne δεν έχει τιμή σε αυτά τα πεδία."}` });
    } catch { setMsg({ ok: false, text: "Ο συγχρονισμός του προϊόντος απέτυχε. Δοκίμασε ξανά." }); }
    setSyncingId(null);
  }
  const saving = busy?.label === "Αποθήκευση";
  const progress = busy && (
          <div className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2 w-full">
            <div className="flex flex-wrap items-center gap-3 text-eu-ink text-[length:var(--fs-14)]">
              <Loader2 className="size-4 animate-spin text-eu-blue" aria-hidden />
              <b>{busy.label}</b><span className="tabular-nums">{n(busy.done)} από {n(busy.total)} · {busy.label === "Αποθήκευση" ? "αποθηκεύτηκαν" : busy.label.startsWith("Συγχρ") ? "ενημερώθηκαν" : "βρέθηκαν"} {n(busy.found)}{busy.cost ? ` · ${busy.cost.toFixed(2)} $` : ""}</span>
              <button type="button" onClick={() => { stop.current = true; }} className={`${btn} border border-eu-line bg-white text-eu-ink hover:border-eu-navy ml-auto`}><Square className="size-3.5" aria-hidden /> Σταμάτα</button>
            </div>
            <div className="h-2 rounded-full bg-eu-surface overflow-hidden"><div className="h-full bg-eu-blue transition-[width] duration-300" style={{ width: `${(busy.done / busy.total) * 100}%` }} /></div>
          </div>
  );
  const steps = [
    { mode: "content" as const, Icon: FileSearch, title: "1 · Από όσα έχουμε ήδη", text: "Χαρακτηριστικά, περιγραφές, δελτία EPREL και PDF του προϊόντος. Δωρεάν, δεν αλλάζει τίποτα.", action: "Αναζήτηση σε όλα", ids: rows.filter((r) => !props.has(r.id)).map((r) => r.id), need: false, off: null as string | null },
    { mode: "eprel" as const, Icon: Leaf, title: "2 · EPREL", text: "Τι δηλώνει ο κατασκευαστής για συσκευές με ενεργειακή ετικέτα. Δωρεάν.", action: "Αναζήτηση στο EPREL", ids: open.filter((r) => !r.eprelChecked).map((r) => r.id), need: true, off: eprelKey ? null : "Λείπει το κλειδί του EPREL." },
    { mode: "web" as const, Icon: Globe, title: "3 · Site κατασκευαστή", text: "Icecat και η σελίδα του κατασκευαστή. Κοστίζει περίπου 0,01 $ το προϊόν.", action: "Αναζήτηση στο internet", ids: [...open].sort((a, b) => Number(a.webChecked) - Number(b.webChecked)).slice(0, Math.max(0, webLimit)).map((r) => r.id), need: true, off: null },
  ];

  return (
    <div className="grid gap-5 min-w-0">
      <div data-help="dims-missing.sync" className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!!busy || !canWrite} onClick={sync} className={`${btn} border border-eu-line bg-white text-eu-navy hover:border-eu-navy`}><RefreshCw className="size-4" aria-hidden /> Συγχρονισμός με SoftOne</button>
        <p className="m-0 flex-1 min-w-[240px] max-w-[80ch] text-eu-ink-3 text-[length:var(--fs-13)]">Όπου κι αν έχει γραφτεί μια τιμή, τη βάζει και στα τρία σημεία: στα πεδία Βάρος, Μήκος, Πλάτος, Ύψος του είδους, στα Μάζα και Διάσταση 1-3, και στο eshop. Για όλα τα ενεργά προϊόντα· συμπληρώνει μόνο κενά πεδία{s1On ? "" : " · η εγγραφή στο SoftOne είναι κλειστή, οπότε τώρα μόνο διαβάζει"}.</p>
      </div>
      <section data-help="dims-missing.summary" className="grid gap-3 min-w-0">
        <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
          {[
            { t: "Φαίνονται στο eshop", v: n(total), s: "ενεργά προϊόντα", c: "text-eu-ink" },
            { t: "Έχουν διαστάσεις και βάρος", v: n(complete), s: `${Math.round((complete / total) * 100)}% του καταλόγου · στόχος 100%`, c: "text-eu-green" },
            { t: "Τους λείπει κάτι", v: n(missing), s: `${n(rows.filter((r) => r.missDims).length)} χωρίς διαστάσεις · ${n(rows.filter((r) => r.missWeight).length)} χωρίς βάρος`, c: missing ? "text-eu-red" : "text-eu-green" },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0">
              <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.t}</div>
              <div className={`font-heading font-extrabold text-[length:var(--fs-28)] tabular-nums ${c.c}`}>{c.v}</div>
              <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{c.s}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2 min-w-0">
          <div role="img" aria-label={`${n(complete)} πλήρη, ${n(counts.ready)} με έτοιμη πρόταση, ${n(missing - counts.ready)} ακόμη ανοιχτά`} className="flex gap-0.5 h-4">
            <div className="bg-eu-green rounded-l-full" style={{ width: pct(complete) }} title={`${n(complete)} πλήρη`} />
            <div className="bg-eu-blue" style={{ width: pct(counts.ready) }} title={`${n(counts.ready)} με έτοιμη πρόταση`} />
            <div className="bg-eu-red/70 rounded-r-full flex-1" title={`${n(missing - counts.ready)} ανοιχτά`} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-eu-ink text-[length:var(--fs-13)]">
            {[["bg-eu-green", `${n(complete)} πλήρη`], ["bg-eu-blue", `${n(counts.ready)} με έτοιμη πρόταση: πάτα «Αποθήκευση»`], ["bg-eu-red/70", `${n(missing - counts.ready)} ανοιχτά: θέλουν αναζήτηση ή έλεγχο`]].map(([c, t]) => (
              <span key={t} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${c}`} aria-hidden />{t}</span>
            ))}
          </div>
          {overview.sets > 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{n(overview.sets)} σετ δεν είναι εδώ: παίρνουν διαστάσεις και βάρος από τα είδη που περιέχουν.</p>}
        </div>
      </section>

      <section data-help="dims-missing.steps" className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
        {steps.map((s) => (
          <div key={s.mode} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2 content-start min-w-0">
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] inline-flex items-center gap-2"><s.Icon className="size-4.5 text-eu-blue shrink-0" aria-hidden />{s.title}</h3>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{s.text}</p>
            {s.mode === "web" && (
              <label className="flex flex-wrap items-center gap-2 text-eu-ink text-[length:var(--fs-14)]">Έως
                <input type="number" min={1} max={1000} value={webLimit} onChange={(e) => setWebLimit(Math.min(1000, Math.max(0, Number(e.target.value) || 0)))} className="w-24 rounded-full border border-eu-line px-3 min-h-11 tabular-nums" />
                προϊόντα · περίπου {(s.ids.length * 0.01).toFixed(2)} $
              </label>
            )}
            <p className="m-0 text-eu-ink text-[length:var(--fs-13)] font-bold">{n(s.ids.length)} προϊόντα για έλεγχο</p>
            {s.off && <p className="m-0 text-eu-red font-bold text-[length:var(--fs-13)]">{s.off}</p>}
            <button type="button" disabled={!!busy || !!s.off || !s.ids.length || (s.need && !canWrite)} onClick={() => run(s.mode, s.ids, s.title.slice(4))} className={`${btn} w-fit ${s.mode === "content" ? "bg-eu-navy text-white hover:bg-eu-blue" : "border border-eu-line bg-white text-eu-navy hover:border-eu-navy"}`}>{s.action}</button>
            {s.need && !canWrite && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Θέλει δικαίωμα αλλαγής προϊόντων.</p>}
          </div>
        ))}
      </section>

      <div role="status" aria-live="polite" className="grid gap-2 empty:hidden">
        {busy && !saving && progress}
        {msg && <p className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-surface text-eu-ink" : "bg-eu-red/10 text-eu-red font-bold"}`}>{msg.text}</p>}
        {saved && (
          <div data-help="dims-missing.result" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-2">
            <b className="text-eu-ink text-[length:var(--fs-15)]">Αποθηκεύτηκαν {n(saved.s1 + saved.eshop)} προϊόντα</b>
            {saved.s1 + saved.eshop > 0 && <div className="flex gap-0.5 h-3" aria-hidden><div className="bg-eu-green rounded-l-full" style={{ flexGrow: saved.s1 }} /><div className="bg-eu-blue rounded-r-full" style={{ flexGrow: saved.eshop }} /></div>}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-eu-ink text-[length:var(--fs-13)]">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-green" aria-hidden />{n(saved.s1)} και στο SoftOne</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-eu-blue" aria-hidden />{n(saved.eshop)} μόνο στο eshop{!s1On && saved.eshop ? " (η εγγραφή στο SoftOne είναι κλειστή)" : ""}</span>
            </div>
            {saved.failed.length > 0 && <ul className="m-0 pl-5 text-eu-red text-[length:var(--fs-13)]">{saved.failed.slice(0, 8).map((f) => <li key={f}>{f}</li>)}{saved.failed.length > 8 && <li>και άλλα {saved.failed.length - 8}</li>}</ul>}
          </div>
        )}
      </div>

      <section data-help="dims-missing.list" className="rounded-2xl border border-eu-line bg-white min-w-0">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-eu-line">
          {([["all", `Όλα ${n(rows.length)}`], ["ready", `Έτοιμα ${n(counts.ready)}`], ["review", `Απαιτούν ενέργεια ${n(counts.review)}`], ["none", `Δεν βρέθηκαν ${n(counts.none)}`], ["pending", `Δεν ψάχτηκαν ${n(counts.pending)}`]] as [Filter, string][]).map(([k, t]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(1); }} className={`rounded-full px-3 min-h-11 @3xl:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer border ${filter === k ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-ink border-eu-line hover:border-eu-navy"}`}>{t}</button>
          ))}
          <label className="sr-only" htmlFor="dm-q">Αναζήτηση</label>
          <input id="dm-q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Τίτλος, κωδικός, μάρκα, κατηγορία" className="flex-1 min-w-[200px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
        </div>
        <ul className="m-0 p-0 list-none">
          {shown.slice((cur - 1) * PAGE, cur * PAGE).map((r) => {
            const p = props.get(r.id), st = STATUS[p?.status ?? "pending"];
            return (
              <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)] @3xl:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1.4fr)_auto] gap-x-3 gap-y-1 items-start px-3 py-3 border-b border-eu-line last:border-b-0">
                <label className="inline-flex items-center justify-center size-11 -m-2 cursor-pointer"><input type="checkbox" className="size-5 accent-eu-navy" disabled={!p || p.status === "none" || !canWrite} checked={sel.has(r.id)} onChange={(e) => setSel((s) => { const x = new Set(s); if (e.target.checked) x.add(r.id); else x.delete(r.id); return x; })} aria-label={`Αποθήκευση για ${r.title}`} /></label>
                <div className="min-w-0">
                  <Link href={`/admin/catalog/${r.id}?tab=dims`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline text-[length:var(--fs-14)] break-words">{r.title}</Link>
                  <div className="text-eu-ink-3 text-[length:var(--fs-13)] break-words">{r.brand} · {r.category} · {r.sku}</div>
                  <div className="text-eu-red text-[length:var(--fs-13)]">Λείπουν: {[r.missDims && "διαστάσεις", r.missWeight && "βάρος"].filter(Boolean).join(", ") || "στοιχεία αποστολής"}</div>
                </div>
                <div className="min-w-0 col-start-2 @3xl:col-start-auto text-[length:var(--fs-14)]">
                  {p?.dims && <div className="text-eu-ink"><b className="tabular-nums">{n(p.dims.w)} × {n(p.dims.h)} × {n(p.dims.d)} εκ.</b> <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Π × Υ × Β · {p.dims.label}{p.dims.agree > 1 ? ` · ${p.dims.agree} πηγές συμφωνούν` : ""}</span></div>}
                  {p?.weight && <div className="text-eu-ink"><b className="tabular-nums">{p.weight.kg < 1 ? `${n(p.weight.kg * 1000)} γρ.` : `${n(p.weight.kg)} κιλά`}</b> <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{p.weight.label}{p.weight.agree > 1 ? ` · ${p.weight.agree} πηγές συμφωνούν` : ""}</span></div>}
                  {p?.notes.map((x) => <div key={x} className="text-eu-ink text-[length:var(--fs-13)] inline-flex gap-1.5"><AlertTriangle className="size-4 shrink-0 text-eu-yellow-dark mt-0.5" aria-hidden />{x}</div>)}
                  {p?.status === "none" && <div className="text-eu-ink-3 text-[length:var(--fs-13)]">Καμία πηγή δεν έδωσε τιμή. Δοκίμασε το επόμενο βήμα ή συμπλήρωσέ το στην καρτέλα του προϊόντος.</div>}
                  {!p && <div className="text-eu-ink-3 text-[length:var(--fs-13)]">Τρέξε το βήμα 1 για πρόταση.</div>}
                </div>
                <div className="col-start-2 @3xl:col-start-auto flex flex-wrap items-center @3xl:justify-end @3xl:max-w-[290px] gap-2">
                  <span className={`w-fit inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold text-[length:var(--fs-13)] whitespace-nowrap ${st.cls}`}><st.Icon className="size-3.5" aria-hidden />{st.label}</span>
                  {canWrite && <button type="button" disabled={!!busy} onClick={() => setManual(r)} data-help="dims-missing.manual" className={`${btn} @3xl:min-h-9 px-3 text-[length:var(--fs-13)] border border-eu-line bg-white text-eu-navy hover:border-eu-navy whitespace-nowrap`}><PencilLine className="size-4" aria-hidden /> Καταχώρηση</button>}
                  {canWrite && <button type="button" disabled={!!busy || !!syncingId} onClick={() => syncOne(r)} data-help="dims-missing.sync-one" className={`${btn} @3xl:min-h-9 px-3 text-[length:var(--fs-13)] border border-eu-line bg-white text-eu-navy hover:border-eu-navy whitespace-nowrap`}><RefreshCw className={`size-4 ${syncingId === r.id ? "animate-spin" : ""}`} aria-hidden /> {syncingId === r.id ? "Συγχρονίζεται" : "Από SoftOne"}</button>}
                  {p?.status === "review" && canWrite && <button type="button" disabled={!!busy} onClick={() => save(r.id)} className={`${btn} @3xl:min-h-9 px-3 text-[length:var(--fs-13)] bg-eu-navy text-white hover:bg-eu-blue whitespace-nowrap`}>{savingId === r.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} {savingId === r.id ? "Αποθηκεύεται" : "Σωστό, αποθήκευση"}</button>}
                </div>
              </li>
            );
          })}
          {!shown.length && <li className="p-8 text-center text-eu-ink-3 text-[length:var(--fs-14)]">{rows.length ? "Κανένα προϊόν με αυτά τα κριτήρια." : "Όλα τα προϊόντα του eshop έχουν διαστάσεις και βάρος."}</li>}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-center gap-3 p-3 border-t border-eu-line text-eu-ink text-[length:var(--fs-14)]">
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className={`${btn} border border-eu-line bg-white`}>Προηγούμενα</button>
            <span className="tabular-nums">Σελίδα {cur} από {pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className={`${btn} border border-eu-line bg-white`}>Επόμενα</button>
          </div>
        )}
      </section>

      <section data-help="dims-missing.save" aria-live="polite" className={`rounded-2xl border border-eu-line bg-white p-4 flex flex-wrap items-center gap-3 ${sel.size || saving ? "sticky bottom-3 z-10 shadow-[0_4px_20px_rgba(18,42,88,0.12)]" : ""}`}>
        {saving && progress}
        <button type="button" disabled={!!busy || !sel.size || !canWrite} onClick={() => save()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{saving && !savingId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση {n(sel.size)} {sel.size === 1 ? "επιλεγμένου" : "επιλεγμένων"}</button>
        <p className={`m-0 flex-1 min-w-[240px] text-eu-ink-3 text-[length:var(--fs-13)] ${sel.size || saving ? "hidden @2xl:block" : ""}`}>
          {s1On ? "Γράφονται στο eshop και στο είδος του SoftOne: Βάρος, Μήκος, Πλάτος, Ύψος και Μάζα, Διάσταση 1-3. Μόνο όπου το πεδίο είναι κενό· ό,τι υπάρχει ήδη δεν αλλάζει." : "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne): αποθηκεύονται μόνο στο eshop και μετρούν κανονικά για την αποστολή."}
        </p>
      </section>
      {manual && <ManualDialog key={manual.id} row={manual} seed={props.get(manual.id)} busy={!!busy} onClose={() => setManual(null)} onSave={(pick) => save(manual.id, pick)} />}
    </div>
  );
}

const LIMITS = { dim: [0.3, 400], kg: [0.002, 300] } as const;
const field = "w-full min-w-0 rounded-xl border border-eu-line px-3 min-h-11 tabular-nums text-[length:var(--fs-16)]";

/** Χειροκίνητη καταχώρηση για ένα προϊόν: μόνο ό,τι του λείπει, με αρχικές τιμές από την πρόταση αν υπάρχει. */
function ManualDialog({ row, seed, busy, onClose, onSave }: { row: MissingRow; seed?: RowProposal; busy: boolean; onClose: () => void; onSave: (pick: SavePick) => void }) {
  const [v, setV] = useState({ w: seed?.dims ? String(seed.dims.w) : "", h: seed?.dims ? String(seed.dims.h) : "", d: seed?.dims ? String(seed.dims.d) : "", kg: seed?.weight ? String(seed.weight.kg) : "" });
  const [err, setErr] = useState<string | null>(null);
  const num = (x: string) => Number(x.trim().replace(",", "."));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dimsIn = [v.w, v.h, v.d].filter((x) => x.trim()).length, [w, h, d, kg] = [num(v.w), num(v.h), num(v.d), num(v.kg)];
    const inR = (x: number, [lo, hi]: readonly [number, number]) => Number.isFinite(x) && x >= lo && x <= hi;
    if (!dimsIn && !v.kg.trim()) return setErr("Γράψε διαστάσεις ή βάρος.");
    if (dimsIn && dimsIn < 3) return setErr("Γράψε και τις τρεις διαστάσεις: πλάτος, ύψος και βάθος.");
    if (dimsIn && ![w, h, d].every((x) => inR(x, LIMITS.dim))) return setErr("Οι διαστάσεις είναι σε εκατοστά, από 0,3 έως 400.");
    if (v.kg.trim() && !inR(kg, LIMITS.kg)) return setErr("Το βάρος είναι σε κιλά, από 0,002 έως 300 (π.χ. 0,25 για 250 γρ.).");
    onSave({ productId: row.id, dims: dimsIn ? { w, h, d, label: "Χειροκίνητα", raw: `${n(w)} × ${n(h)} × ${n(d)} εκ.` } : null, weight: v.kg.trim() ? { kg, label: "Χειροκίνητα", raw: `${n(kg)} κιλά` } : null });
  };
  const input = (k: "w" | "h" | "d" | "kg", label: string, unit: string) => (
    <label className="grid gap-1 min-w-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{label} <span className="font-normal text-eu-ink-3 text-[length:var(--fs-13)]">{unit}</span>
      <input inputMode="decimal" value={v[k]} onChange={(e) => { setV({ ...v, [k]: e.target.value }); setErr(null); }} className={field} />
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-[520px] max-w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl text-eu-ink bg-white">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-eu-line">
          <div className="min-w-0">
            <DialogTitle className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] break-words">{row.title}</DialogTitle>
            <DialogDescription className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{row.brand} · {row.sku} · λείπουν: {[row.missDims && "διαστάσεις", row.missWeight && "βάρος"].filter(Boolean).join(", ")}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Κλείσιμο" className="shrink-0 inline-flex items-center justify-center size-11 rounded-full hover:bg-eu-surface cursor-pointer"><X className="size-5" aria-hidden /></button>
        </div>
        <form onSubmit={submit} className="p-4 grid gap-4 min-w-0">
          {row.missDims && <div className="grid grid-cols-3 gap-3">{input("w", "Πλάτος", "εκ.")}{input("h", "Ύψος", "εκ.")}{input("d", "Βάθος", "εκ.")}</div>}
          {row.missWeight && <div className="grid grid-cols-3 gap-3">{input("kg", "Βάρος", "κιλά")}</div>}
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Της συσκευασίας ή του προϊόντος, ό,τι έχεις. Αποθηκεύονται στο eshop και στο είδος του SoftOne, μόνο όπου το πεδίο είναι κενό.</p>
          {err && <p role="alert" className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold px-3 py-2 text-[length:var(--fs-14)]">{err}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={onClose} disabled={busy} className={`${btn} border border-eu-line bg-white text-eu-ink hover:border-eu-navy`}>Άκυρο</button>
            <button type="submit" disabled={busy} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
