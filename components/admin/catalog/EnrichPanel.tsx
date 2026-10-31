"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Check, X, ExternalLink, AlertTriangle, Database } from "lucide-react";
import { enrichNowAction, enrichStateAction, decideSuggestionsAction, pushSpecsToErpAction, type EnrichState } from "@/app/admin/(shell)/catalog/enrich-actions";

const SOURCES = [
  { key: "icecat", label: "Icecat", hint: "δωρεάν κατάλογος κατασκευαστών" },
  { key: "web", label: "Site κατασκευαστή", hint: "επίσημη σελίδα ή κατάλογος PDF" },
  { key: "shop", label: "Άλλα καταστήματα", hint: "μόνο αν δεν βρεθεί επίσημη πηγή" },
] as const;
const SRC_LABEL: Record<string, string> = { icecat: "Icecat", web: "Κατασκευαστής", shop: "Κατάστημα" };
const STATUS: Record<string, { text: string; cls: string }> = {
  found: { text: "βρέθηκε", cls: "bg-eu-green/12 text-eu-green" },
  none: { text: "δεν βρέθηκε", cls: "bg-eu-surface text-eu-ink-3" },
  failed: { text: "σφάλμα", cls: "bg-eu-red/10 text-eu-red" },
};
const date = (s: string) => new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

/**
 * Εξωτερικές πηγές ενός προϊόντος: κατάσταση ανά πηγή, «Αναζήτηση τώρα» (Icecat → κατασκευαστής → καταστήματα) και οι
 * προτάσεις που περιμένουν έγκριση — φωτογραφίες και χαρακτηριστικά καταστημάτων. Τίποτα δεν πάει στη βιτρίνα χωρίς «Έγκριση».
 * Τα χαρακτηριστικά που εγκρίνονται γράφονται στο SoftOne (αναλυτική περιγραφή)· τα επίσημα (Icecat / κατασκευαστής) που
 * είναι ήδη στο e-shop περνούν στο SoftOne με «Εισαγωγή στο SoftOne».
 */
