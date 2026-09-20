"use client";
import { useState, useTransition } from "react";
import { RefreshCw, Loader2, Sparkles, Search, Activity } from "lucide-react";
import { runCatalogSync, rebuildVectorIndex, testVectorSearch, checkS1 } from "./actions";

const btn = "inline-flex items-center gap-1.5 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const secondary = `${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`;

/** Κουμπιά συγχρονισμού, κατασκευή ευρετηρίου και δοκιμή σημασιολογικής αναζήτησης. */
export function CatalogTools() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof testVectorSearch>> | null>(null);
  const sync = (what: Parameters<typeof runCatalogSync>[0]) => start(async () => {
    setMsg(null);
    const r = await runCatalogSync(what);
    setMsg(r.map((x) => (x.ok ? `${x.kind}: ${x.fetched} γρ., +${x.created}, ~${x.updated}${x.missing ? `, ${x.missing} λείπουν` : ""} (${(x.ms / 1000).toFixed(1)} s)` : `${x.kind}: ΣΦΑΛΜΑ — ${x.error}`)).join(" · "));
  });
  return (
    <div className="grid gap-3 rounded-2xl border border-eu-line bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => sync("all")} className={primary}>{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Συγχρονισμός όλων (αλλαγές)</button>
        <button type="button" disabled={pending} onClick={() => sync("webcat")} className={secondary}>Κατηγορίες</button>
        <button type="button" disabled={pending} onClick={() => sync("specs")} className={secondary}>Χαρακτηριστικά</button>
        <button type="button" disabled={pending} onClick={() => sync("items-delta")} className={secondary}>Είδη · αλλαγές</button>
        <button type="button" disabled={pending} onClick={() => { if (confirm("Πλήρης ανάγνωση όλων των ειδών του site από το SoftOne. Παίρνει αρκετά λεπτά και φορτώνει τον server του ERP. Συνέχεια;")) sync("items-full"); }} className={secondary}>Είδη · πλήρης</button>
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await checkS1(); setMsg(r.ok ? "Οι web services του SoftOne απαντούν." : `Οι web services του SoftOne ΔΕΝ απαντούν: ${r.error}`); })} className={secondary}><Activity className="size-4" aria-hidden /> Έλεγχος σύνδεσης</button>
        <span className="flex-1" />
        <button type="button" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await rebuildVectorIndex(); setMsg(`Ευρετήριο: ${r.docs.total} κείμενα (+${r.docs.created}, ~${r.docs.changed}, −${r.docs.removed}) · embeddings ${r.emb.embedded}, απομένουν ${r.emb.remaining} · ${r.emb.tokens.toLocaleString("el-GR")} tokens, $${r.emb.costUsd.toFixed(4)}${r.emb.error ? ` · ΣΦΑΛΜΑ: ${r.emb.error}` : ""}`); })} className={secondary}><Sparkles className="size-4" aria-hidden /> Ενημέρωση ευρετηρίου Ερμή</button>
      </div>
      {msg && <p className="m-0 rounded-xl bg-eu-yellow/20 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]">{msg}</p>}
      <form onSubmit={(e) => { e.preventDefault(); start(async () => setHits(await testVectorSearch(q))); }} className="flex flex-wrap items-center gap-2">
        <label className="flex-1 min-w-[260px] relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Δοκιμή σημασιολογικής αναζήτησης, π.χ. «ήσυχο πλυντήριο για μικρό μπάνιο»" aria-label="Δοκιμή αναζήτησης" className="w-full rounded-full border border-eu-line pl-9 pr-3 min-h-10 text-[length:var(--fs-14)]" /></label>
        <button disabled={pending || q.trim().length < 3} className={secondary}>Δοκιμή</button>
      </form>
      {hits && (
        <ol className="m-0 p-0 list-none grid gap-1.5">
          {hits.map((h) => <li key={h.refId} className="flex flex-wrap items-baseline gap-2 text-[length:var(--fs-14)]"><span className="tabular-nums text-eu-muted w-12">{h.score.toFixed(3)}</span><span className="font-bold text-eu-ink">{h.title}</span>{h.exact && <span className="rounded-full bg-eu-green/12 text-eu-green font-bold px-2 text-[length:var(--fs-13)]">ακριβής κωδικός</span>}{h.price != null && <span className="text-eu-ink-3 tabular-nums">{h.price.toLocaleString("el-GR")} €</span>}</li>)}
          {!hits.length && <li className="text-eu-muted text-[length:var(--fs-14)]">Κανένα αποτέλεσμα — το ευρετήριο είναι άδειο ή δεν έχουν υπολογιστεί embeddings.</li>}
        </ol>
      )}
    </div>
  );
}
