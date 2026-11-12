"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ExternalLink, Loader2, RotateCcw, X } from "lucide-react";
import { changePriceAction, kotCheckAction, priceInfoAction, undoPriceAction, type KotCheck, type PriceInfo } from "@/app/admin/(shell)/catalog/kot-actions";
import { confirmPairs, rejectPair, setPair } from "@/app/admin/(shell)/catalog/competitors/actions";
import { checkPrice, marginPct } from "@/lib/competitors/price-core";
import { eur, pct } from "@/lib/competitors/badge";
import type { Toast } from "@/components/admin/customers/CustomerActions";

const btn = "inline-flex items-center justify-center gap-1.5 rounded-full px-4 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] disabled:opacity-60";
const primary = `${btn} bg-eu-navy text-white hover:bg-eu-blue`;
const ghost = `${btn} border border-eu-line text-eu-ink-2 hover:border-eu-navy`;
const fmtIn = (v: number) => v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const Loading = () => <p className="m-0 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden />Φορτώνω…</p>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="grid min-w-0 rounded-lg bg-eu-surface px-2.5 py-1.5"><span className="text-eu-muted text-[length:var(--fs-12)]">{label}</span><b className="tabular-nums text-eu-ink text-[length:var(--fs-16)]">{value}</b>{sub && <span className="text-eu-muted text-[length:var(--fs-12)] truncate">{sub}</span>}</div>;
}

