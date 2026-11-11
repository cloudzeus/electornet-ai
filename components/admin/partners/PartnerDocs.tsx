"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, FileText, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { partnerDocSummaryAction, partnerDocYearAction } from "@/app/admin/(shell)/synergates/card-actions";
import { KIND_LABEL, type DocKind } from "@/lib/b2b/doc-kind";
import type { DocRow, DocSummary } from "@/lib/b2b/partner-docs";

const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const day = (s: string) => new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" });
const card = "rounded-2xl border border-eu-line bg-white p-4 min-w-0";
const KIND_TONE: Record<DocKind, string> = { sale: "bg-eu-green/10 text-eu-green", credit: "bg-eu-red/10 text-eu-red", order: "bg-eu-chip text-eu-navy", cancel: "bg-eu-surface-2 text-eu-ink-3", delivery: "bg-eu-surface-2 text-eu-ink-3", offer: "bg-eu-amber/15 text-eu-ink", other: "bg-eu-surface-2 text-eu-ink-3" };

type Sum = { state: "loading" } | { state: "error"; error: string } | { state: "ok"; s: DocSummary };

/** Η σύνοψη φορτώνεται μία φορά ανά καρτέλα (cache 6 ωρών στον server) και μοιράζεται σε KPIs και Παραστατικά. */
export function useDocSummary(partnerId: string) {
  const [sum, setSum] = useState<Sum>({ state: "loading" });
  const load = useCallback((force: boolean) => partnerDocSummaryAction(partnerId, force)
    .catch(() => ({ ok: false as const, error: "Το SoftOne δεν απαντά αυτή τη στιγμή." }))
    .then((r) => setSum(r.ok ? { state: "ok", s: r.data } : { state: "error", error: r.error })), [partnerId]);
  useEffect(() => { void load(false); }, [load]);
  return { sum, reload: () => { setSum({ state: "loading" }); void load(true); } };
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-eu-red/40 bg-eu-red/5 p-3 flex flex-wrap items-center gap-3 text-[length:var(--fs-14)]">
      <AlertTriangle className="size-4 text-eu-red shrink-0" aria-hidden /><span className="flex-1 min-w-[200px]">Τα παραστατικά δεν φορτώθηκαν: {error}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11"><RefreshCw className="size-4" aria-hidden /> Ξανά</button>
    </div>
  );
}

/** Τρία νούμερα για την Επισκόπηση: παραστατικά φέτος, τζίρος φέτος σε σχέση με πέρσι ίδια περίοδο, τελευταία παραγγελία. */
export function PartnerDocKpis({ sum, reload, onOpen }: { sum: Sum; reload: () => void; onOpen: () => void }) {
  if (sum.state === "loading") return <div className="grid grid-cols-1 @md:grid-cols-3 gap-2" aria-busy>{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-eu-surface-2 animate-pulse" />)}</div>;
  if (sum.state === "error") return <Failed error={sum.error} retry={reload} />;
  const s = sum.s, y = new Date().getFullYear(), cur = s.years.find((x) => x.year === y);
  const pct = s.ytd.prev ? Math.round(((s.ytd.now - s.ytd.prev) / Math.abs(s.ytd.prev)) * 100) : null;
  const daysAgo = s.lastOrder ? Math.round((new Date(s.at.slice(0, 10)).getTime() - new Date(s.lastOrder.date).getTime()) / 86400_000) : null;
  return (
    <div data-help="partner.kpis" className="grid grid-cols-1 @md:grid-cols-3 gap-2">
      <button type="button" onClick={onOpen} className={`${card} text-left grid gap-1 hover:border-eu-blue`}>
        <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)] font-bold"><FileText className="size-4" aria-hidden /> Παραστατικά {y}</span>
        <b className="text-eu-navy text-[length:var(--fs-26)] tabular-nums leading-none">{(cur?.n ?? 0).toLocaleString("el-GR")}</b>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)]">από τα οποία {cur?.orders ?? 0} παραγγελίες · {s.total.toLocaleString("el-GR")} σε όλα τα χρόνια</span>
      </button>
      <button type="button" onClick={onOpen} className={`${card} text-left grid gap-1 hover:border-eu-blue`}>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Τζίρος {y} μέχρι σήμερα</span>
        <b className="text-eu-navy text-[length:var(--fs-26)] tabular-nums leading-none">{eur(s.ytd.now)}</b>
        {pct == null ? <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Δεν είχε τζίρο πέρσι την ίδια περίοδο</span>
          : <span className={`inline-flex items-center gap-1 font-bold text-[length:var(--fs-13)] ${pct >= 0 ? "text-eu-green" : "text-eu-red"}`}>{pct >= 0 ? <ArrowUpRight className="size-4" aria-hidden /> : <ArrowDownRight className="size-4" aria-hidden />}{pct >= 0 ? "+" : ""}{pct}% σε σχέση με πέρσι ({eur(s.ytd.prev)})</span>}
      </button>
      <button type="button" onClick={onOpen} className={`${card} text-left grid gap-1 hover:border-eu-blue`}>
        <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)] font-bold"><ShoppingCart className="size-4" aria-hidden /> Τελευταία παραγγελία</span>
        <b className={`text-[length:var(--fs-22)] leading-tight ${daysAgo != null && daysAgo > 60 ? "text-eu-red" : "text-eu-navy"}`}>{s.lastOrder ? (daysAgo === 0 ? "σήμερα" : daysAgo === 1 ? "χθες" : `πριν ${daysAgo} μέρες`) : "καμία"}</b>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)]">{s.lastOrder ? `${s.lastOrder.fincode} · ${day(s.lastOrder.date)}${daysAgo != null && daysAgo > 60 ? " · δεν παραγγέλνει, αξίζει τηλέφωνο" : ""}` : "Δεν βρέθηκε παραγγελία στο SoftOne"}</span>
      </button>
    </div>
  );
}

