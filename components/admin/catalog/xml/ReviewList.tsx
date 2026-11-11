"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleAlert, Clock, Database, EyeOff, Globe, Hourglass, Images, Loader2, Pencil, Play, Power, RefreshCw, RotateCcw, Search, Sparkles, Square, SquareCheck, Tags, X } from "lucide-react";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { priceWarning } from "@/lib/catalog/xml-import/transform-core";
import { DIFF, DIFF_ORDER, STATUS, VALUE_KIND, mb, sourceNote, when, type FeedStateDTO, type ItemDTO, type ItemsDTO, type QueueDTO, type ValueKindDTO } from "@/lib/catalog/xml-import/ui-core";
import type { Settings } from "@/lib/cms/settings";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";
import { categoryFixAiAction, categoryFixInfoAction, drainBatch, fixCategoryAction, includeWebExcluded, items as loadItems, queueItems, queueProgress, retryErrors, rerun, saveItem } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { ProductModal } from "./ProductModal";
import { OptionPicker } from "@/components/admin/catalog/OptionPicker";
import { NO_WEB_CATEGORY } from "@/lib/catalog/foreign-import/plan-core";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const card = "rounded-xl border border-eu-line bg-white min-w-0";
const num = "tabular-nums";
const small = "inline-flex items-center justify-center gap-1 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Μικρή φωτογραφία του προϊόντος στη γραμμή· με το ποντίκι από πάνω ανοίγει μεγάλη (300px), για να φαίνεται περί τίνος
 * πρόκειται. `fixed`, γιατί ο πίνακας κυλά οριζόντια και θα την έκοβε.
 */
