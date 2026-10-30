"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Database, Loader2, Play, RotateCcw, Search, Square, SquareCheck } from "lucide-react";
import type { FeedStateDTO } from "@/lib/catalog/xml-import/ui-core";
import type { CheckSummary } from "@/lib/catalog/xml-import/check";
import { GROUPS, type GroupMode, type UpdatePolicy } from "@/lib/catalog/xml-import/policy-core";
import { checkRowsAction, checkSummaryAction, chooseNewAction, kickXmlAction, resumeCheckAction, startCheckAction } from "@/app/admin/(shell)/catalog/templates/xml/actions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;
const card = "rounded-xl border border-eu-line bg-white min-w-0";

type Rows = Extract<Awaited<ReturnType<typeof checkRowsAction>>, { rows: unknown }>;
const MODES: { v: GroupMode; label: string }[] = [{ v: "off", label: "Όχι" }, { v: "blank", label: "Μόνο κενά" }, { v: "overwrite", label: "Αντικατάσταση" }];
const STATUS: Record<string, { label: string; help: string; cls: string }> = {
  update: { label: "Ενημερώνονται", help: "Υπάρχουν στο SoftOne και το XML έχει στοιχεία που θα μπουν.", cls: "text-eu-blue" },
  waiting: { label: "Σε αναμονή", help: "Υπάρχουν και έχουν αλλαγές, αλλά η εγγραφή στο SoftOne είναι κλειστή — θα γραφτούν όταν ανοίξει.", cls: "text-eu-amber" },
  unchanged: { label: "Χωρίς αλλαγή", help: "Υπάρχουν στο SoftOne και δεν έχουν τίποτα να πάρουν από το XML.", cls: "text-eu-ink-3" },
  new: { label: "Νέα", help: "Δεν υπάρχουν στο SoftOne. Διάλεξε ποια θα εισαχθούν.", cls: "text-eu-green" },
  problem: { label: "Με πρόβλημα", help: "Δεν μπορούν να εισαχθούν μέχρι να διορθωθούν (δες τον λόγο σε κάθε γραμμή).", cls: "text-eu-red" },
};
const KEY_LABEL: Record<string, string> = { mtrl: "MTRL", code: "κωδικό είδους", ean: "EAN", factory: "κωδικό κατασκευαστή" };
const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });

/**
 * Βήμα «Έλεγχος με SoftOne»: ποια προϊόντα του XML είναι ήδη είδη, τι θα συμπληρωθεί ή θα αλλάξει (με την πολιτική
 * που ορίζει ο χρήστης εδώ), με τι τιμή, και ποια νέα θα εισαχθούν. Ο έλεγχος τρέχει στον server σε κομμάτια — η
 * σελίδα μόνο κοιτά την πρόοδο και μπορεί να κλείσει.
 */