export function EnrichPanel({ productId, canWrite, initial }: { productId: string; canWrite: boolean; initial?: EnrichState }) {
  const [state, setState] = useState<EnrichState | null>(initial ?? null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [running, startRun] = useTransition();
  const [deciding, startDecide] = useTransition();
  const [pushing, startPush] = useTransition();
  const [erpOn, setErpOn] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => { if (!initial) enrichStateAction(productId).then(setState).catch(() => setMsg({ ok: false, text: "Δεν φορτώθηκαν οι πηγές." })); }, [productId, initial]);

  const run = () => startRun(async () => {
    setMsg(null);
    const r = await enrichNowAction(productId).catch(() => null);
    if (!r) { setMsg({ ok: false, text: "Η αναζήτηση απέτυχε — δοκίμασε ξανά." }); return; }
    setState(r.state);
    const found = r.run.steps.filter((s) => s.status === "found").map((s) => SRC_LABEL[s.source]);
    setMsg({ ok: true, text: `${found.length ? `Βρέθηκαν στοιχεία: ${found.join(", ")}.` : "Δεν βρέθηκε τίποτα νέο."} ${r.run.suggestions ? `${r.run.suggestions} νέες προτάσεις για έγκριση.` : ""}${r.run.costUsd ? ` Κόστος $${r.run.costUsd.toFixed(3)}.` : ""}` });
    router.refresh();
  });
  const decide = (decision: "approve" | "reject") => startDecide(async () => {
    const ids = [...on];
    if (!ids.length) return;
    const r = await decideSuggestionsAction(productId, ids, decision).catch(() => null);
    if (!r) { setMsg({ ok: false, text: "Η αποθήκευση απέτυχε." }); return; }
    setState(r.state); setOn(new Set());
    const res = r.result;
    const parts = [res.images ? `${res.images} φωτογραφίες στη γκαλερί` : "", res.specsErp ? `${res.specsErp} χαρακτηριστικά στο SoftOne και στο e-shop` : "", res.specsEshop ? `${res.specsEshop} χαρακτηριστικά μόνο στο e-shop (${res.erpMessage ?? "το SoftOne δεν δέχτηκε την εγγραφή"})` : ""].filter(Boolean);
    setMsg(decision === "approve"
      ? { ok: !res.failed.length && !res.specsEshop, text: `${parts.length ? `Εγκρίθηκαν: ${parts.join(" · ")}.` : "Δεν εγκρίθηκε τίποτα."}${res.failed.length ? ` Δεν κατέβηκαν ${res.failed.length}: ${res.failed[0].message}` : ""}` }
      : { ok: true, text: `Απορρίφθηκαν ${res.rejected}.` });
    router.refresh();
  });
  const pushErp = () => startPush(async () => {
    const ids = [...erpOn];
    if (!ids.length) return;
    const r = await pushSpecsToErpAction(productId, ids).catch(() => null);
    if (!r) { setMsg({ ok: false, text: "Η εισαγωγή στο SoftOne απέτυχε." }); return; }
    setState(r.state); if (r.ok) setErpOn(new Set());
    setMsg({ ok: r.ok, text: r.message });
    router.refresh();
  });

  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const images = state?.suggestions.filter((s) => s.kind === "image") ?? [];
  const specs = state?.suggestions.filter((s) => s.kind === "spec") ?? [];
  const external = state?.external ?? [];
  const bySource = new Map(state?.sources.map((s) => [s.source, s]) ?? []);
  const all = (xs: { id: string }[]) => setOn((s) => { const n = new Set(s); const every = xs.every((x) => n.has(x.id)); for (const x of xs) if (every) n.delete(x.id); else n.add(x.id); return n; });

  return (
    <div className="@container grid gap-3 min-w-0">
      <ul className="m-0 p-0 list-none grid gap-2 @md:grid-cols-3" data-help="enrich.sources">
        {SOURCES.map((s) => {
          const r = bySource.get(s.key);
          const st = r ? STATUS[r.status] : null;
          return (
            <li key={s.key} className="rounded-xl border border-eu-line bg-white p-2.5 grid gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <b className="text-eu-ink text-[length:var(--fs-14)]">{s.label}</b>
                <span className={`rounded-full px-2 font-bold text-[length:var(--fs-12)] ${st?.cls ?? "bg-eu-surface text-eu-muted"}`}>{st?.text ?? "δεν ελέγχθηκε"}</span>
              </div>
              <span className="text-eu-muted text-[length:var(--fs-12)]">{r ? `${date(r.checkedAt)}${r.specCount ? ` · ${r.specCount} χαρακτηριστικά` : ""}` : s.hint}</span>
              {r?.url && r.status === "found" && <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline break-all min-w-0"><ExternalLink className="size-3.5 shrink-0" aria-hidden />{r.sourceName || host(r.url)}</a>}
              {r?.error && r.status !== "found" && <span className="text-eu-ink-3 text-[length:var(--fs-12)] break-words">{r.error}</span>}
            </li>
          );
        })}
      </ul>

      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={running} data-help="enrich.run" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue disabled:opacity-60">
            {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            {running ? "Αναζήτηση… (έως 2 λεπτά)" : "Αναζήτηση τώρα"}
          </button>
          <span className="text-eu-muted text-[length:var(--fs-13)]">Icecat → site κατασκευαστή → άλλα καταστήματα (όχι Skroutz / Bestprice / marketplaces).</span>
        </div>
      )}
      {msg && <p role="status" className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-ink" : "bg-eu-red/10 text-eu-red"}`}>{msg.text}</p>}

      {(images.length > 0 || specs.length > 0) && (
        <div className="grid gap-3 rounded-2xl border border-eu-line bg-eu-surface/40 p-3 min-w-0" data-help="enrich.suggestions">
          <p className="m-0 flex gap-2 text-eu-ink-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0 text-eu-amber mt-0.5" aria-hidden />Φωτογραφίες και κείμενα τρίτων έχουν πνευματικά δικαιώματα. Έγκρινε μόνο όσα επιτρέπεται να χρησιμοποιήσουμε (π.χ. υλικό κατασκευαστή για μεταπωλητές). Οι εγκεκριμένες φωτογραφίες μπαίνουν στο τέλος της γκαλερί· τα χαρακτηριστικά γράφονται στο SoftOne (αναλυτική περιγραφή) και στο e-shop.</p>
          {images.length > 0 && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Προτεινόμενες φωτογραφίες ({images.length})</h4>
                {canWrite && <button type="button" onClick={() => all(images)} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-navy text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy">Επιλογή όλων</button>}
              </div>
              <ul className="m-0 p-0 list-none grid grid-cols-2 @md:grid-cols-4 @3xl:grid-cols-6 gap-2">
                {images.map((s) => (
                  <li key={s.id} className="min-w-0">
                    <label className={`grid gap-1 rounded-xl border-2 bg-white p-1.5 cursor-pointer ${on.has(s.id) ? "border-eu-navy" : "border-transparent"}`}>
                      <span className="relative block aspect-square rounded-lg bg-white overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- εξωτερική προεπισκόπηση πριν την έγκριση */}
                        <img src={s.url ?? ""} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain" />
                        {canWrite && <input type="checkbox" checked={on.has(s.id)} onChange={() => toggle(s.id)} className="absolute top-1.5 left-1.5 size-5 accent-eu-navy" aria-label={`Επιλογή φωτογραφίας από ${SRC_LABEL[s.source] ?? s.source}`} />}
                      </span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-12)] truncate">{SRC_LABEL[s.source] ?? s.source} · {host(s.pageUrl ?? s.url)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {specs.length > 0 && (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Χαρακτηριστικά από άλλα καταστήματα ({specs.length})</h4>
                {specs[0].pageUrl && <a href={specs[0].pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-13)] hover:underline"><ExternalLink className="size-3.5" aria-hidden />{specs[0].sourceName || host(specs[0].pageUrl)}</a>}
                {canWrite && <button type="button" onClick={() => all(specs)} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-navy text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy">Επιλογή όλων</button>}
              </div>
              <ul className="m-0 p-0 list-none rounded-xl border border-eu-line bg-white divide-y divide-eu-line-2">
                {specs.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-start gap-2.5 px-3 py-2 min-h-11 cursor-pointer">
                      {canWrite && <input type="checkbox" checked={on.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 size-5 shrink-0 accent-eu-navy" />}
                      <span className="grid min-w-0 text-[length:var(--fs-14)]"><span className="text-eu-muted text-[length:var(--fs-12)]">{s.group}</span><span className="break-words"><b className="text-eu-ink">{s.key}:</b> {s.value}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => decide("approve")} disabled={!on.size || deciding} className="inline-flex items-center gap-2 rounded-full bg-eu-green text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer disabled:opacity-50">
                {deciding ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Έγκριση επιλεγμένων ({on.size})
              </button>
              <button type="button" onClick={() => decide("reject")} disabled={!on.size || deciding} className="inline-flex items-center gap-2 rounded-full border border-eu-line bg-white text-eu-ink px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:border-eu-red disabled:opacity-50">
                <X className="size-4" aria-hidden /> Απόρριψη
              </button>
            </div>
          )}
        </div>
      )}
      {state && !images.length && !specs.length && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Καμία πρόταση σε αναμονή.</p>}

      {external.length > 0 && (
        <div className="grid gap-2 rounded-2xl border border-eu-line p-3 min-w-0" data-help="enrich.to-erp">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Στο e-shop αλλά όχι στο SoftOne ({external.length})</h4>
            {canWrite && <button type="button" onClick={() => setErpOn((s) => (external.every((x) => s.has(x.id)) ? new Set() : new Set(external.map((x) => x.id))))} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 font-bold text-eu-navy text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy">Επιλογή όλων</button>}
          </div>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Χαρακτηριστικά από Icecat, κατασκευαστή ή εγκεκριμένο κατάστημα. Με «Εισαγωγή στο SoftOne» μπαίνουν στο τέλος της αναλυτικής περιγραφής (τα υπάρχοντα δεν αλλάζουν).</p>
          <ul className="m-0 p-0 list-none rounded-xl border border-eu-line bg-white divide-y divide-eu-line-2 max-h-[22rem] overflow-y-auto">
            {external.map((s) => (
              <li key={s.id}>
                <label className="flex items-start gap-2.5 px-3 py-2 min-h-11 cursor-pointer">
                  {canWrite && <input type="checkbox" checked={erpOn.has(s.id)} onChange={() => setErpOn((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} className="mt-1 size-5 shrink-0 accent-eu-navy" />}
                  <span className="grid min-w-0 text-[length:var(--fs-14)]"><span className="text-eu-muted text-[length:var(--fs-12)]">{SRC_LABEL[s.source] ?? s.source} · {s.group}</span><span className="break-words"><b className="text-eu-ink">{s.key}:</b> {s.value}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {canWrite && (
            <button type="button" onClick={pushErp} disabled={!erpOn.size || pushing} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue disabled:opacity-50">
              {pushing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Database className="size-4" aria-hidden />} Εισαγωγή στο SoftOne ({erpOn.size})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
