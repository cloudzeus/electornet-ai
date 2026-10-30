"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, Clock, Database, Globe, Hourglass, Images, Loader2, Pencil, Play, Power, RefreshCw, RotateCcw, Search, Square, SquareCheck, Tags, X } from "lucide-react";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { priceWarning } from "@/lib/catalog/xml-import/transform-core";
import { DIFF, DIFF_ORDER, STATUS, VALUE_KIND, mb, sourceNote, when, type FeedStateDTO, type ItemDTO, type ItemsDTO, type QueueDTO, type ValueKindDTO } from "@/lib/catalog/xml-import/ui-core";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";
import { drainBatch, items as loadItems, queueItems, queueProgress, retryErrors, rerun, saveItem } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { ProductModal } from "./ProductModal";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const card = "rounded-xl border border-eu-line bg-white min-w-0";
const num = "tabular-nums";

/** Κάθε κατάσταση με εικονίδιο ΚΑΙ λέξη — ποτέ μόνο χρώμα. */
const STATUS_ICON: Record<string, React.ReactNode> = {
  review: <Pencil className="size-3.5" aria-hidden />,
  queued: <Clock className="size-3.5" aria-hidden />,
  importing: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
  done: <Check className="size-3.5" aria-hidden />,
  error: <CircleAlert className="size-3.5" aria-hidden />,
  skipped: <X className="size-3.5" aria-hidden />,
};
const STATUS_CLS: Record<string, string> = {
  review: "bg-eu-surface text-eu-ink-2",
  queued: "bg-eu-chip text-eu-navy",
  importing: "bg-eu-chip text-eu-navy",
  done: "bg-eu-green/12 text-eu-ink",
  error: "bg-eu-red/10 text-eu-red",
  skipped: "bg-eu-surface text-eu-ink-3",
};
const DIFF_CLS: Record<Diff, string> = {
  new: "bg-eu-green/12 text-eu-ink",
  changed: "bg-eu-yellow/30 text-eu-ink",
  same: "bg-eu-surface text-eu-ink-3",
  gone: "bg-eu-surface text-eu-ink-3",
};

type Chip = { key: string; label: string; n: number; help: string };
const EMPTY: ItemsDTO = { rows: [], total: 0, page: 1, pages: 1, counts: { diff: {}, status: {}, problems: 0 }, exceptionsHere: 0, problemsHere: 0, skippedHere: 0 };

