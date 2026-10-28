"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleAlert, FileCode2, Link2, List, Loader2, Play, RefreshCw, Search, Sparkles, Truck } from "lucide-react";
import type { PickOpt } from "@/components/admin/catalog/OptionPicker";
import { mb, type FeedStateDTO, type InspectDTO, type SuggestDTO, type SupplierCard } from "@/lib/catalog/xml-import/ui-core";
import { feedState, findSuppliers, inspect, refreshSuppliers, rerun, saveAndRun, suggest } from "@/app/admin/(shell)/catalog/templates/xml/actions";
import { MappingSections, type MappingValue } from "./MappingSections";
import { ReviewList } from "./ReviewList";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const quiet = `${btn} text-eu-ink-3 hover:bg-eu-surface`;
const card = "rounded-xl border border-eu-line bg-white p-3 md:p-4 grid gap-3 min-w-0";
const input = "w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 md:min-h-9 text-[length:var(--fs-14)] focus-visible:outline-2 focus-visible:outline-eu-blue";

type Step = 1 | 2 | 3 | 4;
const STEPS: [Step, string][] = [[1, "Προμηθευτής"], [2, "Feed"], [3, "Αντιστοίχιση"], [4, "Λίστα ελέγχου"]];

const date = (s: string | null) => (s ? new Date(s).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" }) : null);

/**
 * Ο οδηγός «XML προμηθευτές» σε τέσσερα βήματα: προμηθευτής → feed → αντιστοίχιση → λίστα ελέγχου.
 *
 * Η πρόοδος των βημάτων είναι ορατή παντού και γυρνάς πίσω όποτε θες. Ένας προμηθευτής που έχει ήδη τρέξει **δεν
 * περνά από το ③**: η αντιστοίχιση είναι αποθηκευμένη, άρα το «Νέο τρέξιμο» πηδά στη λίστα χωρίς καμία κλήση AI.
 */
export function XmlImportWizard({ suppliers, brands, categories, writeOn, canErp }: {
  suppliers: SupplierCard[];
  brands: PickOpt[];
  categories: PickOpt[];
  writeOn: boolean;
  canErp: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [list, setList] = useState(suppliers);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<SupplierCard | null>(null);
  const [url, setUrl] = useState("");
  const [seen, setSeen] = useState<InspectDTO | null>(null);
  const [mapping, setMapping] = useState<SuggestDTO | null>(null);
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

  const choose = (s: SupplierCard) => {
    setPicked(s);
    setUrl(s.feed?.url ?? "");
    setSeen(null); setMapping(null); setFeed(null); setNote(null); setErr(null);
    if (!s.feed) setStep(2);
  };

  /** «Άνοιξε τη λίστα»: καμία λήψη, καμία κλήση AI — μόνο ό,τι είναι ήδη στη βάση. */
  const openList = async (feedId: string) => {
    const r = await run("open", () => feedState(feedId));
    if (r) { setFeed(r); setStep(4); }
  };

  /** «Νέο τρέξιμο»: ξανακατεβάζει με την αποθηκευμένη αντιστοίχιση και πηδά στη λίστα. Χωρίς AI. */
  const again = async (feedId: string) => {
    const r = await run("rerun", () => rerun(feedId));
    if (!r) return;
    const s = await run("rerun", () => feedState(feedId));
    if (!s) return;
    setNote(`Νέο τρέξιμο: ${r.counts.new} νέα, ${r.counts.changed} άλλαξαν, ${r.counts.same} ίδια, ${r.counts.gone} χάθηκαν${r.problems ? ` · ${r.problems} με πρόβλημα` : ""}${r.conflicts ? ` · ${r.conflicts} συγκρούσεις με διορθώσεις σου` : ""}.`);
    setFeed(s); setStep(4);
  };

  const check = async () => {
    const r = await run("inspect", () => inspect(url.trim()));
    if (r) setSeen(r);
  };

  const toMapping = async () => {
    const r = await run("suggest", () => suggest(url.trim()));
    if (r) { setMapping(r); setStep(3); }
  };

  const save = async (v: MappingValue) => {
    if (!picked) return;
    const r = await run("save", () => saveAndRun({ supplierId: picked.id, url: url.trim(), ...v }));
    if (!r) return;
    setNote(`Φορτώθηκαν ${r.run.total.toLocaleString("el-GR")} προϊόντα: ${r.run.counts.new} νέα, ${r.run.counts.changed} άλλαξαν, ${r.run.counts.same} ίδια, ${r.run.counts.gone} χάθηκαν${r.run.problems ? ` · ${r.run.problems} με πρόβλημα` : ""}.`);
    setFeed({ ...r });
    setStep(4);
  };

  const can = (s: Step) => s === 1 || (!!picked && (s === 2 || (s === 3 ? !!mapping : !!feed)));
  const working = !!busy;

  return (
    <div className="grid gap-4 min-w-0">
      <ol data-help="xml.steps" aria-label="Βήματα" className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STEPS.map(([n, l]) => (
          <li key={n}>
            <button type="button" disabled={!can(n) || working} onClick={() => setStep(n)} aria-current={step === n ? "step" : undefined}
              className={`w-full flex items-center gap-2 rounded-xl border-2 px-3 min-h-11 md:min-h-9 text-left font-bold text-[length:var(--fs-14)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue ${step === n ? "border-eu-navy bg-eu-navy text-white" : n < step ? "border-eu-blue/40 bg-eu-chip/40 text-eu-navy" : "border-eu-line bg-white text-eu-ink-3"}`}>
              <span className={`grid place-items-center size-6 shrink-0 rounded-full text-[length:var(--fs-12)] ${step === n ? "bg-white text-eu-navy" : "bg-eu-surface text-eu-ink-2"}`}>{n < step ? <Check className="size-3.5" aria-hidden /> : n}</span>
              <span className="min-w-0 truncate">{l}</span>
            </button>
          </li>
        ))}
      </ol>

      {err && <p role="alert" className="m-0 flex gap-2 items-start rounded-xl bg-eu-red/10 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><CircleAlert className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden /><span className="min-w-0 [overflow-wrap:anywhere]">{err}</span></p>}
      {note && step !== 4 && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}

      {/* ---------- ① Προμηθευτής ---------- */}
      {step === 1 && (
        <section data-help="xml.supplier" className={card} aria-labelledby="xs-1">
          <div className="grid gap-1">
            <h3 id="xs-1" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Truck className="size-4 text-eu-blue" aria-hidden /> 1. Προμηθευτής</h3>
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
                        <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">
                          {s.feed.lastRunAt ? `Έτρεξε ${date(s.feed.lastRunAt)}` : "Έχει feed, δεν έχει τρέξει"}{s.feed.items ? ` · ${s.feed.items.toLocaleString("el-GR")} προϊόντα στη λίστα` : ""}
                        </span>
                      ) : <span className="text-eu-muted text-[length:var(--fs-13)]">Χωρίς feed — δώσε τη διεύθυνση στο επόμενο βήμα.</span>}
                    </button>
                    {on && (
                      <div className="flex flex-wrap items-center gap-2">
                        {s.feed ? (
                          <>
                            <button type="button" className={primary} disabled={working} onClick={() => again(s.feed!.id)}>
                              {busy === "rerun" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Νέο τρέξιμο
                            </button>
                            <button type="button" className={secondary} disabled={working} onClick={() => openList(s.feed!.id)}>
                              {busy === "open" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <List className="size-4" aria-hidden />} Άνοιξε τη λίστα
                            </button>
                            <button type="button" className={quiet} disabled={working} onClick={() => setStep(2)}>Αλλαγή feed ή αντιστοίχισης</button>
                            <span className="text-eu-muted text-[length:var(--fs-12)] min-w-0 [overflow-wrap:anywhere]">Το «Νέο τρέξιμο» κατεβάζει το feed με την αποθηκευμένη αντιστοίχιση — χωρίς να ξαναρωτήσει τίποτα.</span>
                          </>
                        ) : (
                          <button type="button" className={primary} disabled={working} onClick={() => setStep(2)}>Επόμενο: το feed <ArrowRight className="size-4" aria-hidden /></button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ---------- ② Feed ---------- */}
      {step === 2 && picked && (
        <>
          <section data-help="xml.feed" className={card} aria-labelledby="xs-2">
            <div className="grid gap-1">
              <h3 id="xs-2" className="m-0 flex items-center gap-1.5 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><Link2 className="size-4 text-eu-blue" aria-hidden /> 2. Το feed του {picked.name}</h3>
              <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η διεύθυνση του XML, όπως τη δίνει ο προμηθευτής. Μόνο δημόσιες διευθύνσεις https. Ο «Έλεγχος» κατεβάζει το αρχείο και σου δείχνει τι έχει μέσα — <b>τίποτα δεν αποθηκεύεται και τίποτα δεν γράφεται</b>.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] min-w-0">
              <label className="grid gap-1 min-w-0">
                <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Διεύθυνση XML</span>
                <input value={url} onChange={(e) => { setUrl(e.target.value); setSeen(null); }} inputMode="url" placeholder="https://…/feed.xml" className={input} />
              </label>
              <button type="button" className={`${secondary} sm:self-end`} disabled={working || !url.trim()} onClick={check}>
                {busy === "inspect" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileCode2 className="size-4" aria-hidden />} Έλεγχος
              </button>
            </div>
            <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Οι προμηθευτές βάζουν όριο στις λήψεις: αν δεις «πάρα πολλά αιτήματα (429)», περίμενε λίγα λεπτά. Μία λήψη αρκεί για όλα τα βήματα.</p>
          </section>

          {seen && (
            <>
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

      {/* ---------- ③ Αντιστοίχιση ---------- */}
      {step === 3 && mapping && (
        <MappingSections suggestion={mapping} brands={brands} categories={categories} writeOn={writeOn} busy={busy === "save"} error={null} onSubmit={save} />
      )}

      {/* ---------- ④ Λίστα ελέγχου ---------- */}
      {step === 4 && feed && (
        <>
          {note && <p role="status" className="m-0 flex gap-2 items-start rounded-xl bg-eu-chip px-3 py-2 text-eu-navy text-[length:var(--fs-14)]"><Check className="size-4 shrink-0 mt-0.5" aria-hidden /><span className="min-w-0">{note}</span></p>}
          <ReviewList state={feed} writeOn={writeOn} canErp={canErp} onRemap={() => { setMapping(null); setSeen(null); setStep(2); }} />
        </>
      )}

      {step === 4 && !feed && (
        <p className="m-0 flex gap-2 items-center rounded-xl bg-eu-surface px-3 py-3 text-eu-ink-3 text-[length:var(--fs-14)]"><Play className="size-4 shrink-0" aria-hidden /> Διάλεξε προμηθευτή και φόρτωσε το feed του για να δεις τη λίστα ελέγχου.</p>
      )}
    </div>
  );
}
