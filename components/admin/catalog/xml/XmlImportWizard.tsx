"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Database, FileCode2, Link2, List, Loader2, Play, Power, RefreshCw, Rewind, Save, Search, Settings2, Sparkles, Truck } from "lucide-react";
import type { PickOpt } from "@/components/admin/catalog/OptionPicker";
import { mb, sourceNote, type DraftDTO, type FeedStateDTO, type InspectDTO, type SuggestDTO, type SupplierCard } from "@/lib/catalog/xml-import/ui-core";
import { feedState, findSuppliers, forgetDraft, inspect, refreshSuppliers, remap, rerun, saveAndRun, saveDraft, saveUrl, suggest, toggleFeed } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { Blockers, StepBrands, StepCategories, StepColumns, StepFinish, StepSpecs, useMapping, type MapStep, type MappingValue } from "./MappingSteps";
import { ReviewList } from "./ReviewList";
import { PublishStep } from "./PublishStep";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const quiet = `${btn} text-eu-ink-3 hover:bg-eu-surface`;
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

/** Τα βήματα όλου του οδηγού. Όσα είναι της αντιστοίχισης (`MapStep`) εμφανίζονται μόνο όταν έχουν δουλειά. */
type Step = "supplier" | "feed" | MapStep | "list" | "publish";
const TITLE: Record<Step, string> = {
  supplier: "Προμηθευτής",
  feed: "Feed",
  cols: "Στήλες",
  brands: "Μάρκες",
  cats: "Κατηγορίες",
  specs: "Χαρακτηριστικά",
  finish: "Τιμές & ERP",
  list: "Λίστα ελέγχου",
  publish: "Δημοσίευση",
};

/**
 * Σταθερή άδεια πρόταση. **Πρέπει** να είναι μία και η ίδια σε κάθε απόδοση: το `useMapping` ξαναχτίζει τις επιλογές
 * όταν αλλάξει η ταυτότητα της πρότασης, και ένα νέο αντικείμενο κάθε φορά θα το έβαζε σε ατέρμονο κύκλο.
 */
const NO_MAPPING: SuggestDTO = { cols: [], cats: [], specs: [], duplicates: [], aiUsed: false };

const date = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : null);

/**
 * Ο οδηγός «XML προμηθευτές»: προμηθευτής → feed → **ένα πράγμα ανά βήμα** (στήλες, μάρκες, κατηγορίες,
 * χαρακτηριστικά, τιμές & ERP) → λίστα ελέγχου.
 *
 * Η αντιστοίχιση σπάει σε χωριστά βήματα γιατί είναι τέσσερις διαφορετικές δουλειές: «τι είναι αυτή η στήλη»,
 * «ποια μάρκα μας», «ποια κατηγορία μας», «πώς λέγεται αυτό το χαρακτηριστικό». Σε μία οθόνη ο χρήστης δεν ξέρει
 * από πού να πιάσει. Εμφανίζονται **μόνο τα βήματα που έχουν δουλειά** σε αυτό το feed, και η κατάσταση ζει έξω από
 * αυτά (`useMapping`) — πας μπρος-πίσω χωρίς να χάνεις τίποτα.
 *
 * Ένας προμηθευτής που έχει ήδη τρέξει **δεν περνά από την αντιστοίχιση**: είναι αποθηκευμένη, άρα το «Νέο τρέξιμο»
 * πηδά στη λίστα χωρίς καμία κλήση AI.
 */