function Thumb({ src, name }: { src?: string; name: string }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className="size-10 shrink-0 grid place-items-center rounded-lg bg-eu-surface text-eu-muted"><Images className="size-4" aria-hidden /></span>;
  const show = (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setAt({ x: Math.min(r.right + 8, window.innerWidth - 308), y: Math.max(8, Math.min(r.top - 40, window.innerHeight - 360)) }); };
  return (
    <span className="shrink-0" onMouseEnter={show} onMouseLeave={() => setAt(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- φωτογραφία του προμηθευτή, πριν περάσει στη βιβλιοθήκη */}
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} className="size-10 rounded-lg border border-eu-line bg-white object-contain" />
      {at && (
        <span role="tooltip" style={{ left: at.x, top: at.y }} className="fixed z-50 w-[18.75rem] grid gap-1.5 rounded-xl border border-eu-line bg-white p-2 shadow-xl pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" referrerPolicy="no-referrer" className="w-full h-auto max-h-[18.75rem] object-contain" />
          {name && <span className="text-eu-ink font-bold text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{name}</span>}
        </span>
      )}
    </span>
  );
}

type FixInfo = { value: string; same: number; suggested: string | null; options: { id: string; name: string }[] };

/**
 * Οι ενέργειες μιας γραμμής με σφάλμα: τι κάνει ο χρήστης ΤΩΡΑ, χωρίς να γυρίσει στα βήματα. Σφάλμα κατηγορίας →
 * «Διάλεξε κατηγορία» (με πρόταση από το όνομα, ή από το AI αν το ζητήσει)· κάθε σφάλμα → «Δοκίμασε ξανά» και «Άνοιξε».
 */
function RowFix({ feedId, it, disabled, onRetry, onOpen, onFixed }: { feedId: string; it: ItemDTO; disabled: boolean; onRetry: () => void; onOpen: () => void; onFixed: (queued: number) => void }) {
  const [info, setInfo] = useState<FixInfo | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [from, setFrom] = useState<"name" | "ai" | null>(null);
  const [wait, setWait] = useState<"info" | "ai" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isCat = !!it.error?.includes(NO_WEB_CATEGORY);
  const run = async <T,>(what: "info" | "ai" | "save", fn: () => Promise<T | { error: string }>): Promise<T | null> => {
    setWait(what); setErr(null);
    const r = await fn().catch(() => ({ error: "Η σύνδεση διακόπηκε — ξαναδοκίμασε." }));
    setWait(null);
    if (r && typeof r === "object" && "error" in r) { setErr((r as { error: string }).error); return null; }
    return r as T;
  };
  const open = async () => { const r = await run("info", () => categoryFixInfoAction(feedId, it.sku)); if (r) { setInfo(r); setPick(r.suggested); setFrom(r.suggested ? "name" : null); } };
  const ai = async () => { const r = await run("ai", () => categoryFixAiAction(feedId, it.sku)); if (r) { if (r.categoryId) { setPick(r.categoryId); setFrom("ai"); } else setErr("Το AI δεν βρήκε κατηγορία που να ταιριάζει — διάλεξέ τη με το χέρι."); } };
  const save = async () => { if (!info || !pick) return; const r = await run("save", () => fixCategoryAction(feedId, info.value, pick)); if (r) { setInfo(null); onFixed(r.queued); } };
  const off = disabled || wait != null;
  return (
    <div data-help="xml.list.fix" className="mt-1.5 grid gap-1.5 min-w-0">
      <div className="flex flex-wrap gap-1.5">
        {isCat && !info && <button type="button" className={`${small} bg-eu-navy text-white hover:bg-eu-blue`} disabled={off} onClick={open}>{wait === "info" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Tags className="size-3.5" aria-hidden />} Διάλεξε κατηγορία</button>}
        <button type="button" className={`${small} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`} disabled={off} onClick={onRetry}><RotateCcw className="size-3.5" aria-hidden /> Δοκίμασε ξανά</button>
        <button type="button" className={`${small} text-eu-ink-2 hover:bg-eu-surface`} disabled={off} onClick={onOpen}><Pencil className="size-3.5" aria-hidden /> Άνοιξε</button>
      </div>
      {info && (
        <div className="grid gap-2 rounded-lg border border-eu-line bg-eu-surface/60 p-2.5 min-w-0">
          <p className="m-0 text-eu-ink text-[length:var(--fs-13)] [overflow-wrap:anywhere]">Η κατηγορία του προμηθευτή <b>«{info.value}»</b> θα δείχνει στην κατηγορία που διαλέγεις εδώ{info.same > 1 ? ` — ισχύει και για τα ${info.same} προϊόντα που κόλλησαν με το ίδιο σφάλμα` : ""}.</p>
          <OptionPicker options={info.options} value={pick} onChange={(id) => { setPick(id); setFrom(null); }} label="Κατηγορία στο eshop" empty="— διάλεξε κατηγορία —" disabled={off} />
          {from && pick && <p className="m-0 inline-flex items-center gap-1 text-eu-ink-3 text-[length:var(--fs-12)]"><Sparkles className="size-3.5 text-eu-blue shrink-0" aria-hidden />{from === "ai" ? "Πρόταση του AI — άλλαξέ τη αν δεν ταιριάζει." : "Πρόταση από το όνομα του προϊόντος — άλλαξέ τη αν δεν ταιριάζει."}</p>}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`${small} bg-eu-navy text-white hover:bg-eu-blue`} disabled={off || !pick} onClick={save}>{wait === "save" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} Εφάρμοσε και ξαναδοκίμασε{info.same > 1 ? ` (${info.same})` : ""}</button>
            <button type="button" className={`${small} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`} disabled={off} onClick={ai}>{wait === "ai" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Πρότεινε με AI</button>
            <button type="button" className={`${small} text-eu-ink-2 hover:bg-eu-surface`} disabled={off} onClick={() => setInfo(null)}>Άκυρο</button>
          </div>
        </div>
      )}
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-12)] [overflow-wrap:anywhere]">{err}</p>}
    </div>
  );
}