/** Καρτέλα «Παραστατικά»: τζίρος ανά έτος (το επιλεγμένο τονισμένο) και η λίστα του έτους με φίλτρο είδους. */
export function PartnerDocs({ partnerId, sum, reload, onCarriers }: { partnerId: string; sum: Sum; reload: () => void; onCarriers?: (c: { name: string; n: number }[]) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<{ state: "loading" } | { state: "error"; error: string } | { state: "ok"; rows: DocRow[]; carriers: { name: string; n: number }[] }>({ state: "loading" });
  const [kind, setKind] = useState<DocKind | "all">("all");
  const [limit, setLimit] = useState(50);
  const load = useCallback((y: number, force = false) => partnerDocYearAction(partnerId, y, force)
    .catch(() => ({ ok: false as const, error: "Το SoftOne δεν απαντά αυτή τη στιγμή." }))
    .then((r) => { if (r.ok) { setRows({ state: "ok", ...r.data }); onCarriers?.(r.data.carriers); } else setRows({ state: "error", error: r.error }); }), [partnerId, onCarriers]);
  useEffect(() => { void load(year); }, [load, year]);
  const pick = (y: number) => { if (y !== year) { setRows({ state: "loading" }); setYear(y); } setLimit(50); };
  const shown = useMemo(() => (rows.state === "ok" ? rows.rows.filter((r) => kind === "all" || r.kind === kind) : []), [rows, kind]);
  const kinds = useMemo(() => (rows.state === "ok" ? [...new Set(rows.rows.map((r) => r.kind))] : []), [rows]);

  if (sum.state === "error") return <Failed error={sum.error} retry={reload} />;
  const years = sum.state === "ok" ? sum.s.years.slice(0, 12) : [];
  const max = Math.max(1, ...years.map((y) => y.turnover));
  return (
    <div className="grid gap-4 min-w-0">
      <section data-help="partner.docs.years" className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 className="m-0 text-eu-ink text-[length:var(--fs-16)] font-bold">Τζίρος ανά έτος <span className="text-eu-muted font-normal text-[length:var(--fs-13)]">τιμολόγια και αποδείξεις μείον πιστωτικά, από το SoftOne</span></h3>
          {sum.state === "ok" && <button type="button" onClick={reload} className="inline-flex items-center gap-1.5 text-eu-blue font-bold text-[length:var(--fs-13)] min-h-11"><RefreshCw className="size-3.5" aria-hidden /> Ανανέωση</button>}
        </div>
        {sum.state === "loading" ? <div className="h-40 rounded-xl bg-eu-surface-2 animate-pulse" aria-busy />
          : !years.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα παραστατικό στο SoftOne.</p>
          : <ul className="m-0 p-0 list-none grid gap-1" aria-label="Επίλεξε έτος">{years.map((y) => (
              <li key={y.year}><button type="button" onClick={() => pick(y.year)} aria-pressed={year === y.year} className={`w-full grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 min-h-11 rounded-lg px-1.5 text-left ${year === y.year ? "bg-eu-chip" : "hover:bg-eu-surface-2"}`}>
                <span className={`tabular-nums text-[length:var(--fs-14)] ${year === y.year ? "font-bold text-eu-navy" : "text-eu-ink-3"}`}>{y.year}</span>
                <span className="h-3 rounded-full bg-eu-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${year === y.year ? "bg-eu-navy" : "bg-eu-ink-3/35"}`} style={{ width: `${Math.max(1, (Math.max(0, y.turnover) / max) * 100)}%` }} /></span>
                <span className="tabular-nums text-[length:var(--fs-13)] text-eu-ink text-right">{eur(y.turnover)}<span className="block text-eu-muted text-[length:var(--fs-12)]">{y.n.toLocaleString("el-GR")} παραστ.</span></span>
              </button></li>))}</ul>}
      </section>

      <section data-help="partner.docs.list" className={card}>
        <h3 className="m-0 mb-2 text-eu-ink text-[length:var(--fs-16)] font-bold">Παραστατικά {year}</h3>
        {rows.state === "loading" && <div className="grid gap-2" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-eu-surface-2 animate-pulse" />)}</div>}
        {rows.state === "error" && <Failed error={rows.error} retry={() => { setRows({ state: "loading" }); void load(year, true); }} />}
        {rows.state === "ok" && <>
          {rows.carriers.length > 0 && <p className="m-0 mb-2 text-eu-ink-3 text-[length:var(--fs-13)] inline-flex flex-wrap items-center gap-1.5"><Truck className="size-4" aria-hidden /> Μεταφορείς στα παραστατικά: {rows.carriers.slice(0, 5).map((c) => `${c.name} (${c.n})`).join(" · ")}</p>}
          <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Είδος παραστατικού">
            {(["all", ...kinds] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setLimit(50); }} className={`rounded-full border px-3 min-h-11 text-[length:var(--fs-13)] font-bold ${kind === k ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink"}`}>
                {k === "all" ? "Όλα" : KIND_LABEL[k]} <span className="tabular-nums text-eu-muted font-normal">{k === "all" ? rows.rows.length : rows.rows.filter((r) => r.kind === k).length}</span>
              </button>
            ))}
          </div>
          {!shown.length ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα παραστατικό.</p> : (
            <ul className="m-0 p-0 list-none divide-y divide-eu-line">
              {shown.slice(0, limit).map((r) => (
                <li key={r.findoc}>
                  <Link href={`/admin/softone/chain?q=${r.findoc}&f=${r.findoc}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 min-h-11 hover:bg-eu-surface-2 rounded-lg px-1 ${r.cancelled ? "opacity-60" : ""}`}>
                    <span className="flex-1 min-w-[200px]"><b className="text-eu-ink text-[length:var(--fs-14)]">{r.fincode}</b> <span className="text-eu-ink-3 text-[length:var(--fs-13)]">· {day(r.date)}</span>
                      <span className="block text-eu-muted text-[length:var(--fs-13)] [overflow-wrap:anywhere]">{r.type}{r.carrier ? ` · ${r.carrier}` : ""}{r.comments ? ` · ${r.comments}` : ""}</span></span>
                    <span className={`text-[length:var(--fs-12)] font-bold rounded-full px-2.5 py-1 ${KIND_TONE[r.kind]}`}>{r.cancelled ? "ακυρώθηκε" : KIND_LABEL[r.kind]}</span>
                    <span className={`tabular-nums font-bold text-[length:var(--fs-14)] w-24 text-right ${r.kind === "credit" ? "text-eu-red" : "text-eu-ink"}`}>{r.kind === "credit" ? "−" : ""}{eur(r.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {shown.length > limit && <button type="button" onClick={() => setLimit(limit + 100)} className="mt-2 rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold">Δείξε άλλα {Math.min(100, shown.length - limit)} από {shown.length - limit}</button>}
        </>}
      </section>
    </div>
  );
}