export function XmlImportWizard({ suppliers, brands, categories, units, marks, writeOn, canErp }: {
  suppliers: SupplierCard[];
  brands: PickOpt[];
  categories: PickOpt[];
  units: PickOpt[];
  marks: PickOpt[];
  writeOn: boolean;
  canErp: boolean;
}) {
  const [step, setStep] = useState<Step>("supplier");
  const [list, setList] = useState(suppliers);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<SupplierCard | null>(null);
  const [url, setUrl] = useState("");
  const [seen, setSeen] = useState<InspectDTO | null>(null);
  const [mapping, setMapping] = useState<SuggestDTO | null>(null);
  /** Το πρόχειρο: ό,τι είχε διαλέξει ο χρήστης σε προηγούμενη επίσκεψη, και πότε σώθηκε τελευταία. */
  const [draft, setDraft] = useState<DraftDTO | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedStateDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async <T,>(tag: string, fn: () => Promise<T | { error: string }>): Promise<T | null> => {
    setBusy(tag); setErr(null);
    const r = await fn();
    setBusy(null);
    if (r && typeof r === "object" && "error" in r) { setErr((r as { error: string }).error); return null; }
    return r as T;
  };

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run("search", () => findSuppliers(q.trim()).then((x) => x));
    if (r) setList(r);
  };

  /** Ξαναδιαβάζει τη λίστα και κρατά επιλεγμένο τον ίδιο προμηθευτή — αλλιώς η κάρτα θα έδειχνε παλιά κατάσταση. */
  const refresh = async (supplierId: string) => {
    const fresh = await findSuppliers(q.trim());
    setList(fresh);
    const same = fresh.find((x) => x.id === supplierId);
    if (same) setPicked(same);
    return same ?? null;
  };

  /** Βήμα ①: κρατά τη διεύθυνση στον προμηθευτή, χωρίς να περάσει η αντιστοίχιση. */
  const keepUrl = async (s: SupplierCard) => {
    const r = await run("url", () => saveUrl(s.id, url.trim()));
    if (!r) return;
    await refresh(s.id);
    setNote(r.cleared
      ? `Η διεύθυνση αποθηκεύτηκε. Επειδή άλλαξε, τα ${r.cleared.toLocaleString("el-GR")} φορτωμένα προϊόντα της παλιάς διεύθυνσης καθαρίστηκαν.`
      : "Η διεύθυνση αποθηκεύτηκε στον προμηθευτή. Μπορείς να ρυθμίσεις την αντιστοίχιση όποτε θέλεις.");
  };

  /**
   * Ο διακόπτης απαντά **αμέσως** και διορθώνεται αν ο server πει όχι: χωρίς αυτό ο χρήστης πατάει και το τσεκ μένει
   * όπως ήταν μέχρι να γυρίσει η απάντηση — δηλαδή μοιάζει χαλασμένο.
   */
  const flip = async (s: SupplierCard, active: boolean) => {
    if (!s.feed) return;
    const patch = (on: boolean) => {
      setList((xs) => xs.map((x) => (x.id === s.id && x.feed ? { ...x, feed: { ...x.feed, active: on } } : x)));
      setPicked((cur) => (cur && cur.id === s.id && cur.feed ? { ...cur, feed: { ...cur.feed, active: on } } : cur));
    };
    patch(active);
    const r = await run("toggle", () => toggleFeed(s.feed!.id, active));
    if (!r) { patch(!active); return; }
    await refresh(s.id);
    setNote(active ? "Το feed ενεργοποιήθηκε." : "Το feed απενεργοποιήθηκε — μένει αποθηκευμένο, αλλά δεν τρέχει.");
  };

  const choose = (s: SupplierCard) => {
    setPicked(s);
    setUrl(s.feed?.url ?? "");
    setSeen(null); setMapping(null); setDraft(null); setSavedAt(null); setFeed(null); setNote(null); setErr(null);
  };

  /** «Άνοιξε τη λίστα»: καμία λήψη, καμία κλήση AI — μόνο ό,τι είναι ήδη στη βάση. */
  const openList = async (feedId: string) => {
    const r = await run("open", () => feedState(feedId));
    if (r) { setFeed(r); setStep("list"); }
  };

  /** «Νέο τρέξιμο»: ξανακατεβάζει με την αποθηκευμένη αντιστοίχιση και πηδά στη λίστα. Χωρίς AI. */
  const again = async (feedId: string) => {
    const r = await run("rerun", () => rerun(feedId));
    if (!r) return;
    const s = await run("rerun", () => feedState(feedId));
    if (!s) return;
    setNote(`${sourceNote(r.source)} ${r.counts.new} νέα, ${r.counts.changed} άλλαξαν, ${r.counts.same} ίδια, ${r.counts.gone} χάθηκαν${r.problems ? ` · ${r.problems} με πρόβλημα` : ""}${r.skipped ? ` · ${r.skipped} παραλείπονται` : ""}${r.conflicts ? ` · ${r.conflicts} συγκρούσεις με διορθώσεις σου` : ""}.`);
    setFeed(s); setStep("list");
  };

  /** «Έλεγχος»: διαβάζει το αποθηκευμένο XML αν υπάρχει· `fresh` ζητά ρητά νέα λήψη (σέβεται το όριο του προμηθευτή). */
  const check = async (fresh = false) => {
    const r = await run("inspect", () => inspect(url.trim(), fresh));
    if (r) setSeen(r);
  };

  const toMapping = async () => {
    const r = await run("suggest", () => suggest(url.trim(), picked?.id));
    if (!r) return;
    setDraft(r.draft ?? null);
    setSavedAt(r.draft?.at ?? null);
    setMapping(r);
    setStep((r.draft?.step as Step) ?? "cols");
  };

  /**
   * «Αλλαγή αντιστοίχισης» σε feed που έχει ήδη τρέξει: οι επιλογές έρχονται από το αποθηκευμένο πρότυπο και τα bytes
   * από το αποθηκευμένο XML — καμία λήψη, κανένα ερώτημα στο AI για ό,τι είναι ήδη αποφασισμένο.
   */
  const toRemap = async (feedId: string) => {
    const r = await run("remap", () => remap(feedId));
    if (!r) return;
    setUrl(r.url);
    setSeen(null);
    setDraft(r.draft ?? null);
    setSavedAt(r.draft?.at ?? null);
    setMapping(r);
    setNote(r.source ? sourceNote(r.source) : null);
    setStep((r.draft?.step as Step) ?? "cols");
  };

  const save = async () => {
    if (!picked) return;
    const r = await run("save", () => saveAndRun({ supplierId: picked.id, url: url.trim(), ...m.value() }));
    if (!r) return;
    setNote(`Φορτώθηκαν ${r.run.total.toLocaleString("el-GR")} προϊόντα: ${r.run.counts.new} νέα, ${r.run.counts.changed} άλλαξαν, ${r.run.counts.same} ίδια, ${r.run.counts.gone} χάθηκαν${r.run.problems ? ` · ${r.run.problems} με πρόβλημα` : ""}${r.run.skipped ? ` · ${r.run.skipped} παραλείπονται (μάρκα που δεν εισάγεται)` : ""}.`);
    setFeed({ ...r });
    setDraft(null); setSavedAt(null);
    setStep("list");
  };

  /** «Ξεκίνα από την αρχή»: πετά το πρόχειρο και ξαναχτίζει τις επιλογές από την πρόταση ή το αποθηκευμένο πρότυπο. */
  const resetDraft = async () => {
    if (!picked || !mapping) return;
    const r = await run("forget", () => forgetDraft(picked.id, url.trim()));
    if (!r) return;
    setDraft(null); setSavedAt(null);
    // Νέα ταυτότητα πρότασης = το `useMapping` ξαναχτίζει τις επιλογές, τώρα χωρίς πρόχειρο.
    setMapping({ ...mapping });
    setStep("cols");
    setNote("Το πρόχειρο σβήστηκε — οι επιλογές γύρισαν στις προτάσεις.");
  };

  // Η κατάσταση της αντιστοίχισης ζει εδώ, πάνω από τα βήματα (το hook καλείται πάντα — `mapping` κενό = άδεια βήματα).
  const m = useMapping(mapping ?? NO_MAPPING, brands, draft?.value);

  const steps: Step[] = ["supplier", "feed", ...(mapping ? m.steps : []), ...(feed ? (["list", "publish"] as Step[]) : [])];
  // Το βήμα μπορεί να έπαψε να υπάρχει: ο χρήστης γύρισε στις στήλες και έβγαλε τη στήλη κατηγορίας ενώ ήταν στις
  // κατηγορίες. Τότε δείχνουμε το πρώτο βήμα της αντιστοίχισης, όχι μια οθόνη χωρίς πλοήγηση.
  const cur: Step = steps.includes(step) ? step : mapping ? "cols" : "supplier";
  const at = Math.max(0, steps.indexOf(cur));
  const working = !!busy;
  const blockedHere = m.blockers.filter((b) => b.step === cur).map((b) => b.text);
  const prev = steps[at - 1];
  const next = steps[at + 1];
  const go = (s: Step) => { setErr(null); setStep(s); };

  /**
   * **Αυτόματη αποθήκευση του προχείρου.** Η δουλειά στα ενδιάμεσα βήματα (120 κατηγορίες, ονομασίες χαρακτηριστικών)
   * δεν χάνεται επειδή έκλεισε μια καρτέλα: κάθε αλλαγή σώζεται στη βάση, κλειδωμένη στον προμηθευτή και τη διεύθυνση.
   * Γράφουμε ΜΟΝΟ όταν κάτι άλλαξε πραγματικά, μισό δευτερόλεπτο αφού ο χρήστης σταματήσει — όχι σε κάθε πληκτρολόγηση.
   */
  const inMapping = !!mapping && cur !== "supplier" && cur !== "feed" && cur !== "list" && cur !== "publish";
  // Μετράει μόνο η **αλλαγή επιλογής**, όχι η πλοήγηση: περπάτημα στα βήματα δεν φτιάχνει πρόχειρο από το πουθενά.
  const snap = inMapping ? JSON.stringify(m.value()) : "";
  const kept = useRef<{ of: SuggestDTO | null; snap: string }>({ of: null, snap: "" });
  useEffect(() => {
    if (!inMapping || !mapping || !picked || !url.trim() || working) return;
    // Πρώτη απόδοση αυτής της πρότασης: αυτό που βλέπουμε ΕΙΝΑΙ ό,τι φορτώθηκε — δεν το ξαναγράφουμε.
    if (kept.current.of !== mapping) { kept.current = { of: mapping, snap }; return; }
    if (kept.current.snap === snap) return;
    const t = setTimeout(() => {
      // Στέλνουμε ΑΥΤΟ που συγκρίναμε, όχι μια νέα ανάγνωση: ό,τι σώθηκε είναι ό,τι είδε ο χρήστης.
      const value = JSON.parse(snap) as MappingValue;
      void saveDraft({ supplierId: picked.id, url: url.trim(), step: cur, value }).then((r) => {
        if (r && !("error" in r)) { kept.current.snap = snap; setSavedAt(r.at); }
      });
    }, 500);
    return () => clearTimeout(t);
  }, [snap, inMapping, mapping, picked, url, cur, working]);

  // Πίσω / Επόμενο κάτω από κάθε βήμα της αντιστοίχισης: μία κίνηση τη φορά, με φράγμα όπου υπάρχει.
  // (Στο τελευταίο βήμα τα φράγματα τα δείχνει το ίδιο το βήμα, πάνω από το κουμπί της φόρτωσης.)
  const nav = (
    <div className="grid gap-2 min-w-0">
      {cur !== "finish" && <Blockers list={blockedHere} />}
      <div className="flex flex-wrap items-center gap-2">
        {prev && <button type="button" className={quiet} disabled={working} onClick={() => go(prev)}><ArrowLeft className="size-4" aria-hidden /> Πίσω: {TITLE[prev]}</button>}
        {next && next !== "list" && (
          <button type="button" className={primary} disabled={working || blockedHere.length > 0} onClick={() => go(next)}>
            Επόμενο: {TITLE[next]} <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 min-w-0">
      <nav data-help="xml.steps" aria-label="Βήματα" className="grid gap-1.5 min-w-0">
        {/* Υπολογιστής: όλα τα βήματα, με όνομα — γυρνάς όπου θέλεις με ένα κλικ */}
        <ol className="m-0 p-0 list-none hidden md:grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr))]">
          {steps.map((s, i) => {
            const p = m.steps.includes(s as MapStep) ? m.progress(s as MapStep) : null;
            return (
              <li key={s}>
                <button type="button" disabled={working} onClick={() => go(s)} aria-current={cur === s ? "step" : undefined}
                  className={`w-full flex items-center gap-2 rounded-xl border-2 px-2.5 min-h-9 text-left font-bold text-[length:var(--fs-13)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue ${cur === s ? "border-eu-navy bg-eu-navy text-white" : i < at ? "border-eu-blue/40 bg-eu-chip/40 text-eu-navy" : "border-eu-line bg-white text-eu-ink-3"}`}>
                  <span className={`grid place-items-center size-5 shrink-0 rounded-full text-[length:var(--fs-12)] tabular-nums ${cur === s ? "bg-white text-eu-navy" : "bg-eu-surface text-eu-ink-2"}`}>{i < at ? <Check className="size-3" aria-hidden /> : i + 1}</span>
                  <span className="min-w-0 truncate">{TITLE[s]}</span>
                  {p && p.total > 0 && <span className="ml-auto shrink-0 tabular-nums text-[length:var(--fs-12)] opacity-80">{p.done}/{p.total}</span>}
                </button>
              </li>
            );
          })}
        </ol>

        {/* Κινητό: μία γραμμή «Βήμα ν από Μ», λίστα για άλμα και πρόοδος — χωρίς οριζόντια κύλιση */}
        <div className="md:hidden grid gap-1.5 min-w-0">
          <label className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)] tabular-nums">Βήμα {at + 1} από {steps.length}</span>
            <select value={cur} disabled={working} onChange={(e) => go(e.target.value as Step)} className={input}>
              {steps.map((s, i) => <option key={s} value={s}>{i + 1}. {TITLE[s]}</option>)}
            </select>
          </label>
          <div className="flex gap-1" role="presentation">
            {steps.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i < at ? "bg-eu-blue" : i === at ? "bg-eu-navy" : "bg-eu-line"}`} />)}
          </div>
        </div>
      </nav>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {note && cur !== "list" && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}

      {/* ---------- Προμηθευτής ---------- */}
      {cur === "supplier" && (
        <section data-help="xml.supplier" className={card} aria-labelledby="xs-1">
          <div className="grid gap-1">
            <h3 id="xs-1" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Truck className="size-4 text-eu-blue" aria-hidden /> Προμηθευτής</h3>
            <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Οι προμηθευτές έρχονται από το SoftOne (μόνο ανάγνωση). Ψάξε με κωδικό, όνομα ή ΑΦΜ — η αναζήτηση αγνοεί τόνους και κεφαλαία.</p>
          </div>
          <form onSubmit={search} className="flex flex-wrap gap-2 min-w-0">
            <label className="flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-w-0 flex-1 sm:max-w-md focus-within:outline-2 focus-within:outline-eu-blue">
              <Search className="size-4 text-eu-muted shrink-0" aria-hidden />
              <span className="sr-only">Αναζήτηση προμηθευτή</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Κωδικός, όνομα ή ΑΦΜ…" className="min-w-0 flex-1 bg-transparent min-h-11 md:min-h-9 text-[length:var(--fs-14)] outline-none" />
            </label>
            <button type="submit" className={secondary} disabled={working}>{busy === "search" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Αναζήτηση</button>
            <button type="button" className={quiet} disabled={working}
              onClick={() => run("sync", () => refreshSuppliers()).then((r) => { if (r) { setNote(`Από το SoftOne: ${r.added} νέοι, ${r.updated} ενημερώθηκαν.`); void findSuppliers(q.trim()).then(setList); } })}>
              {busy === "sync" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Ανανέωση από το SoftOne
            </button>
          </form>

          {!list.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένας προμηθευτής δεν ταιριάζει. Αν λείπει, πάτα «Ανανέωση από το SoftOne».</p> : (
            <ul className="m-0 p-0 list-none grid gap-2 min-w-0">
              {list.map((s) => {
                const on = picked?.id === s.id;
                return (
                  <li key={s.id} className={`grid gap-2 rounded-xl border-2 p-2.5 min-w-0 ${on ? "border-eu-navy bg-eu-chip/30" : "border-eu-line"}`}>
                    <button type="button" onClick={() => choose(s)} aria-pressed={on} disabled={working}
                      className="text-left grid gap-0.5 min-w-0 rounded-lg px-1 py-0.5 min-h-11 md:min-h-9 hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-eu-blue disabled:opacity-50">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className="font-bold text-eu-ink text-[length:var(--fs-15)] [overflow-wrap:anywhere]">{s.name}</span>
                        <span className="rounded-full bg-eu-surface px-2 py-0.5 text-eu-ink-3 font-bold text-[length:var(--fs-12)] tabular-nums">{s.code}</span>
                        {s.afm && <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">ΑΦΜ {s.afm}</span>}
                      </span>
                      {s.feed ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                          <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">
                            {s.feed.lastRunAt ? `Έτρεξε ${date(s.feed.lastRunAt)}` : s.feed.mapped ? "Ρυθμισμένο, δεν έχει τρέξει" : "Αποθηκευμένη διεύθυνση"}{s.feed.items ? ` · ${s.feed.items.toLocaleString("el-GR")} προϊόντα στη λίστα` : ""}
                          </span>
                          {!s.feed.active && <span className="inline-flex items-center gap-1 rounded-full bg-eu-surface px-2 py-0.5 font-bold text-eu-ink-2 text-[length:var(--fs-12)]"><Power className="size-3" aria-hidden /> Ανενεργό</span>}
                          {!s.feed.mapped && <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/30 px-2 py-0.5 font-bold text-eu-ink text-[length:var(--fs-12)]"><Settings2 className="size-3" aria-hidden /> Χωρίς αντιστοίχιση</span>}
                        </span>
                      ) : <span className="text-eu-muted text-[length:var(--fs-13)]">Χωρίς feed — δώσε τη διεύθυνση πιο κάτω.</span>}
                    </button>
                    {on && (
                      <div data-help="xml.supplier.feed" className="grid gap-2 min-w-0 border-t border-eu-line pt-2">
                        {/* Η διεύθυνση σώζεται ΕΔΩ, στο πρώτο βήμα: «αυτός ο προμηθευτής έχει αυτό το XML». Η
                            αντιστοίχιση είναι χωριστή δουλειά και γίνεται όποτε βολεύει. */}
                        <form onSubmit={(e) => { e.preventDefault(); void keepUrl(s); }} className="grid gap-2 sm:grid-cols-[1fr_auto] min-w-0">
                          <label className="grid gap-1 min-w-0">
                            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Διεύθυνση XML του προμηθευτή</span>
                            <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://…/feed.xml" className={input} />
                          </label>
                          <button type="submit" className={`${secondary} sm:self-end`} disabled={working || !url.trim() || url.trim() === s.feed?.url}>
                            {busy === "url" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση
                          </button>
                        </form>

                        {s.feed && (
                          <label className="flex items-start gap-2 cursor-pointer min-h-11 md:min-h-9 min-w-0">
                            <input type="checkbox" checked={s.feed.active} disabled={working} onChange={(e) => flip(s, e.target.checked)} className="size-4 mt-1 accent-eu-navy" />
                            <span className="grid gap-0.5 min-w-0">
                              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Ενεργό</span>
                              <span className="text-eu-muted text-[length:var(--fs-12)]">{s.feed.active ? "Το feed μπορεί να τρέξει." : "Μένει αποθηκευμένο (διεύθυνση και αντιστοίχιση) αλλά δεν τρέχει."}</span>
                            </span>
                          </label>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          {s.feed?.mapped ? (
                            <>
                              <button type="button" className={primary} disabled={working || !s.feed.active} onClick={() => again(s.feed!.id)}>
                                {busy === "rerun" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Νέο τρέξιμο
                              </button>
                              <button type="button" className={secondary} disabled={working} onClick={() => openList(s.feed!.id)}>
                                {busy === "open" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <List className="size-4" aria-hidden />} Άνοιξε τη λίστα
                              </button>
                              <button type="button" className={quiet} disabled={working || !s.feed.active} onClick={() => toRemap(s.feed!.id)}>
                                {busy === "remap" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Αλλαγή αντιστοίχισης
                              </button>
                            </>
                          ) : (
                            <button type="button" className={primary} disabled={working || !url.trim()} onClick={() => go("feed")}>
                              <Settings2 className="size-4" aria-hidden /> Ρύθμισε την αντιστοίχιση <ArrowRight className="size-4" aria-hidden />
                            </button>
                          )}
                        </div>
                        <span className="text-eu-muted text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere]">
                          {s.feed?.mapped
                            ? (s.feed.active ? "Το «Νέο τρέξιμο» κατεβάζει το feed με την αποθηκευμένη αντιστοίχιση — χωρίς να ξαναρωτήσει τίποτα. Η «Αλλαγή αντιστοίχισης» ανοίγει το αποθηκευμένο πρότυπο, χωρίς καμία λήψη." : "Όσο είναι ανενεργό δεν τρέχει. Η λίστα του παραμένει αναγνώσιμη.")
                            : "Αποθήκευσε τη διεύθυνση τώρα και ρύθμισε την αντιστοίχιση όποτε θέλεις — ο προμηθευτής κρατά τη δική του ρύθμιση."}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ---------- Feed ---------- */}
      {cur === "feed" && picked && (
        <>
          <section data-help="xml.feed" className={card} aria-labelledby="xs-2">
            <div className="grid gap-1">
              <h3 id="xs-2" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Link2 className="size-4 text-eu-blue" aria-hidden /> Το feed του {picked.name}</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η διεύθυνση του XML, όπως τη δίνει ο προμηθευτής. Μόνο δημόσιες διευθύνσεις https. Ο «Έλεγχος» κατεβάζει το αρχείο και σου δείχνει τι έχει μέσα — <b>τίποτα δεν αποθηκεύεται και τίποτα δεν γράφεται</b>.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] min-w-0">
              <label className="grid gap-1 min-w-0">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Διεύθυνση XML</span>
                <input value={url} onChange={(e) => { setUrl(e.target.value); setSeen(null); }} inputMode="url" placeholder="https://…/feed.xml" className={input} />
              </label>
              <button type="button" className={`${secondary} sm:self-end`} disabled={working || !url.trim()} onClick={() => check(false)}>
                {busy === "inspect" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileCode2 className="size-4" aria-hidden />} Έλεγχος
              </button>
            </div>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Οι προμηθευτές βάζουν όριο στις λήψεις. Γι&apos; αυτό το XML κάθε λήψης <b>μένει αποθηκευμένο</b>: όλα τα επόμενα βήματα — και κάθε αλλαγή αντιστοίχισης — δουλεύουν πάνω σε αυτό, χωρίς να τον ξαναενοχλήσουν.</p>
          </section>

          {seen && (
            <>
              <section data-help="xml.feed.source" className={`${card} gap-2`} aria-label="Από πού ήρθαν τα δεδομένα">
                <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-eu-ink-2 text-[length:var(--fs-13)]">
                  {seen.source.from === "snapshot" ? <Database className="size-4 shrink-0 text-eu-blue" aria-hidden /> : <RefreshCw className="size-4 shrink-0 text-eu-blue" aria-hidden />}
                  <span className="min-w-0">{sourceNote(seen.source)}</span>
                </p>
                {seen.source.from === "snapshot" && (
                  <button type="button" className={`${secondary} justify-self-start`} disabled={working} onClick={() => check(true)}>
                    {busy === "inspect" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Κατέβασέ το ξανά τώρα
                  </button>
                )}
              </section>

              <section data-help="xml.feed.counts" className={card} aria-labelledby="xs-2b">
                <h3 id="xs-2b" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τι βρήκαμε μέσα</h3>
                <dl className="m-0 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9rem),1fr))]">
                  {([["Προϊόντα", seen.counts.products], ["Στήλες", seen.counts.tags], ["Κατηγορίες", seen.counts.categories], ["Χαρακτηριστικά", seen.counts.specLabels], ["Φωτογραφίες", seen.counts.images]] as [string, number][]).map(([l, n]) => (
                    <div key={l} className="grid gap-0.5 rounded-lg bg-eu-surface/60 px-3 py-2">
                      <dt className="text-eu-muted text-[length:var(--fs-12)]">{l}</dt>
                      <dd className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{n.toLocaleString("el-GR")}</dd>
                    </div>
                  ))}
                  <div className="grid gap-0.5 rounded-lg bg-eu-surface/60 px-3 py-2">
                    <dt className="text-eu-muted text-[length:var(--fs-12)]">Μέγεθος</dt>
                    <dd className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] tabular-nums">{mb(seen.bytes)}</dd>
                  </div>
                </dl>
              </section>

              <section data-help="xml.feed.sample" className={card} aria-labelledby="xs-2c">
                <div className="grid gap-1">
                  <h3 id="xs-2c" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Το πρώτο προϊόν, όπως ήρθε</h3>
                  <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Ακατέργαστο, μόνο τα πεδία που έχουν τιμή ({seen.sample.length} από {seen.headers.length}). Δες το πριν προχωρήσεις: αν τα ελληνικά είναι σπασμένα ή οι τιμές δεν βγάζουν νόημα, το φταίξιμο είναι στο feed.</p>
                </div>
                <div className="overflow-x-auto">
                  <dl className="m-0 grid gap-x-3 gap-y-1 [grid-template-columns:auto_1fr] text-[length:var(--fs-13)]">
                    {seen.sample.map(([k, v]) => (
                      <div key={k} className="grid [grid-template-columns:subgrid] col-span-2 gap-x-3">
                        <dt className="font-bold text-eu-ink-2 [overflow-wrap:anywhere]">{k}</dt>
                        <dd className="m-0 text-eu-ink min-w-0 [overflow-wrap:anywhere]">{v.length > 300 ? `${v.slice(0, 299)}…` : v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={primary} disabled={working} onClick={toMapping}>
                    {busy === "suggest" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Συνέχεια στην αντιστοίχιση
                  </button>
                  <span className="text-eu-muted text-[length:var(--fs-13)] min-w-0">Οι κανόνες λύνουν τις περισσότερες στήλες μόνοι τους· ό,τι μείνει πάει στο AI. Μία φορά ανά feed.</span>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* ---------- Αντιστοίχιση: ένα πράγμα ανά βήμα ---------- */}
      {mapping && cur !== "supplier" && cur !== "feed" && cur !== "list" && (
        <>
          {mapping.aiUsed && cur === "cols" && (
            <p className="m-0 flex gap-2 items-start text-eu-ink-3 text-[length:var(--fs-13)]">
              <Sparkles className="size-4 text-eu-blue shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">Ό,τι δεν έλυσαν οι κανόνες πήγε στο AI — αυτά έχουν σήμανση «AI» και θέλουν το μάτι σου. Τα υπόλοιπα βγήκαν από κανόνες και είναι σίγουρα.</span>
            </p>
          )}
          <div data-help="xml.map.draft" className="flex flex-wrap items-center gap-2 min-w-0 text-[length:var(--fs-13)]">
            <span className="flex gap-1.5 items-center text-eu-ink-3 min-w-0">
              <Save className="size-4 shrink-0 text-eu-blue" aria-hidden />
              <span className="min-w-0">
                {savedAt
                  ? <>Πρόχειρο αποθηκευμένο <b className="tabular-nums">{date(savedAt)}</b> — ό,τι διαλέγεις σώζεται μόνο του, άρα μπορείς να φύγεις και να συνεχίσεις αργότερα.</>
                  : <>Ό,τι διαλέγεις σώζεται μόνο του ως πρόχειρο — μπορείς να φύγεις και να συνεχίσεις αργότερα.</>}
              </span>
            </span>
            {savedAt && (
              <button type="button" className={quiet} disabled={working} onClick={() => void resetDraft()}>
                {busy === "forget" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rewind className="size-4" aria-hidden />} Ξεκίνα από την αρχή
              </button>
            )}
          </div>
          {cur === "cols" && <StepColumns m={m} busy={working} />}
          {cur === "brands" && <StepBrands m={m} brands={brands} busy={working} />}
          {cur === "cats" && <StepCategories m={m} categories={categories} busy={working} />}
          {cur === "specs" && <StepSpecs m={m} busy={working} />}
          {cur === "finish" && <StepFinish m={m} units={units} marks={marks} writeOn={writeOn} busy={busy === "save"} error={null} onSubmit={save} />}
          {nav}
        </>
      )}

      {/* ---------- Λίστα ελέγχου ---------- */}
      {cur === "list" && feed && (
        <>
          {note && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}
          <ReviewList state={feed} writeOn={writeOn} canErp={canErp} onRemap={() => void toRemap(feed.feedId)} onPublish={() => go("publish")} />
        </>
      )}

      {/* ---------- Δημοσίευση ---------- */}
      {cur === "publish" && feed && <PublishStep state={feed} />}

      {cur === "list" && !feed && (
        <p className="m-0 flex gap-2 items-center rounded-xl bg-eu-surface px-3 py-3 text-eu-ink-3 text-[length:var(--fs-14)]"><Play className="size-4 shrink-0" aria-hidden /> Διάλεξε προμηθευτή και φόρτωσε το feed του για να δεις τη λίστα ελέγχου.</p>
      )}
    </div>
  );
}