/** Κάθε κατάσταση με εικονίδιο ΚΑΙ λέξη — ποτέ μόνο χρώμα. */
const STATUS_ICON: Record<string, React.ReactNode> = {
  review: <Pencil className="size-3.5" aria-hidden />,
  queued: <Clock className="size-3.5" aria-hidden />,
  importing: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
  done: <Check className="size-3.5" aria-hidden />,
  waiting: <Clock className="size-3.5" aria-hidden />,
  error: <CircleAlert className="size-3.5" aria-hidden />,
  skipped: <X className="size-3.5" aria-hidden />,
};
const STATUS_CLS: Record<string, string> = {
  review: "bg-eu-surface text-eu-ink-2",
  queued: "bg-eu-chip text-eu-navy",
  importing: "bg-eu-chip text-eu-navy",
  done: "bg-eu-green/12 text-eu-ink",
  waiting: "bg-eu-yellow/30 text-eu-ink",
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
export function ReviewList({ state, writeOn, canErp, onRemap, onPublish, onChanged, settings }: { state: FeedStateDTO; writeOn: boolean; canErp: boolean; settings: Settings; onRemap: () => void; onPublish: () => void; /** άλλαξε ρύθμιση του feed (π.χ. «Εξαίρεση Web») — ο οδηγός ξαναδιαβάζει την κατάστασή του */ onChanged?: () => void }) {
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [except, setExcept] = useState<string[]>([]);
  // «Μόνο όσα διαλέξω»: τίποτα δεν είναι τσεκαρισμένο και μπαίνουν μόνο τα sku του `only` (από όποιο φίλτρο ή σελίδα)
  const [pickMode, setPickMode] = useState(false);
  const [only, setOnly] = useState<string[]>([]);
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
    ...((counts.status.skipped ?? 0) > 0 ? [{ key: "skipped", label: "Παραλείπονται", n: counts.status.skipped ?? 0, help: "Η μάρκα τους δεν εισάγεται (το επέλεξες στο βήμα «Μάρκες») ή το είδος τους έχει «Εξαίρεση Web» στο SoftOne. Δεν μπαίνουν ποτέ στην ουρά — για να μπουν, άλλαξε τη μάρκα και ξανατρέξε." }] : []),
  ];

  /** Τα είδη τιμών που έχουν καινούργιες, άγνωστες τιμές — με τα πολλά προϊόντα πρώτα. */
  const pendingKinds = (Object.entries(state.pending) as [ValueKindDTO, { values: number; items: number }][])
    .filter(([, v]) => v.values > 0)
    .sort((a, b) => b[1].items - a[1].items);

  const pick = (k: string) => { setKind(k); setPage(1); };
  const search = (e: React.FormEvent) => { e.preventDefault(); setQuery(q.trim()); setPage(1); };
  const flip = (sku: string) => (xs: string[]) => (xs.includes(sku) ? xs.filter((s) => s !== sku) : [...xs, sku]);
  const toggleExcept = (sku: string) => (pickMode ? setOnly(flip(sku)) : setExcept(flip(sku)));
  /** Η γραμμή ΔΕΝ θα μπει: στο «όλα» όταν την ξετσέκαρες, στο «μόνο όσα διαλέξω» όταν δεν την τσέκαρες. */
  const isOff = (sku: string) => (pickMode ? !only.includes(sku) : except.includes(sku));

  /** Πόσα θα μπουν πραγματικά: το φίλτρο, μείον οι εξαιρέσεις, μείον όσες έχουν πρόβλημα, μείον όσες παραλείπονται. */
  const willImport = pickMode ? only.length : Math.max(0, data.total - data.exceptionsHere - data.problemsHere - data.skippedHere);

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
    const r = await act(() => (pickMode ? queueItems(state.feedId, {}, [], toSoftone, only) : queueItems(state.feedId, filter(), except, toSoftone)));
    if (!r) return;
    if (!r.queued) { setNote("Καμία γραμμή δεν μπήκε στην ουρά — δες τα φίλτρα και τις εξαιρέσεις."); return; }
    if (pickMode) setOnly([]);
    setNote(`${r.queued} ${r.queued === 1 ? "προϊόν μπήκε" : "προϊόντα μπήκαν"} στην ουρά${r.skipped ? ` · ${r.skipped} με πρόβλημα δεν μπήκαν` : ""}${r.notChosen ? ` · ${r.notChosen} νέα δεν τα διάλεξες για το SoftOne (βήμα «Έλεγχος με SoftOne») και δεν μπήκαν` : ""}. Μπορείς να κλείσεις τη σελίδα: η εισαγωγή τρέχει στον server και, αν διακοπεί, συνεχίζει από εκεί που έμεινε.`);
    await runQueue();
  };

  /** Ενέργειες γραμμής με σφάλμα: ξανά μόνο αυτή, ή — μετά από αλλαγή κατηγορίας — όσες ξεκόλλησαν. */
  const retryOne = async (sku: string) => { const r = await act(() => queueItems(state.feedId, {}, [], toSoftone, [sku])); if (r?.queued) await runQueue(); };
  const fixed = (queued: number) => { setNote(`Η κατηγορία άλλαξε · ${queued} ${queued === 1 ? "προϊόν ξαναμπήκε" : "προϊόντα ξαναμπήκαν"} στην ουρά.`); void runQueue(); };
  const fixOf = (it: ItemDTO, i: number) => it.status === "error" && it.error
    ? <RowFix feedId={state.feedId} it={it} disabled={busy || running || !state.active} onRetry={() => void retryOne(it.sku)} onOpen={() => setAt(i)} onFixed={fixed} />
    : null;

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
              title="Ξαναπερνά την αντιστοίχιση στη λήψη που έχουμε αποθηκευμένη — χωρίς να ενοχλήσει τον προμηθευτή.">
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
            Αποθηκευμένη λήψη από {when(state.snapshot.fetchedAt)}
            {state.snapshot.bytes ? ` · ${mb(state.snapshot.bytes)}` : ""}
            {state.snapshot.products ? ` · ${state.snapshot.products.toLocaleString("el-GR")} προϊόντα` : ""}
            {` · νέα λήψη ${state.snapshot.waitMin > 0 ? `σε ${state.snapshot.waitMin} ${state.snapshot.waitMin === 1 ? "λεπτό" : "λεπτά"}` : "επιτρέπεται τώρα"}`}
            {state.minFetchMin > 0 ? ` (όριο: μία κάθε ${state.minFetchMin}′)` : " (χωρίς όριο)"}
          </span>
        ) : <span>Δεν έχουμε αποθηκευμένη λήψη αυτής της πηγής — το πρώτο «Νέο τρέξιμο» θα το κατεβάσει.</span>}
      </p>

      {/* υπάρχοντα είδη με «Εξαίρεση Web» στο SoftOne: εκτός εισαγωγής, εκτός αν το ζητήσει ο χρήστης */}
      <label data-help="xml.list.web-excluded" className="flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9 min-w-0 rounded-xl bg-eu-surface px-3 py-2">
        <input type="checkbox" checked={state.withWebExcluded} disabled={busy || !state.active}
          onChange={(e) => { const on = e.target.checked; void act(() => includeWebExcluded(state.feedId, on), (r) => { setNote(on ? "Τα είδη με «Εξαίρεση Web» μπήκαν στη λίστα." : `${(r.webExcluded ?? 0).toLocaleString("el-GR")} ${r.webExcluded === 1 ? "είδος με «Εξαίρεση Web» παραλείπεται" : "είδη με «Εξαίρεση Web» παραλείπονται"}.`); void load(1); onChanged?.(); }); }}
          className="size-5 mt-0.5 accent-eu-navy shrink-0" />
        <span className="grid gap-0.5 min-w-0">
          <span className="flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><EyeOff className="size-4 text-eu-ink-2" aria-hidden />Να μπουν και τα είδη με «Εξαίρεση Web»</span>
          <span className="text-eu-muted text-[length:var(--fs-12)]">{state.withWebExcluded ? "Ενημερώνονται και όσα είδη το SoftOne δεν ανεβάζει στο site (θα είναι έτοιμα αν κάποτε ανοίξουν)." : "Όσα υπάρχοντα είδη έχουν «Εξαίρεση Web» στο SoftOne δεν ανεβαίνουν στο site, γι' αυτό παραλείπονται: τα βλέπεις στο «Παραλείπονται»."}</span>
        </span>
      </label>

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
        <fieldset data-help="xml.list.pick" disabled={busy || running} className="m-0 p-0 border-0 flex flex-wrap gap-2 min-w-0">
          <legend className="sr-only">Ποια προϊόντα θα εισαχθούν</legend>
          {([[false, "Όλα του φίλτρου", "Ξετσεκάρεις όσα δεν θες."], [true, "Μόνο όσα διαλέξω", "Τσεκάρεις ένα ή περισσότερα στη λίστα."]] as const).map(([v, title, text]) => (
            <label key={String(v)} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer min-h-11 min-w-0 flex-1 basis-56 ${pickMode === v ? "border-eu-navy bg-eu-chip/30" : "border-eu-line"}`}>
              <input type="radio" name="xml-pick-mode" checked={pickMode === v} onChange={() => setPickMode(v)} className="size-4 mt-1 accent-eu-navy shrink-0" />
              <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{title}</span><span className="text-eu-muted text-[length:var(--fs-12)]">{text}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-eu-ink text-[length:var(--fs-14)]">
          <b className={`${num} text-[length:var(--fs-16)]`}>{willImport.toLocaleString("el-GR")}</b>
          {pickMode
            ? <span>{only.length ? "διαλεγμένα θα εισαχθούν — μένουν διαλεγμένα και όταν αλλάζεις φίλτρο ή σελίδα" : "διαλεγμένα — τσέκαρε στη λίστα πιο κάτω όσα θες να εισαχθούν"}</span>
            : <span>θα εισαχθούν — όλα όσα ταιριάζουν στο φίλτρο «{chips.find((c) => c.key === kind)?.label}»{query ? ` με «${query}»` : ""}</span>}
          {!pickMode && data.exceptionsHere > 0 && <span className="rounded-full bg-eu-chip px-2 py-0.5 font-bold text-eu-navy text-[length:var(--fs-12)] tabular-nums">{data.exceptionsHere} {data.exceptionsHere === 1 ? "εξαίρεση" : "εξαιρέσεις"}</span>}
          {!pickMode && data.problemsHere > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)] tabular-nums"><AlertTriangle className="size-3" aria-hidden />{data.problemsHere} με πρόβλημα δεν μπαίνουν</span>}
          {!pickMode && data.skippedHere > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 font-bold text-eu-ink-2 text-[length:var(--fs-12)] tabular-nums"><X className="size-3" aria-hidden />{data.skippedHere} παραλείπονται</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9 min-w-0">
            <input type="checkbox" checked={toSoftone} disabled={busy || running} onChange={(e) => setToSoftone(e.target.checked)} className="size-4 mt-1 accent-eu-navy" />
            <span className="grid gap-0.5 min-w-0">
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Και στο SoftOne</span>
              <span className="text-eu-muted text-[length:var(--fs-12)]">{writeOn ? (canErp ? "Τα κενά πεδία των υπαρχόντων ειδών θα γραφτούν στο ERP." : "Χρειάζεται το δικαίωμα «Εκτέλεση συγχρονισμού ERP» — αλλιώς η εισαγωγή σταματά.") : "Κλειστό στις Ρυθμίσεις → SoftOne: τα στοιχεία μένουν σε αναμονή, οι φωτογραφίες ανεβαίνουν."}</span>
            </span>
          </label>
          {pickMode && only.length > 0 && <button type="button" onClick={() => setOnly([])} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy || running}>Καθάρισε την επιλογή</button>}
          {!pickMode && except.length > 0 && <button type="button" onClick={() => setExcept([])} className={`${btn} text-eu-ink-3 hover:bg-eu-surface`} disabled={busy || running}>{except.length === 1 ? "Καθάρισε την εξαίρεση" : `Καθάρισε τις ${except.length} εξαιρέσεις`}</button>}
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
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">{running ? "Κράτα τη σελίδα ανοιχτή μέχρι να τελειώσει. Αν κλείσει, τίποτα δεν χάνεται: ξαναμπαίνεις και πατάς «Συνέχισε την ουρά»." : prog.queued ? "Η εισαγωγή σταμάτησε στη μέση (έκλεισε η σελίδα): πάτα «Συνέχισε την ουρά» — συνεχίζει από εκεί που έμεινε, χωρίς να ξανακάνει όσα μπήκαν." : "Η ουρά είναι άδεια."}{prog.writeOn ? "" : " Οι αλλαγές προς το SoftOne είναι κλειστές: τα νέα είδη περιμένουν έγκριση στα «Νέα είδη»."}</p>
          <div className="flex flex-wrap items-center gap-2">
            {prog.queued > 0 && !running && (
              <button type="button" className={primary} disabled={busy || !state.active} onClick={() => void runQueue()}>
                <Play className="size-4" aria-hidden /> Συνέχισε την ουρά ({prog.queued.toLocaleString("el-GR")})
              </button>
            )}
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
              const off = isOff(it.sku);
              return (
                <li key={it.id} className={`${card} grid gap-1.5 p-2.5 ${off && !pickMode ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <button type="button" onClick={() => toggleExcept(it.sku)} aria-pressed={!off} aria-label={off ? `Βάλε το ${it.sku} στην εισαγωγή` : `Εξαίρεσε το ${it.sku} από την εισαγωγή`}
                      className="size-11 shrink-0 grid place-items-center rounded-lg text-eu-navy hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">{off ? <Square className="size-5" aria-hidden /> : <SquareCheck className="size-5" aria-hidden />}</button>
                    <Thumb src={it.images[0]} name={r.name} />
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
                {it.skipWhy && <span className="flex gap-1 items-start text-eu-ink-2 text-[length:var(--fs-12)]"><EyeOff className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{it.skipWhy}</span></span>}
                  {fixOf(it, i)}
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
                  const off = isOff(it.sku);
                  return (
                    <tr key={it.id} className={`border-t border-eu-line align-top ${off && !pickMode ? "opacity-60" : ""}`}>
                      <td className="p-1">
                        <button type="button" onClick={() => toggleExcept(it.sku)} aria-pressed={!off} aria-label={off ? `Βάλε το ${it.sku} στην εισαγωγή` : `Εξαίρεσε το ${it.sku} από την εισαγωγή`}
                          className="size-9 grid place-items-center rounded-lg text-eu-navy hover:bg-eu-chip focus-visible:outline-2 focus-visible:outline-eu-blue">{off ? <Square className="size-4" aria-hidden /> : <SquareCheck className="size-4" aria-hidden />}</button>
                      </td>
                      <td className="p-2">
                        <span className="flex items-start gap-2 min-w-0"><Thumb src={it.images[0]} name={r.name} />
                        <button type="button" onClick={() => setAt(i)} className="text-left font-bold text-eu-navy hover:underline focus-visible:outline-2 focus-visible:outline-eu-blue [overflow-wrap:anywhere]">{it.sku}</button></span>
                        {it.edits && <span className="ml-1.5 rounded-full bg-eu-blue/10 px-1.5 py-0.5 font-bold text-eu-blue text-[length:var(--fs-12)]">διορθωμένο</span>}
                      </td>
                      <td className="p-2 text-eu-ink max-w-[22rem]"><span className="line-clamp-2">{r.name || "—"}</span>
                        {(it.problem || it.error) && <span className="mt-0.5 flex gap-1 items-start text-eu-red text-[length:var(--fs-12)]"><CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{it.error ?? it.problem}</span></span>}
                        {it.skipWhy && <span className="mt-0.5 flex gap-1 items-start text-eu-ink-2 text-[length:var(--fs-12)]"><EyeOff className="size-3.5 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{it.skipWhy}</span></span>}
                        {fixOf(it, i)}
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
          item={open} targets={state.targets} priceMode={state.priceMode} settings={settings} writeOn={writeOn} feedToSoftone={toSoftone} saving={saving}
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