export function CheckStep({ state, onDone }: { state: FeedStateDTO; onDone: () => void }) {
  const [sum, setSum] = useState<CheckSummary | null>(null);
  const [policy, setPolicy] = useState<UpdatePolicy | null>(null);
  const [priceMode, setPriceMode] = useState<"cost" | "retail">(state.priceMode === "retail" ? "retail" : "cost");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<string>("update");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Rows | null>(null);
  const [busy, start] = useTransition();

  const applySum = useCallback((r: Awaited<ReturnType<typeof checkSummaryAction>>) => {
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return null; }
    setSum(r);
    setPolicy((p) => p ?? r.policy);
    return r;
  }, []);
  const applyRows = useCallback((r: Awaited<ReturnType<typeof checkRowsAction>>) => {
    if ("error" in r) setMsg({ ok: false, text: r.error }); else setRows(r);
  }, []);
  const load = useCallback(() => checkSummaryAction(state.feedId).then(applySum), [state.feedId, applySum]);
  const loadRows = useCallback(() => checkRowsAction(state.feedId, tab, page, q).then(applyRows), [state.feedId, tab, page, q, applyRows]);

  useEffect(() => { void checkSummaryAction(state.feedId).then(applySum); }, [state.feedId, applySum]);
  useEffect(() => { void checkRowsAction(state.feedId, tab, page, q).then(applyRows); }, [state.feedId, tab, page, q, applyRows]);
  const running = sum?.status === "running";
  // όσο τρέχει: ανανέωση κάθε 4″ και «σκούντημα» του εκτελεστή (στην παραγωγή το κάνει και ο scheduler κάθε λεπτό)
  useEffect(() => {
    if (!running) return;
    let n = 0;
    const h = setInterval(async () => {
      if (n++ % 8 === 0) await kickXmlAction();
      const r = await load();
      if (r?.status !== "running") void loadRows();
    }, 4000);
    return () => clearInterval(h);
  }, [running, load, loadRows]);

  const run = () => policy && start(async () => {
    setMsg(null);
    const r = await startCheckAction(state.feedId, policy, priceMode);
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `Ο έλεγχος ξεκίνησε για ${r.total.toLocaleString("el-GR")} προϊόντα. Τρέχει στον server — μπορείς να κλείσεις τη σελίδα.` });
    await load();
  });
  const resume = () => start(async () => { const r = await resumeCheckAction(state.feedId); if ("error" in r) setMsg({ ok: false, text: r.error }); await load(); });
  const choose = (which: string[] | "all" | "none", value: boolean) => start(async () => {
    const r = await chooseNewAction(state.feedId, which, value);
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    if (!Array.isArray(which)) setMsg({ ok: true, text: which === "all" ? "Όλα τα νέα θα εισαχθούν στο SoftOne (περνούν πρώτα από έγκριση στα «Νέα είδη»)." : "Κανένα νέο δεν θα εισαχθεί στο SoftOne." });
    await Promise.all([load(), loadRows()]);
  });

  const s = sum;
  const pct = s && s.total ? Math.round((s.checked / s.total) * 100) : 0;
  const changed = s && policy && (JSON.stringify(policy) !== JSON.stringify(s.policy) || priceMode !== s.priceMode);

  return (
    <div className="grid gap-3 min-w-0">
      <section data-help="xml.check.policy" className={`${card} p-4 grid gap-3`} aria-labelledby="xc-policy">
        <div>
          <h3 id="xc-policy" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τι επιτρέπεται να αλλάξει το XML σε είδη που υπάρχουν ήδη</h3>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-13)]">«Μόνο κενά» συμπληρώνει ό,τι λείπει στο SoftOne· «Αντικατάσταση» αλλάζει και ό,τι διαφέρει. Το όνομα του είδους δεν αντικαθίσταται ποτέ. Τα νέα είδη παίρνουν ό,τι έχει το XML.</p>
        </div>
        {policy && (
          <div className="grid gap-2 lg:grid-cols-3">
            {GROUPS.map((g) => (
              <fieldset key={g.key} className="rounded-lg border border-eu-line-2 p-3 grid gap-2 min-w-0">
                <legend className="px-1 font-bold text-eu-ink text-[length:var(--fs-14)]">{g.label}</legend>
                <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">{g.help}</p>
                <div role="radiogroup" aria-label={g.label} className="flex flex-wrap gap-1">
                  {MODES.map((m) => (
                    <button key={m.v} type="button" role="radio" aria-checked={policy[g.key] === m.v} onClick={() => setPolicy({ ...policy, [g.key]: m.v })}
                      className={`min-h-11 rounded-full px-3 text-[length:var(--fs-13)] font-bold border ${policy[g.key] === m.v ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink-3 hover:border-eu-navy"}`}>{m.label}</button>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        {policy && (
          <fieldset data-help="xml.check.price" className="rounded-lg border border-eu-line-2 p-3 grid gap-2">
            <legend className="px-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Πώς βγαίνει η τιμή</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[length:var(--fs-14)]">
              <label className="inline-flex items-center gap-2 min-h-11"><input type="radio" name="xc-pm" checked={priceMode === "cost"} onChange={() => setPriceMode("cost")} className="size-5" /> Κόστος × κανόνας τιμολόγησης (markup)</label>
              <label className="inline-flex items-center gap-2 min-h-11"><input type="radio" name="xc-pm" checked={priceMode === "retail"} onChange={() => setPriceMode("retail")} className="size-5" /> Η λιανική του feed ως έχει</label>
            </div>
            <label className="inline-flex items-start gap-2 min-h-11 text-[length:var(--fs-14)]">
              <input type="checkbox" checked={policy.vatIncluded} onChange={(e) => setPolicy({ ...policy, vatIncluded: e.target.checked })} className="size-5 mt-0.5" />
              <span>Η τιμή του feed <b>περιλαμβάνει ΦΠΑ</b><span className="block text-eu-muted text-[length:var(--fs-12)]">{priceMode === "cost" ? "Αν ναι, ο ΦΠΑ αφαιρείται από το κόστος πριν από το markup." : "Αν όχι, προστίθεται ο ΦΠΑ του είδους στη λιανική."}</span></span>
            </label>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={busy || running || !policy} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Database className="size-4" aria-hidden />} {s?.status ? "Νέος έλεγχος με αυτές τις επιλογές" : "Έλεγχος με SoftOne"}</button>
          {changed && s?.status && <span className="text-eu-amber font-bold text-[length:var(--fs-13)]">Άλλαξες επιλογές — ξανατρέξε τον έλεγχο για να ισχύσουν και στην εισαγωγή.</span>}
        </div>
      </section>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 rounded-xl px-4 py-3 text-[length:var(--fs-14)] flex gap-2 ${msg.ok ? "bg-eu-green/10" : "bg-eu-red/10"}`}>{msg.ok ? <Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />}<span>{msg.text}</span></p>}

      {s?.status && (
        <section data-help="xml.check.progress" className={`${card} p-4 grid gap-2`} aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-2">{running ? <Loader2 className="size-4 animate-spin text-eu-blue" aria-hidden /> : s.status === "done" ? <Check className="size-4 text-eu-green" aria-hidden /> : <AlertTriangle className="size-4 text-eu-red" aria-hidden />}{running ? "Ο έλεγχος τρέχει…" : s.status === "done" ? "Ο έλεγχος ολοκληρώθηκε" : "Ο έλεγχος σταμάτησε"}</span>
            <span className="tabular-nums text-eu-ink-3 text-[length:var(--fs-13)]">{s.checked.toLocaleString("el-GR")} / {s.total.toLocaleString("el-GR")}</span>
          </div>
          <div className="h-2 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος ελέγχου"><div className={`h-full ${s.status === "failed" ? "bg-eu-red" : "bg-eu-blue"}`} style={{ width: `${pct}%` }} /></div>
          {s.message && <p className={`m-0 text-[length:var(--fs-14)] ${s.status === "failed" ? "text-eu-red font-bold" : "text-eu-ink"}`}>{s.message}</p>}
          {s.status === "failed" && <button type="button" onClick={resume} disabled={busy} className={`${secondary} justify-self-start`}><RotateCcw className="size-4" aria-hidden /> Συνέχεια από εκεί που σταμάτησε</button>}
          {s.importMessage && <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-13)] text-eu-ink"><b>Τελευταία εισαγωγή: </b>{s.importMessage}</p>}
        </section>
      )}

      {s && s.checked > 0 && (
        <>
          <section data-help="xml.check.summary" className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {(["update", "waiting", "unchanged", "new", "problem"] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setTab(k); setPage(1); }} aria-pressed={tab === k} title={STATUS[k].help}
                className={`${card} p-3 text-left grid gap-0.5 ${tab === k ? "ring-2 ring-eu-navy" : "hover:border-eu-navy"}`}>
                <span className={`font-heading font-bold text-[length:var(--fs-22)] tabular-nums ${STATUS[k].cls}`}>{s.counts[k].toLocaleString("el-GR")}</span>
                <span className="font-bold text-eu-ink text-[length:var(--fs-13)]">{STATUS[k].label}</span>
              </button>
            ))}
          </section>
          <section className={`${card} p-4 grid gap-2`} aria-labelledby="xc-found">
            <h3 id="xc-found" className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">{s.existing.toLocaleString("el-GR")} από τα {s.checked.toLocaleString("el-GR")} είναι ήδη είδη του SoftOne</h3>
            {Object.keys(s.matchedBy).length > 0 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Βρέθηκαν με {Object.entries(s.matchedBy).map(([k, n]) => `${KEY_LABEL[k] ?? k}: ${n.toLocaleString("el-GR")}`).join(" · ")}.</p>}
            {!s.writeOn && (s.counts.update + s.counts.waiting) > 0 && <p className="m-0 rounded-lg bg-eu-amber/10 px-3 py-2 text-[length:var(--fs-13)]">Η εγγραφή προϊόντων στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne): οι αλλαγές θα περιμένουν. Οι φωτογραφίες περνούν κανονικά.</p>}
            {s.fields.length > 0 && (
              <div className="overflow-x-auto">
                <table data-help="xml.check.fields" className="w-full text-[length:var(--fs-13)]">
                  <thead><tr className="text-left text-eu-muted"><th className="py-1.5 pr-3 font-bold">Πεδίο</th><th className="py-1.5 pr-3 font-bold text-right">Συμπληρώνεται (κενό στο SoftOne)</th><th className="py-1.5 font-bold text-right">Αντικαθίσταται</th></tr></thead>
                  <tbody>
                    {s.fields.map((f) => <tr key={f.label} className="border-t border-eu-line-2"><td className="py-1.5 pr-3 text-eu-ink">{f.label}</td><td className="py-1.5 pr-3 text-right tabular-nums">{f.fill ? f.fill.toLocaleString("el-GR") : "—"}</td><td className="py-1.5 text-right tabular-nums">{f.overwrite ? f.overwrite.toLocaleString("el-GR") : "—"}</td></tr>)}
                    {s.priced > 0 && <tr className="border-t border-eu-line-2"><td className="py-1.5 pr-3 text-eu-ink">Τιμή web</td><td colSpan={2} className="py-1.5 text-right tabular-nums">{s.priced.toLocaleString("el-GR")}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {s.counts.new > 0 && (
            <section data-help="xml.check.new" className={`${card} p-4 flex flex-wrap items-center justify-between gap-2`}>
              <p className="m-0 text-[length:var(--fs-14)] text-eu-ink"><b>{s.newChosen.toLocaleString("el-GR")}</b> από τα <b>{s.counts.new.toLocaleString("el-GR")}</b> νέα θα εισαχθούν στο SoftOne (περνούν πρώτα από έγκριση στα «Νέα είδη»). Όσα δεν επιλέξεις δεν μπαίνουν στην ουρά.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => choose("all", true)} disabled={busy} className={secondary}><SquareCheck className="size-4" aria-hidden /> Όλα τα νέα</button>
                <button type="button" onClick={() => choose("none", false)} disabled={busy} className={secondary}><Square className="size-4" aria-hidden /> Κανένα</button>
              </div>
            </section>
          )}

          <section data-help="xml.check.rows" className={`${card} p-3 grid gap-2`} aria-label={`Προϊόντα: ${STATUS[tab].label}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`m-0 font-bold text-[length:var(--fs-15)] ${STATUS[tab].cls}`}>{STATUS[tab].label}</h3>
              <span className="text-eu-muted text-[length:var(--fs-13)] flex-1 min-w-[12rem]">{STATUS[tab].help}</span>
              <label className="relative">
                <span className="sr-only">Αναζήτηση SKU</span>
                <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="SKU…" className="min-h-11 w-44 rounded-full border border-eu-line pl-9 pr-3 text-[length:var(--fs-14)]" />
              </label>
            </div>
            {!rows?.rows.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα προϊόν εδώ.</p> : (
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {rows.rows.map((r) => (
                  <li key={r.id} className="rounded-lg border border-eu-line-2 px-3 py-2 grid gap-1 min-w-0">
                    <div className="flex flex-wrap items-start gap-2">
                      {r.s1Status === "new" && (
                        <label className="inline-flex items-center gap-1.5 min-h-11 font-bold text-[length:var(--fs-13)] text-eu-ink shrink-0">
                          <input type="checkbox" checked={r.softone} disabled={busy} onChange={(e) => choose([r.id], e.target.checked)} className="size-5" /> Στο SoftOne
                        </label>
                      )}
                      <div className="flex-1 min-w-[12rem]">
                        <div className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{r.check.title ?? r.sku}</div>
                        <div className="text-eu-muted text-[length:var(--fs-12)] inline-flex flex-wrap gap-x-2">
                          <span className="font-mono">SKU {r.sku}</span>
                          {r.check.mtrl && <span>είδος {r.check.code ?? r.check.mtrl}{r.check.matchedBy ? ` · βρέθηκε με ${KEY_LABEL[r.check.matchedBy] ?? r.check.matchedBy}` : ""}</span>}
                          {r.check.fileName && r.check.fileName !== r.check.title && <span>στο XML: «{r.check.fileName}»</span>}
                          {r.check.price && <span>τιμή {eur(r.check.price.price)}</span>}
                        </div>
                      </div>
                    </div>
                    {r.check.problem && <p className="m-0 text-eu-red text-[length:var(--fs-13)] font-bold">{r.check.problem}</p>}
                    {r.check.changes?.length ? (
                      <details className="text-[length:var(--fs-13)]"><summary className="cursor-pointer text-eu-blue font-bold">{r.check.changes.length} {r.check.changes.length === 1 ? "πεδίο" : "πεδία"}</summary>
                        <ul className="m-0 mt-1 pl-5 grid gap-0.5">{r.check.changes.map((c, i) => <li key={i}><b>{c.label}</b>: <span className="text-eu-muted">{c.from || "—"}</span> → {c.to}</li>)}</ul>
                      </details>
                    ) : null}
                    {r.check.warnings?.length ? <p className="m-0 text-eu-amber text-[length:var(--fs-12)]">{r.check.warnings.join(" · ")}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            {rows && rows.pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button type="button" aria-label="Προηγούμενη σελίδα" disabled={page <= 1} onClick={() => setPage(page - 1)} className="size-11 grid place-items-center rounded-full border border-eu-line disabled:opacity-40"><ChevronLeft className="size-4" aria-hidden /></button>
                <span className="tabular-nums text-[length:var(--fs-13)]">{rows.page} / {rows.pages}</span>
                <button type="button" aria-label="Επόμενη σελίδα" disabled={page >= rows.pages} onClick={() => setPage(page + 1)} className="size-11 grid place-items-center rounded-full border border-eu-line disabled:opacity-40"><ChevronRight className="size-4" aria-hidden /></button>
              </div>
            )}
          </section>
          {s.status === "done" && <button type="button" onClick={onDone} className={`${primary} justify-self-end`}><Play className="size-4" aria-hidden /> Στη λίστα για εισαγωγή</button>}
        </>
      )}
    </div>
  );
}