function Status({ s }: { s: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${STATUS_CLS[s] ?? "bg-eu-surface text-eu-ink-3"}`}>{STATUS_ICON[s]}{STATUS[s] ?? s}</span>;
}

/**
 * Βήμα ④: η λίστα ελέγχου των προϊόντων του feed και η εισαγωγή τους.
 *
 * Δύο αποφάσεις κρατούν τη σελίδα ειλικρινή στα 2.580 προϊόντα:
 *
 * - **Η επιλογή είναι φίλτρο + εξαιρέσεις**, όχι λίστα ids. Μια λίστα ids θα κουβαλούσε 2.580 κλειδιά στον browser και
 *   θα έλεγε ψέματα για το τι θα εισαχθεί (η σελίδα δείχνει 50). Έτσι ο αριθμός «θα εισαχθούν» βγαίνει από τη βάση
 *   με το ίδιο φίλτρο που θα τρέξει η ουρά — και αφαιρεί τις γραμμές με πρόβλημα, που δεν μπαίνουν ποτέ.
 * - **Η πρόοδος ζει στη βάση.** Ο χρήστης μπορεί να κλείσει τη σελίδα· όταν ξαναμπεί, η ουρά συνεχίζει από εκεί.
 *
 * Τα σφάλματα δεν είναι toast που φεύγει: είναι chip-φίλτρο με «Δοκίμασε ξανά», ώστε να βρίσκονται και μετά από ώρες.
 */
export function ReviewList({ state, writeOn, canErp, onRemap, onPublish }: { state: FeedStateDTO; writeOn: boolean; canErp: boolean; onRemap: () => void; onPublish: () => void }) {
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [except, setExcept] = useState<string[]>([]);
  const [data, setData] = useState<ItemsDTO>(EMPTY);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toSoftone, setToSoftone] = useState(state.toSoftone);
  const [prog, setProg] = useState<QueueDTO | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const filter = useCallback(() => ({
    ...(DIFF_ORDER.includes(kind as Diff) ? { diff: kind as Diff } : {}),
    ...(kind === "problems" ? { problems: true } : {}),
    ...(kind === "error" ? { status: "error" } : {}),
    ...(kind === "skipped" ? { status: "skipped" } : {}),
    ...(query ? { q: query } : {}),
  }), [kind, query]);

  // Η φόρτωση της λίστας τρέχει σε transition: το `pending` είναι ο δείκτης αναμονής, χωρίς setState μέσα στο effect.
  const [pending, startLoad] = useTransition();
  const load = useCallback((p = page) => {
    startLoad(async () => {
      const r = await loadItems(state.feedId, { ...filter(), page: p }, except);
      if ("error" in r) { setErr(r.error); return; }
      setErr(null);
      setData(r);
      if (r.page !== p) setPage(r.page);
    });
  }, [state.feedId, filter, except, page]);

  // Η λίστα και η πρόοδος φορτώνουν μαζί: η πρόοδος μπορεί να έχει προχωρήσει από άλλη καρτέλα ή προηγούμενη επίσκεψη.
  useEffect(() => { load(page); }, [load, page]);
  useEffect(() => { void queueProgress(state.feedId).then((p) => { if (!("error" in p)) setProg(p); }); }, [state.feedId]);

  const counts = data.counts;
  const total = DIFF_ORDER.reduce((a, d) => a + (counts.diff[d] ?? 0), 0);
  const chips: Chip[] = [
    { key: "all", label: "Όλα", n: total, help: "Όλα τα προϊόντα του feed." },
    ...DIFF_ORDER.map((d) => ({ key: d, label: DIFF[d].label, n: counts.diff[d] ?? 0, help: DIFF[d].help })),
    { key: "problems", label: "Προβλήματα", n: counts.problems, help: "Χωρίς SKU ή διπλό SKU — δεν μπαίνουν στην ουρά μέχρι να διορθωθεί το feed." },
    { key: "error", label: "Σφάλματα", n: counts.status.error ?? 0, help: "Δοκίμασαν να μπουν και απέτυχαν. Διάβασε το σφάλμα και δοκίμασε ξανά." },
    ...((counts.status.skipped ?? 0) > 0 ? [{ key: "skipped", label: "Παραλείπονται", n: counts.status.skipped ?? 0, help: "Η μάρκα τους δεν εισάγεται (το επέλεξες στο βήμα «Μάρκες»). Δεν μπαίνουν ποτέ στην ουρά — για να μπουν, άλλαξε τη μάρκα και ξανατρέξε." }] : []),
  ];

  /** Τα είδη τιμών που έχουν καινούργιες, άγνωστες τιμές — με τα πολλά προϊόντα πρώτα. */
  const pendingKinds = (Object.entries(state.pending) as [ValueKindDTO, { values: number; items: number }][])
    .filter(([, v]) => v.values > 0)
    .sort((a, b) => b[1].items - a[1].items);

  const pick = (k: string) => { setKind(k); setPage(1); };
  const search = (e: React.FormEvent) => { e.preventDefault(); setQuery(q.trim()); setPage(1); };
  const toggleExcept = (sku: string) => setExcept((xs) => (xs.includes(sku) ? xs.filter((s) => s !== sku) : [...xs, sku]));

  /** Πόσα θα μπουν πραγματικά: το φίλτρο, μείον οι εξαιρέσεις, μείον όσες έχουν πρόβλημα, μείον όσες παραλείπονται. */
  const willImport = Math.max(0, data.total - data.exceptionsHere - data.problemsHere - data.skippedHere);

  const costHeader = Object.keys(state.targets).find((h) => state.targets[h] === "cost");
  const rrpHeader = Object.keys(state.targets).find((h) => state.targets[h] === "rrp");
  const nameHeader = Object.keys(state.targets).find((h) => state.targets[h] === "field:name");
  const row = (it: ItemDTO) => {
    const { merged } = mergeEdits(it.payload, it.edits);
    const cost = costHeader ? merged[costHeader] ?? "" : "";
    const retail = rrpHeader ? merged[rrpHeader] ?? "" : "";
    return { merged, cost, retail, name: nameHeader ? merged[nameHeader] ?? "" : "", warn: priceWarning(cost || null, retail || null) };
  };

  /** Ο δείκτης αναμονής: φόρτωση λίστας (transition) ή ενέργεια του χρήστη. */
  const busy = pending || acting;

  const act = async <T,>(fn: () => Promise<T | { error: string }>, after?: (r: T) => void) => {
    setActing(true); setErr(null); setNote(null);
    const r = await fn();
    setActing(false);
    if (r && typeof r === "object" && "error" in r) { setErr((r as { error: string }).error); return null; }
    after?.(r as T);
    return r as T;
  };

  /** Η ουρά αδειάζει σε παρτίδες· κάθε παρτίδα ανανεώνει την πρόοδο από τη βάση. */
  const runQueue = async () => {
    stop.current = false;
    setRunning(true); setErr(null);
    for (;;) {
      const r = await drainBatch(state.feedId);
      if ("error" in r) { setErr(r.error); break; }
      const p = await queueProgress(state.feedId);
      if (!("error" in p)) setProg(p);
      // Τίποτα δεν προχώρησε αλλά μένουν γραμμές: δεν ξανακαλούμε στο κενό.
      if (r.left <= 0 || !r.processed || stop.current) break;
    }
    setRunning(false);
    load();
  };

  /** «Νέο τρέξιμο»: με νέα λήψη (`fresh`) ή ξανά πάνω στο αποθηκευμένο XML. Το μήνυμα λέει πάντα από πού ήρθαν τα δεδομένα. */
  const again = (fresh: boolean) =>
    act(() => rerun(state.feedId, fresh), (r) => {
      setNote(`${sourceNote(r.source)} ${r.counts.new} νέα, ${r.counts.changed} άλλαξαν, ${r.counts.same} ίδια, ${r.counts.gone} χάθηκαν${r.problems ? ` · ${r.problems} με πρόβλημα` : ""}${r.skipped ? ` · ${r.skipped} παραλείπονται (μάρκα που δεν εισάγεται)` : ""}${r.conflicts ? ` · ${r.conflicts} συγκρούσεις με διορθώσεις σου` : ""}.`);
      void load(1);
    });

  const startImport = async () => {
    const r = await act(() => queueItems(state.feedId, filter(), except, toSoftone));
    if (!r) return;
    if (!r.queued) { setNote("Καμία γραμμή δεν μπήκε στην ουρά — δες τα φίλτρα και τις εξαιρέσεις."); return; }
    setNote(`${r.queued} ${r.queued === 1 ? "προϊόν μπήκε" : "προϊόντα μπήκαν"} στην ουρά${r.skipped ? ` · ${r.skipped} με πρόβλημα δεν μπήκαν` : ""}. Μπορείς να κλείσεις τη σελίδα: η εισαγωγή συνεχίζει από εκεί που έμεινε όταν ξαναμπείς.`);
    await runQueue();
  };

  const rows = data.rows;
  const open = at != null ? rows[at] : null;

  return (
    <div className="grid gap-3 min-w-0">
      {/* κεφαλίδα του feed */}
      <div data-help="xml.list.feed" className={`${card} flex flex-wrap items-center gap-2 p-3`}>
        <div className="min-w-0 flex-1 grid gap-0.5">
          <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-15)] [overflow-wrap:anywhere]">{state.supplier.name} <span className="font-normal text-eu-muted">· {state.supplier.code}</span></span>
          <span className="text-eu-muted text-[length:var(--fs-12)] [overflow-wrap:anywhere]">
            {state.lastRunAt ? `Τελευταίο τρέξιμο ${new Date(state.lastRunAt).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" })}` : "Δεν έχει τρέξει ακόμη"}
            {state.lastCount ? ` · ${state.lastCount.toLocaleString("el-GR")} προϊόντα στο feed` : ""} · τιμή {state.priceMode === "cost" ? "από το κόστος + markup" : "η λιανική του feed"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondary} disabled={busy || running || !state.active} onClick={() => again(true)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Νέο τρέξιμο
          </button>
          {state.snapshot.has && (
            <button type="button" className={`${btn} border-2 border-eu-line text-eu-ink-2 hover:bg-eu-surface`} disabled={busy || running || !state.active} onClick={() => again(false)}
              title="Ξαναπερνά την αντιστοίχιση στο XML που έχουμε αποθηκευμένο — χωρίς να ενοχλήσει τον προμηθευτή.">
              <Database className="size-4" aria-hidden /> Ξανά από το αποθηκευμένο
            </button>
          )}
          <button type="button" className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy || running} onClick={onRemap}>Αλλαγή αντιστοίχισης</button>
        </div>
      </div>

      {!state.active && (
        <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-surface px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">
          <Power className="size-4 shrink-0 mt-0.5 text-eu-ink-2" aria-hidden />
          <span className="min-w-0"><b>Ανενεργό feed.</b> Η λίστα διαβάζεται κανονικά, αλλά δεν τρέχει και δεν γίνεται εισαγωγή. Ενεργοποίησέ το από το πρώτο βήμα («Προμηθευτής»).</span>
        </p>
      )}

      {/* το αποθηκευμένο XML: γιατί δεν χρειάζεται νέα λήψη για κάθε δοκιμή */}
      <p data-help="xml.list.snapshot" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-muted text-[length:var(--fs-12)]">
        <Database className="size-3.5 shrink-0" aria-hidden />
        {state.snapshot.has ? (
          <span className={num}>
            Αποθηκευμένο XML από {when(state.snapshot.fetchedAt)}
            {state.snapshot.bytes ? ` · ${mb(state.snapshot.bytes)}` : ""}
            {state.snapshot.products ? ` · ${state.snapshot.products.toLocaleString("el-GR")} προϊόντα` : ""}
            {` · νέα λήψη ${state.snapshot.waitMin > 0 ? `σε ${state.snapshot.waitMin} ${state.snapshot.waitMin === 1 ? "λεπτό" : "λεπτά"}` : "επιτρέπεται τώρα"}`}
            {state.minFetchMin > 0 ? ` (όριο: μία κάθε ${state.minFetchMin}′)` : " (χωρίς όριο)"}
          </span>
        ) : <span>Δεν έχουμε αποθηκευμένο XML αυτού του feed — το πρώτο «Νέο τρέξιμο» θα το κατεβάσει.</span>}
      </p>

      {/* τιμές του προμηθευτή που δεν έχει δει ποτέ ο χρήστης */}
      {pendingKinds.length > 0 && (
        <div data-help="xml.list.pending" role="status" className={`${card} grid gap-2 p-3 border-eu-yellow bg-eu-yellow/5`}>
          <p className="m-0 flex gap-2 items-start text-eu-ink text-[length:var(--fs-14)]">
            <Tags className="size-4 shrink-0 mt-0.5 text-eu-ink-2" aria-hidden />
            <span className="min-w-0">
              <b>Καινούργιες τιμές από τον προμηθευτή.</b>{" "}
              {pendingKinds.map(([k, v]) => `${v.values} ${v.values === 1 ? VALUE_KIND[k].one : VALUE_KIND[k].many} σε ${v.items.toLocaleString("el-GR")} ${v.items === 1 ? "προϊόν" : "προϊόντα"}`).join(" · ")}
              {" — "}δεν έχουν αντιστοίχιση. Όσο μένουν έτσι, τα προϊόντα τους μπαίνουν <b>χωρίς</b> αυτό το στοιχείο.
            </span>
          </p>
          <button type="button" className={`${secondary} justify-self-start`} disabled={busy || running} onClick={onRemap}>
            <Tags className="size-4" aria-hidden /> Δες τις και αντιστοίχισέ τις
          </button>
        </div>
      )}

      {/* chips: τα πλήθη είναι η πλοήγηση */}
      <div data-help="xml.list.chips" className="grid gap-2 min-w-0">
        <div role="group" aria-label="Φίλτρα" className="flex flex-wrap gap-1.5 min-w-0">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => pick(c.key)} aria-pressed={kind === c.key} title={c.help} disabled={busy && kind !== c.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] border-2 focus-visible:outline-2 focus-visible:outline-eu-blue ${kind === c.key ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink-2 hover:border-eu-blue"} ${c.n === 0 ? "opacity-60" : ""}`}>
              {c.key === "problems" && <AlertTriangle className="size-3.5" aria-hidden />}
              {c.key === "error" && <CircleAlert className="size-3.5" aria-hidden />}
              {c.label} <span className={num}>{c.n.toLocaleString("el-GR")}</span>
            </button>
          ))}
        </div>
        <form onSubmit={search} className="flex flex-wrap gap-2 min-w-0">
          <label className="flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-w-0 flex-1 sm:max-w-sm focus-within:outline-2 focus-within:outline-eu-blue">
            <Search className="size-4 text-eu-muted shrink-0" aria-hidden />
            <span className="sr-only">Αναζήτηση SKU</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση SKU…" className="min-w-0 flex-1 bg-transparent min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none" />
            {query && <button type="button" onClick={() => { setQ(""); setQuery(""); setPage(1); }} aria-label="Καθάρισε την αναζήτηση" className="size-9 shrink-0 grid place-items-center rounded-full text-eu-muted hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>}
          </label>
          <button type="submit" className={secondary} disabled={busy}>Αναζήτηση</button>
        </form>
      </div>

      {/* επιλογή ως φίλτρο */}
      <div data-help="xml.list.selection" className={`${card} grid gap-2 p-3`}>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-eu-ink text-[length:var(--fs-14)]">
          <b className={`${num} text-[length:var(--fs-16)]`}>{willImport.toLocaleString("el-GR")}</b>
          <span>θα εισαχθούν — όλα όσα ταιριάζουν στο φίλτρο «{chips.find((c) => c.key === kind)?.label}»{query ? ` με «${query}»` : ""}</span>
          {data.exceptionsHere > 0 && <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{data.exceptionsHere} {data.exceptionsHere === 1 ? "εξαίρεση" : "εξαιρέσεις"}</span>}
          {data.problemsHere > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)] tabular-nums"><AlertTriangle className="size-3" aria-hidden />{data.problemsHere} με πρόβλημα δεν μπαίνουν</span>}
          {data.skippedHere > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 font-bold text-eu-ink-2 text-[length:var(--fs-12)] tabular-nums"><X className="size-3" aria-hidden />{data.skippedHere} παραλειπόμενης μάρκας</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9 min-w-0">
            <input type="checkbox" checked={toSoftone} disabled={busy || running} onChange={(e) => setToSoftone(e.target.checked)} className="size-4 mt-1 accent-eu-navy" />
            <span className="grid gap-0.5 min-w-0">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Και στο SoftOne</span>
              <span className="text-eu-muted text-[length:var(--fs-12)]">{writeOn ? (canErp ? "Τα κενά πεδία των υπαρχόντων ειδών θα γραφτούν στο ERP." : "Χρειάζεται το δικαίωμα «Εκτέλεση συγχρονισμού ERP» — αλλιώς η εισαγωγή σταματά.") : "Κλειστό στις Ρυθμίσεις → SoftOne: τα στοιχεία μένουν σε αναμονή, οι φωτογραφίες ανεβαίνουν."}</span>
            </span>
          </label>
          {except.length > 0 && <button type="button" onClick={() => setExcept([])} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy || running}>{except.length === 1 ? "Καθάρισε την εξαίρεση" : `Καθάρισε τις ${except.length} εξαιρέσεις`}</button>}
          <button type="button" className={primary} disabled={busy || running || willImport === 0 || !state.active} onClick={startImport}>
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Εισαγωγή {willImport.toLocaleString("el-GR")}
          </button>
          {running && <button type="button" className={secondary} onClick={() => { stop.current = true; }}>Σταμάτα μετά την παρτίδα</button>}
          {(counts.status.error ?? 0) > 0 && !running && (
            <button type="button" className={secondary} disabled={busy} onClick={() => act(() => retryErrors(state.feedId), (r) => { setNote(`${r.queued} γραμμές ξαναμπήκαν στην ουρά.`); void runQueue(); })}>
              <RotateCcw className="size-4" aria-hidden /> Δοκίμασε ξανά τα {counts.status.error} σφάλματα
            </button>
          )}
        </div>
      </div>

      {/* πρόοδος — διαβάζεται από τη βάση, επιβιώνει κλείσιμο καρτέλας */}
      {prog && (prog.queued > 0 || prog.done > 0 || prog.errors > 0) && (
        <div data-help="xml.list.progress" className={`${card} grid gap-1.5 p-3`}>
          <p aria-live="polite" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-ink text-[length:var(--fs-14)]">
            {running ? <Loader2 className="size-4 text-eu-blue shrink-0 animate-spin" aria-hidden /> : prog.queued ? <Hourglass className="size-4 text-eu-blue shrink-0" aria-hidden /> : <Check className="size-4 text-eu-blue shrink-0" aria-hidden />}
            <span className={num}><b>{prog.done.toLocaleString("el-GR")}</b> μπήκαν</span>
            {prog.queued > 0 && <span className={num}>· {prog.queued.toLocaleString("el-GR")} στην ουρά</span>}
            <span className={num}>· φωτογραφίες {prog.images.done.toLocaleString("el-GR")}/{prog.images.total.toLocaleString("el-GR")}</span>
            {prog.errors > 0 && <span className={`inline-flex items-center gap-1 text-eu-red ${num}`}><CircleAlert className="size-3.5" aria-hidden /> {prog.errors.toLocaleString("el-GR")} σφάλματα</span>}
          </p>
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">{running ? "Μπορείς να κλείσεις τη σελίδα — η ουρά συνεχίζει από εκεί που έμεινε όταν ξαναμπείς και πατήσεις «Εισαγωγή»." : prog.queued ? "Η ουρά έχει γραμμές που περιμένουν: πάτα «Εισαγωγή» για να συνεχίσει." : "Η ουρά είναι άδεια."}{prog.writeOn ? "" : " Οι αλλαγές προς το SoftOne είναι κλειστές: τα νέα είδη περιμένουν έγκριση στα «Νέα είδη»."}</p>
          <div className="flex flex-wrap items-center gap-2">
            {prog.done > 0 && <Link href="/admin/catalog/templates/nea-eidi" className="font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-9 inline-flex items-center hover:underline">Νέα είδη προς έγκριση →</Link>}
            {prog.done > 0 && (
              <button type="button" className={secondary} disabled={busy || running} onClick={onPublish}>
                <Globe className="size-4" aria-hidden /> Προετοιμασία και δημοσίευση
              </button>
            )}
          </div>
        </div>
      )}

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {note && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}

      {/* ---- η λίστα: κάρτες στο κινητό, πίνακας από md ---- */}
      {!rows.length ? (
        <p className="m-0 rounded-xl border border-dashed border-eu-line-2 bg-eu-surface/50 px-3 py-6 text-center text-eu-ink-3 text-[length:var(--fs-14)]">
          {busy ? "Φορτώνω…" : total === 0 ? "Το feed δεν έχει φορτώσει προϊόντα ακόμη — πάτα «Νέο τρέξιμο»." : "Κανένα προϊόν σε αυτό το φίλτρο."}
        </p>
      ) : (
        <>
          <ul data-help="xml.list.rows" className="m-0 p-0 list-none grid gap-2 md:hidden min-w-0">
            {rows.map((it, i) => {
              const r = row(it);
              const off = except.includes(it.sku);
              return (
                <li key={it.id} className={`${card} grid gap-1.5 p-2.5 ${off ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <button type="button" onClick={() => toggleExcept(it.sku)} aria-pressed={!off} aria-label={off ? `Βάλε το ${it.sku} στην εισαγωγή` : `Εξαίρεσε το ${it.sku} από την εισαγωγή`}
                      className="size-11 shrink-0 grid place-items-center rounded-lg text-eu-navy hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">{off ? <Square className="size-5" aria-hidden /> : <SquareCheck className="size-5" aria-hidden />}</button>
                    <button type="button" onClick={() => setAt(i)} className="min-w-0 flex-1 text-left grid gap-0.5 rounded-lg px-1 py-0.5 hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] [overflow-wrap:anywhere]">{it.sku}</span>
                      {r.name && <span className="text-eu-ink-3 text-[length:var(--fs-13)] line-clamp-2">{r.name}</span>}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-[3.25rem]">
                    <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${DIFF_CLS[it.diff]}`}>{DIFF[it.diff].label}</span>
                    <Status s={it.status} />
                    {it.images.length > 0 && <span className={`inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 text-eu-ink-3 font-bold text-[length:var(--fs-12)] ${num}`}><Images className="size-3" aria-hidden />{it.assets ? `${it.assets}/${it.images.length}` : it.images.length}</span>}
                    {it.edits && <span className="rounded-full bg-eu-blue/10 px-2 py-0.5 font-bold text-eu-blue text-[length:var(--fs-12)]">διορθωμένο</span>}
                  </div>
                  <dl className={`m-0 pl-[3.25rem] grid grid-cols-2 gap-x-2 text-[length:var(--fs-13)] ${num}`}>
                    <div className="grid"><dt className="text-eu-muted text-[length:var(--fs-12)]">Κόστος{state.priceMode === "cost" ? " →" : ""}</dt><dd className="m-0 text-eu-ink">{r.cost || "—"}</dd></div>
                    <div className="grid"><dt className="text-eu-muted text-[length:var(--fs-12)]">Λιανική feed{state.priceMode === "retail" ? " →" : ""}</dt><dd className="m-0 text-eu-ink">{r.retail || "—"}</dd></div>
                  </dl>
                  {(r.warn || it.problem || it.error) && (
                    <p className="m-0 pl-[3.25rem] flex gap-1.5 items-start text-[length:var(--fs-12)] [overflow-wrap:anywhere]">
                      {it.error || it.problem ? <CircleAlert className="size-3.5 text-eu-red shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />}
                      <span className="min-w-0 text-eu-ink">{it.error ?? it.problem ?? r.warn}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className={`${card} hidden md:block overflow-x-auto`}>
            <table className="w-full border-collapse text-[length:var(--fs-13)]">
              <caption className="sr-only">Προϊόντα του feed: επιλογή, SKU, όνομα, διαφορά, τιμές, κατάσταση</caption>
              <thead>
                <tr className="text-left text-eu-ink-2">
                  <th scope="col" className="p-2 font-bold w-10"><span className="sr-only">Στην εισαγωγή</span></th>
                  <th scope="col" className="p-2 font-bold">SKU</th>
                  <th scope="col" className="p-2 font-bold">Όνομα</th>
                  <th scope="col" className="p-2 font-bold">Διαφορά</th>
                  <th scope="col" className="p-2 font-bold text-right">Κόστος{state.priceMode === "cost" ? " →" : ""}</th>
                  <th scope="col" className="p-2 font-bold text-right">Λιανική feed{state.priceMode === "retail" ? " →" : ""}</th>
                  <th scope="col" className="p-2 font-bold">Φωτο</th>
                  <th scope="col" className="p-2 font-bold">Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it, i) => {
                  const r = row(it);
                  const off = except.includes(it.sku);
                  return (
                    <tr key={it.id} className={`border-t border-eu-line align-top ${off ? "opacity-60" : ""}`}>
                      <td className="p-1">
                        <button type="button" onClick={() => toggleExcept(it.sku)} aria-pressed={!off} aria-label={off ? `Βάλε το ${it.sku} στην εισαγωγή` : `Εξαίρεσε το ${it.sku} από την εισαγωγή`}
                          className="size-9 grid place-items-center rounded-lg text-eu-navy hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">{off ? <Square className="size-4" aria-hidden /> : <SquareCheck className="size-4" aria-hidden />}</button>
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => setAt(i)} className="text-left font-bold text-eu-navy hover:underline focus-visible:outline-2 focus-visible:outline-eu-blue [overflow-wrap:anywhere]">{it.sku}</button>
                        {it.edits && <span className="ml-1.5 rounded-full bg-eu-blue/10 px-1.5 py-0.5 font-bold text-eu-blue text-[length:var(--fs-12)]">διορθωμένο</span>}
                      </td>
                      <td className="p-2 text-eu-ink max-w-[22rem]"><span className="line-clamp-2">{r.name || "—"}</span>
                        {(it.problem || it.error) && <span className="mt-0.5 flex gap-1 items-start text-eu-red text-[length:var(--fs-12)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{it.error ?? it.problem}</span></span>}
                      </td>
                      <td className="p-2"><span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${DIFF_CLS[it.diff]}`}>{DIFF[it.diff].label}</span></td>
                      <td className={`p-2 text-right text-eu-ink ${num}`}>{r.cost || "—"}</td>
                      <td className={`p-2 text-right text-eu-ink ${num}`}>{r.retail || "—"}
                        {r.warn && <span className="mt-0.5 flex gap-1 items-start text-eu-ink text-[length:var(--fs-12)] text-left"><AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{r.warn}</span></span>}
                      </td>
                      <td className={`p-2 text-eu-ink-3 ${num}`}>{it.images.length ? (it.assets ? `${it.assets}/${it.images.length}` : it.images.length) : "—"}</td>
                      <td className="p-2"><Status s={it.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav aria-label="Σελίδες" className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondary} disabled={busy || data.page <= 1} onClick={() => setPage(data.page - 1)}><ChevronLeft className="size-4" aria-hidden /> Προηγούμενη</button>
            <span className={`text-eu-ink-3 text-[length:var(--fs-13)] ${num}`}>Σελίδα {data.page} από {data.pages} · {data.total.toLocaleString("el-GR")} προϊόντα</span>
            <button type="button" className={secondary} disabled={busy || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Επόμενη <ChevronRight className="size-4" aria-hidden /></button>
          </nav>
        </>
      )}

      {open && (
        <ProductModal
          item={open} targets={state.targets} priceMode={state.priceMode} writeOn={writeOn} feedToSoftone={toSoftone} saving={saving}
          nav={{ hasPrev: at! > 0, hasNext: at! < rows.length - 1, onPrev: () => setAt((n) => (n ?? 0) - 1), onNext: () => setAt((n) => (n ?? 0) + 1) }}
          onClose={() => setAt(null)}
          onSave={async (v) => {
            setSaving(true);
            const r = await saveItem(open.id, v);
            setSaving(false);
            // Το `ItemDTO` έχει κι αυτό `error` (το σφάλμα εισαγωγής της γραμμής): ξεχωρίζουν από το `id`, όχι από το `error`.
            if (!("id" in r)) { setErr(r.error); return; }
            setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? r : x)) }));
          }}
        />
      )}
    </div>
  );
}