/** Παράθυρο «Αλλαγή τιμής»: νέα τιμή web με ζωντανή προεπισκόπηση περιθωρίου και διαφοράς από τον Κωτσόβολο· γράφει στο SoftOne με αναίρεση. */
export function PriceChange({ productId, onDone }: { productId: string; onDone: (t: Toast) => void }) {
  const [info, setInfo] = useState<PriceInfo | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [v, setV] = useState("");
  const [arm, setArm] = useState(false);
  const [done, setDone] = useState<{ batchId: string; value: number; undone?: boolean } | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { void priceInfoAction(productId).then((r) => { if (r.ok) { setInfo(r.info); setV(fmtIn(r.info.web)); } else { setInfo(null); setErr(r.error); } }); }, [productId]);
  const c = useMemo(() => (info ? checkPrice(v, info.web, info.vat, info.cost) : null), [v, info]);
  useEffect(() => setArm(false), [v]);
  if (info === undefined) return <Loading />;
  if (!info) return <p role="alert" className="m-0 text-eu-red font-semibold text-[length:var(--fs-13)]">{err}</p>;
  const nowMargin = marginPct(info.web, info.vat, info.cost);
  const vsKot = c?.ok && info.theirs != null ? c.value - info.theirs : null;
  const needConfirm = !!c?.ok && (c.belowCost || c.bigDrop);
  const save = () => start(async () => {
    const r = await changePriceAction(productId, v, info.web, arm);
    if (r.ok) { setDone({ batchId: r.batchId, value: r.value }); onDone({ ok: true, text: `Νέα τιμή ${eur(r.value)} γράφτηκε στο SoftOne και στο e-shop.` }); return; }
    if (r.needConfirm) { setArm(true); return; }
    setErr(r.error);
  });
  const undo = () => start(async () => {
    const r = await undoPriceAction(done!.batchId);
    if (r.ok) { setDone({ ...done!, undone: true }); onDone({ ok: true, text: `Αναιρέθηκε: η τιμή ξαναγύρισε στα ${eur(info.web)}.` }); } else setErr(r.error);
  });

  if (done) return (
    <div className="grid gap-2.5">
      <p role="status" className="m-0 inline-flex items-start gap-2 rounded-lg bg-eu-green/10 px-2.5 py-2 text-eu-green font-semibold text-[length:var(--fs-14)]"><Check className="size-4 mt-0.5 shrink-0" aria-hidden />{done.undone ? `Αναιρέθηκε. Η τιμή είναι πάλι ${eur(info.web)}.` : `Η τιμή έγινε ${eur(done.value)} (από ${eur(info.web)}). Φαίνεται και στο ιστορικό της «Σύγκρισης τιμών».`}</p>
      {err && <p role="alert" className="m-0 text-eu-red font-semibold text-[length:var(--fs-13)]">{err}</p>}
      {!done.undone && <button type="button" disabled={busy} onClick={undo} className={`${ghost} justify-self-start`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}Αναίρεση</button>}
    </div>
  );

  return (
    <div className="grid gap-2.5" data-help="catalog.price-change">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Τώρα (web)" value={eur(info.web)} sub={info.final < info.web ? `με προσφορά ${eur(info.final)}` : nowMargin != null ? `περιθώριο ${pct(nowMargin).replace("+", "")}` : undefined} />
        <Stat label="Κωτσόβολος" value={info.theirs != null ? eur(info.theirs) : "—"} sub={info.match === "suggested" ? "πρόταση, όχι σίγουρο" : info.match === "variant" ? "άλλο χρώμα" : info.theirs == null ? "χωρίς ζευγάρι" : undefined} />
        <Stat label="Τελευταία αγορά" value={info.cost != null ? eur(info.cost) : "—"} sub={info.cost == null ? "δεν βρέθηκε κόστος" : info.costSource === "supplier-unverified" ? "χωρίς ΦΠΑ · ανεπιβεβαίωτη (τελευταία τιμή προμηθευτή)" : "χωρίς ΦΠΑ"} />
      </div>
      {info.promo && <p className="m-0 inline-flex items-start gap-2 rounded-lg bg-eu-amber/10 px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />Έχει {info.promo}: ο πελάτης βλέπει την τιμή της προσφοράς ({eur(info.final)}), όχι αυτή που γράφεις εδώ.</p>}
      {info.blocked && <p role="alert" className="m-0 rounded-lg bg-eu-surface px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-13)]">Μόνο προβολή: {info.blocked}</p>}
      <label className="grid gap-1">
        <span className="font-semibold text-eu-ink-2 text-[length:var(--fs-13)]">Νέα τιμή web, με ΦΠΑ</span>
        <span className="relative block"><input id="kot-new-price" aria-label="Νέα τιμή web, με ΦΠΑ" autoFocus inputMode="decimal" value={v} onChange={(e) => { setV(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === "Enter" && c?.ok && !info.blocked) save(); }} aria-invalid={c ? !c.ok : undefined} aria-describedby="pc-hint" className="w-full rounded-lg border border-eu-line bg-white px-3 pr-8 min-h-11 tabular-nums text-[length:var(--fs-18)] font-bold focus-visible:outline-2 focus-visible:outline-eu-blue" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-eu-muted">€</span></span>
      </label>
      {info.theirs != null && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setV(fmtIn(Math.round((info.theirs! - 0.1) * 100) / 100))} className="rounded-full border border-eu-navy text-eu-navy font-bold px-3 min-h-11 md:min-h-8 text-[length:var(--fs-12)] hover:bg-eu-navy hover:text-white">Κωτσόβολος −0,10 €</button>
          <button type="button" onClick={() => setV(fmtIn(info.theirs!))} className="rounded-full border border-eu-line text-eu-ink-2 font-bold px-3 min-h-11 md:min-h-8 text-[length:var(--fs-12)] hover:border-eu-navy">Ίδια με Κωτσόβολο</button>
          <button type="button" onClick={() => setV(fmtIn(info.web))} className="rounded-full px-3 min-h-11 md:min-h-8 font-bold text-eu-ink-3 text-[length:var(--fs-12)] hover:text-eu-navy">Επαναφορά</button>
        </div>
      )}
      <div id="pc-hint" aria-live="polite">
        {c && !c.ok && v.trim() !== "" && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{c.error}</p>}
        {c?.ok && (
          <p className={`m-0 flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg px-2.5 py-1.5 font-semibold text-[length:var(--fs-13)] ${c.belowCost ? "bg-eu-red/10 text-eu-red" : c.bigDrop ? "bg-eu-amber/10 text-eu-ink" : "bg-eu-green/10 text-eu-green"}`}>
            <span className="tabular-nums">{c.changeEur > 0 ? "+" : "−"}{eur(Math.abs(c.changeEur))} ({pct(c.changePct)})</span>
            {c.margin != null && <span className="tabular-nums">{c.belowCost ? `κάτω από το κόστος (${pct(c.margin)})` : `περιθώριο ${pct(c.margin).replace("+", "")}`}</span>}
            {vsKot != null && <span className="tabular-nums">{Math.abs(vsKot) < 0.005 ? "ίδια με τον Κωτσόβολο" : `${eur(Math.abs(vsKot))} ${vsKot > 0 ? "πάνω" : "κάτω"} από τον Κωτσόβολο`}</span>}
          </p>
        )}
      </div>
      {err && <p role="alert" className="m-0 text-eu-red font-semibold text-[length:var(--fs-13)]">{err}</p>}
      {arm && needConfirm && <p role="alert" className="m-0 inline-flex items-start gap-2 rounded-lg border border-eu-red/40 bg-eu-red/5 px-2.5 py-2 text-eu-ink text-[length:var(--fs-13)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden />{c?.ok && c.belowCost ? "Η τιμή είναι κάτω από το κόστος αγοράς: θα πουλάμε με ζημιά." : `Μείωση πάνω από 20%.`} Πάτα ξανά για να γραφτεί.</p>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" disabled={!c?.ok || !!info.blocked || busy} onClick={save} className={arm ? `${btn} bg-eu-red text-white hover:bg-eu-red/90` : primary}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden />}{busy ? "Γράφω στο SoftOne…" : arm ? "Ναι, γράψε τη" : "Γράψε στο SoftOne"}</button>
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Γράφεται η τιμή web (SoftOne), περνά αμέσως στο e-shop και μένει στο ιστορικό με «Αναίρεση».</p>
    </div>
  );
}

function Mark({ same }: { same: boolean | null }) {
  if (same === true) return <Check className="size-4 shrink-0 text-eu-green" aria-label="ίδιο" />;
  if (same === false) return <AlertTriangle className="size-4 shrink-0 text-eu-red" aria-label="διαφέρει" />;
  return null;
}

/** Παράθυρο «Έλεγχος Κωτσόβολου»: τα δύο προϊόντα δίπλα-δίπλα, σύνδεσμος στη σελίδα τους, «Ναι, ίδιο» / «Όχι, άλλο». */
export function KotCheckPanel({ productId, onDone }: { productId: string; onDone: (t: Toast) => void }) {
  const router = useRouter();
  const [data, setData] = useState<KotCheck | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => { void kotCheckAction(productId).then((r) => { if (r.ok) setData(r.check); else { setData(null); setErr(r.error); } }); }, [productId]);
  if (data === undefined) return <Loading />;
  if (!data) return <p role="alert" className="m-0 text-eu-red font-semibold text-[length:var(--fs-13)]">{err}</p>;
  const yes = () => start(async () => {
    const r = data.match === "suggested" ? await confirmPairs([productId]).then((x) => (x.ok ? { ok: true as const } : x)) : await setPair(productId, data.theirs.art);
    if (!r.ok) { setErr(r.error); return; }
    onDone({ ok: true, text: "Επιβεβαιώθηκε: είναι ζευγάρι και μετρά στη σύγκριση τιμών." }); router.refresh();
  });
  const no = () => start(async () => {
    const r = await rejectPair(productId);
    if (!r.ok) { setErr(r.error); return; }
    onDone({ ok: true, text: "Απορρίφθηκε: αυτό το είδος του Κωτσόβολου δεν θα ξαναπροταθεί." }); router.refresh();
  });
  const rows: [string, string, string, boolean | null][] = [
    ["Κωδικός", data.ours.code ?? "—", data.theirs.code ?? "—", data.same.code],
    ["EAN", data.ours.ean ?? "—", data.theirs.ean ?? "—", data.same.ean],
    ["Ενεργ. κλάση", data.ours.energy ?? "—", data.theirs.energy ?? "—", data.same.energy],
    ["Τιμή", data.ours.price != null ? eur(data.ours.price) : "—", data.theirs.price != null ? eur(data.theirs.price) : "—", null],
  ];
  return (
    <div className="grid gap-2.5" data-help="catalog.kot-check">
      <p className="m-0 font-semibold text-eu-ink text-[length:var(--fs-14)]">Είναι το ίδιο προϊόν;{data.match === "variant" && <span className="font-normal text-eu-ink-3"> Σήμερα μετρά ως «ίδιο μοντέλο, άλλο χρώμα».</span>}</p>
      {data.note && <p className="m-0 rounded-lg bg-eu-amber/10 px-2.5 py-1.5 text-eu-ink-2 text-[length:var(--fs-13)]">Γιατί ρωτάμε: {data.note}</p>}
      <div className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_minmax(0,1fr)] rounded-lg border border-eu-line text-[length:var(--fs-13)]">
        <div className="contents font-bold text-eu-ink-3 text-[length:var(--fs-12)]"><span className="px-2 py-1.5" /><span className="px-2 py-1.5">Εμείς</span><span className="px-2 py-1.5">Κωτσόβολος</span></div>
        <span className="px-2 py-1.5 text-eu-muted border-t border-eu-line-2">Τίτλος</span><span className="px-2 py-1.5 border-t border-eu-line-2 break-words">{data.ours.title}</span><span className="px-2 py-1.5 border-t border-eu-line-2 break-words">{data.theirs.title}</span>
        {rows.map(([l, a, b, s]) => (
          <div key={l} className="contents">
            <span className="px-2 py-1.5 text-eu-muted border-t border-eu-line-2">{l}</span>
            <span className="px-2 py-1.5 border-t border-eu-line-2 font-mono tabular-nums break-all">{a}</span>
            <span className={`px-2 py-1.5 border-t border-eu-line-2 font-mono tabular-nums break-all inline-flex items-start gap-1 ${s === false ? "text-eu-red font-bold" : ""}`}>{b}<Mark same={s} /></span>
          </div>
        ))}
      </div>
      {!data.theirs.available && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Ο Κωτσόβολος το δείχνει μη διαθέσιμο.</p>}
      {data.theirs.url && <a href={data.theirs.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 justify-self-start min-h-11 md:min-h-8 font-bold text-eu-blue hover:underline text-[length:var(--fs-14)]"><ExternalLink className="size-4" aria-hidden />Άνοιγμα στον Κωτσόβολο <span className="font-normal text-eu-muted text-[length:var(--fs-12)]">(νέα καρτέλα)</span></a>}
      {err && <p role="alert" className="m-0 text-eu-red font-semibold text-[length:var(--fs-13)]">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" disabled={busy} onClick={no} className={`${ghost} text-eu-red hover:border-eu-red`}><X className="size-4" aria-hidden />Όχι, άλλο</button>
        <button type="button" disabled={busy} onClick={yes} className={primary}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}Ναι, ίδιο προϊόν</button>
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">«Ναι» = σίγουρο ζευγάρι, μετρά στη σύγκριση και στη μαζική αλλαγή τιμών. «Όχι» = δεν ξαναπροτείνεται αυτό το είδος.</p>
    </div>
  );
}
