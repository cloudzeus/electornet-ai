"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, CircleAlert, CircleCheck, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import type { PromoDraft } from "@/lib/promo/admin";
import { ProductBrowser } from "./ProductBrowser";
import { ListMore, ListSearch, visible } from "./ListTools";
import { previewPricesAction, targetPricesAction, type PriceRow } from "@/app/admin/(shell)/prosfores/actions";

const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const toCents = (s: string) => { const v = Number(s.replace(/[€\s]/g, "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0; };
const btn = "inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer disabled:opacity-50";
const TEMPLATE = `data:text/csv;charset=utf-8,${encodeURIComponent("﻿Κωδικός;Τιμή προσφοράς\n55C46LA;1199\n")}`;
/** Αρχή του μηνύματος που στέλνει το previewPricesAction όταν η τιμή του αρχείου είναι ήδη η τιμή του eshop. */
const ERP_ISSUE = "είναι ήδη σε τιμή προσφοράς";

/**
 * «Τιμή πριν → τιμή προσφοράς»: ένας πίνακας με κάθε προϊόν, την τιμή πριν (η τρέχουσα του eshop — δεν γράφεται με το χέρι),
 * την τιμή προσφοράς και την έκπτωση που βγαίνει. Τα προϊόντα μπαίνουν από Excel (κωδικός + τιμή προσφοράς) ή από τον κατάλογο.
 */
export function SpecialPrices({ d, setReward, names, setNames, toErp }: { d: PromoDraft; setReward: (p: Partial<PromoDraft["reward"]>) => void; names: Record<string, string>; setNames: (f: (n: Record<string, string>) => Record<string, string>) => void; /** αλλάζει τον τύπο της προσφοράς σε «Διαγραμμένες τιμές SoftOne» */ toErp: () => void }) {
  const prices = d.reward.price ?? {};
  const ids = Object.keys(prices);
  const [list, setList] = useState<Record<string, number | null>>({});
  const [res, setRes] = useState<{ added: number; bad: PriceRow[]; notes: PriceRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  // τιμή πριν = τρέχουσα τιμή eshop, για όσα προϊόντα δεν την έχουμε ήδη
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const view = visible(ids, (id) => names[id] ?? id, q, all);
  const missing = ids.filter((id) => !(id in list)).join(",");
  useEffect(() => {
    if (!missing) return;
    let on = true;
    void targetPricesAction(missing.split(",")).then((rows) => { if (on) setList((l) => ({ ...l, ...Object.fromEntries(missing.split(",").map((id) => [id, null])), ...Object.fromEntries(rows.map((r) => [r.id, r.price != null ? Math.round(r.price * 100) : null])) })); });
    return () => { on = false; };
  }, [missing]);

  // όσες γραμμές έχουν ήδη την τιμή του αρχείου στο eshop δεν διορθώνονται στο αρχείο — θέλουν άλλο τύπο προσφοράς
  const erpBad = res?.bad.filter((x) => x.issue?.startsWith(ERP_ISSUE)) ?? [];
  const otherBad = res?.bad.filter((x) => !x.issue?.startsWith(ERP_ISSUE)) ?? [];

  const remove = (id: string) => { const { [id]: _x, ...rest } = prices; void _x; setReward({ price: rest }); };
  const upload = (form: FormData) => start(async () => {
    setErr(null); setRes(null);
    const r = await previewPricesAction(form);
    if (!r.ok) { setErr(r.error); return; }
    // μπαίνουν όσες γραμμές βρέθηκαν με έγκυρη χαμηλότερη τιμή· έκπτωση πάνω από το όριο μπαίνει και κόβεται στον έλεγχο
    const good = r.rows.filter((x) => x.productId && x.price && (!x.issue || x.issue.startsWith("έκπτωση")));
    setNames((n) => ({ ...n, ...Object.fromEntries(good.map((x) => [x.productId!, `${x.title} · ${x.sku}`])) }));
    setList((l) => ({ ...l, ...Object.fromEntries(good.map((x) => [x.productId!, x.list])) }));
    setReward({ price: { ...prices, ...Object.fromEntries(good.map((x) => [x.productId!, x.price!])) } });
    setRes({ added: good.length, bad: r.rows.filter((x) => !good.includes(x)), notes: good.filter((x) => x.note) });
  });

  return (
    <div className="grid gap-4">
      <section data-help="promo.prices-excel" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3" aria-label="Προϊόντα και τιμές από Excel">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="grid min-w-0 flex-1 basis-64">
            <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4 text-eu-green" aria-hidden /> Ανέβασε Excel με προϊόντα και τιμές</span>
            <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Δύο στήλες: κωδικός (SKU, EAN ή κωδικός SoftOne) και τιμή προσφοράς με ΦΠΑ. Όσα υπάρχουν ήδη στη λίστα παίρνουν τη νέα τιμή.</span>
          </span>
          <input ref={file} type="file" accept=".xlsx,.csv,.txt" className="sr-only" aria-label="Αρχείο προϊόντων και τιμών" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const fd = new FormData(); fd.set("file", f); upload(fd); e.target.value = ""; }} />
          <button type="button" disabled={busy} onClick={() => file.current?.click()} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}{busy ? "Διαβάζω…" : "Ανέβασμα Excel"}</button>
          <a href={TEMPLATE} download="protypo-timon-prosforas.csv" className={`${btn} border border-eu-line bg-white text-eu-ink-2 hover:border-eu-navy`}><Download className="size-4" aria-hidden /> Πρότυπο</a>
        </div>
        <details>
          <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-8 inline-flex items-center">ή επικόλλησε από το Excel</summary>
          <div className="grid gap-2 pt-1">
            <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Κωδικός και τιμή προσφοράς, μία γραμμή ανά προϊόν" placeholder={"Κωδικός\tΤιμή προσφοράς\n55C46LA\t1199"} className="w-full rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-15)] bg-white font-mono" />
            <button type="button" disabled={busy || !paste.trim()} onClick={() => { const fd = new FormData(); fd.set("paste", paste); upload(fd); }} className={`${btn} justify-self-start border-2 border-eu-navy text-eu-navy hover:bg-eu-chip`}>Προσθήκη γραμμών</button>
          </div>
        </details>
        {err && <p role="alert" className="m-0 flex items-start gap-2 rounded-xl bg-eu-red/10 px-3 py-2 text-eu-red font-bold text-[length:var(--fs-14)]"><CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />{err}</p>}
        {res && (
          <div role="status" className="grid gap-2">
            <p className={`m-0 flex items-start gap-2 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-14)] ${res.added ? "bg-eu-green/10 text-eu-green" : "bg-eu-amber/15 text-eu-ink"}`}>
              {res.added ? <CircleCheck className="size-4 mt-0.5 shrink-0" aria-hidden /> : <CircleAlert className="size-4 mt-0.5 shrink-0" aria-hidden />}
              {res.added ? `${res.added === 1 ? "Μπήκε 1 προϊόν" : `Μπήκαν ${res.added} προϊόντα`} με την τιμή προσφοράς του αρχείου. Πάτα «Αποθήκευση» για να κρατηθούν.` : "Καμία γραμμή του αρχείου δεν μπήκε."}
            </p>
            {erpBad.length > 0 && (
              <div className="rounded-xl bg-eu-amber/15 px-3 py-2 grid gap-2">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{erpBad.length === 1 ? "1 προϊόν έχει ήδη στο eshop την τιμή του αρχείου" : `${erpBad.length} προϊόντα έχουν ήδη στο eshop την τιμή του αρχείου`}</span>
                <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]">Η έκπτωση έχει γίνει στο SoftOne: ο συγχρονισμός κατέβασε μόνος του την «Τιμή Web», άρα η τιμή του αρχείου είναι η τιμή που πληρώνει ήδη ο πελάτης και δεν είναι έκπτωση. Αυτός ο τύπος προσφοράς θέλει τιμή χαμηλότερη από την τρέχουσα — γι’ αυτό δεν μπήκαν. Το αρχείο δεν έχει λάθος, μην το διορθώσεις.</p>
                <p className="m-0 text-eu-ink-2 text-[length:var(--fs-13)]">Για να δει ο πελάτης διαγραμμένη τιμή, άλλαξε τον τύπο της προσφοράς. Οι «Διαγραμμένες τιμές SoftOne» παίρνουν μόνες τους την «Αρχική Τιμή Web» του SoftOne ως διαγραμμένη — χωρίς αρχείο. Τα προϊόντα που έχεις βάλει μένουν.</p>
                <button type="button" onClick={toErp} className={`${btn} justify-self-start bg-eu-navy text-white hover:bg-eu-blue`}><ArrowRightLeft className="size-4" aria-hidden /> Άλλαξε σε «Διαγραμμένες τιμές SoftOne»</button>
                <details>
                  <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 md:min-h-8 inline-flex items-center">Ποια προϊόντα</summary>
                  <ul className="m-0 pl-4 text-eu-ink-2 text-[length:var(--fs-13)] break-words">{erpBad.slice(0, 30).map((x, i) => <li key={i}>{x.input}{x.title ? ` · ${x.title}` : ""} — {eur(x.price ?? 0)}</li>)}</ul>
                  {erpBad.length > 30 && <span className="text-eu-muted text-[length:var(--fs-13)]">και άλλα {erpBad.length - 30}</span>}
                </details>
              </div>
            )}
            {otherBad.length > 0 && <Rows tone="bad" title={otherBad.length === 1 ? "1 γραμμή δεν μπήκε — διόρθωσέ τη στο αρχείο και ανέβασέ το ξανά:" : `${otherBad.length} γραμμές δεν μπήκαν — διόρθωσέ τες στο αρχείο και ανέβασέ το ξανά:`} rows={otherBad.map((x) => `${x.input}: ${x.issue ?? "μη έγκυρη τιμή"}`)} />}
            {res.notes.length > 0 && <Rows tone="warn" title="Η «τιμή πριν» του αρχείου διαφέρει από το eshop. Ο πελάτης βλέπει την τιμή του eshop:" rows={res.notes.map((x) => `${x.input}: ${x.note}`)} />}
          </div>
        )}
      </section>

      <section data-help="promo.prices-table" className="rounded-2xl border border-eu-line bg-white @container" aria-label="Προϊόντα της προσφοράς με τιμές">
        <h4 className="m-0 px-4 py-3 font-extrabold text-eu-ink text-[length:var(--fs-15)]">Προϊόντα της προσφοράς <span className="font-normal text-eu-muted tabular-nums">{ids.length}</span></h4>
        {ids.length === 0 ? <p className="m-0 px-4 pb-4 text-eu-ink-3 text-[length:var(--fs-14)]">Κανένα ακόμη. Ανέβασε το Excel από πάνω ή διάλεξε προϊόντα από τον κατάλογο από κάτω.</p> : (
          <>
            <ListSearch q={q} onQ={setQ} total={ids.length} />
            <div aria-hidden className="hidden @3xl:grid grid-cols-[minmax(0,1fr)_7rem_9rem_5rem_2.75rem] gap-x-3 px-4 py-2 bg-eu-surface/60 text-eu-muted font-bold text-[length:var(--fs-12)]"><span>Προϊόν</span><span className="text-right">Τιμή πριν</span><span className="text-right">Τιμή προσφοράς</span><span className="text-right">Έκπτωση</span><span /></div>
            <ul className="m-0 p-0 list-none divide-y divide-eu-line border-t border-eu-line">
              {view.shown.map((id) => {
                const c = prices[id], was = list[id] ?? null;
                const pct = c && was ? Math.round(((was - c) / was) * 100) : null;
                const bad = !!c && was != null && c >= was;
                return (
                  <li key={id} className="grid grid-cols-[minmax(0,1fr)_2.75rem] @3xl:grid-cols-[minmax(0,1fr)_7rem_9rem_5rem_2.75rem] items-center gap-x-3 gap-y-1.5 px-4 py-2">
                    <span className="min-w-0 font-semibold text-eu-ink text-[length:var(--fs-14)] line-clamp-2">{names[id] ?? id}</span>
                    <button type="button" aria-label={`Αφαίρεση ${names[id] ?? id}`} onClick={() => remove(id)} className="@3xl:order-last size-11 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface cursor-pointer"><X className="size-4" aria-hidden /></button>
                    <span className="col-span-2 @3xl:col-span-1 @3xl:contents grid grid-cols-[1fr_9rem_4rem] items-center gap-x-3 tabular-nums text-[length:var(--fs-14)]">
                      <span className="@3xl:text-right text-eu-ink-3"><span className="@3xl:hidden text-eu-muted text-[length:var(--fs-12)]">Πριν </span>{was != null ? <s>{eur(was)}</s> : id in list ? "χωρίς τιμή" : "…"}</span>
                      <input key={`${id}:${c}`} aria-label={`Τιμή προσφοράς σε €: ${names[id] ?? id}`} inputMode="decimal" defaultValue={c ? String(c / 100).replace(".", ",") : ""} placeholder="€" onBlur={(e) => { const v = toCents(e.target.value); if (v !== c) setReward({ price: { ...prices, [id]: v } }); }}
                        className={`w-full rounded-xl border-2 px-3 min-h-11 text-right font-bold bg-white outline-none focus-visible:border-eu-blue ${!c || bad ? "border-eu-red/60" : "border-eu-line"}`} />
                      <span className={`text-right font-bold ${bad || !c ? "text-eu-red" : "text-eu-green"}`}>{!c ? "λείπει" : bad ? "όχι φθηνότερο" : pct != null ? `−${pct} %` : "—"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <ListMore shown={view.shown.length} found={view.found.length} total={ids.length} all={all} onAll={setAll} q={q} />
          </>
        )}
      </section>

      <details className="rounded-2xl border border-eu-line bg-white p-4" open={ids.length === 0}>
        <summary className="cursor-pointer font-extrabold text-eu-ink text-[length:var(--fs-15)] min-h-11 md:min-h-8 inline-flex items-center">Προσθήκη προϊόντων από τον κατάλογο</summary>
        <div className="pt-3">
          <ProductBrowser mode="products" selected={new Set(ids)} onProduct={(p) => {
            setNames((n) => ({ ...n, [p.id]: `${p.title} · ${p.sku}` })); setList((l) => ({ ...l, [p.id]: p.price != null ? Math.round(p.price * 100) : null }));
            if (p.id in prices) remove(p.id); else setReward({ price: { ...prices, [p.id]: 0 } });
          }} />
        </div>
      </details>
    </div>
  );
}

function Rows({ tone, title, rows }: { tone: "bad" | "warn"; title: string; rows: string[] }) {
  return (
    <div className={`rounded-xl px-3 py-2 grid gap-1 ${tone === "bad" ? "bg-eu-red/10" : "bg-eu-amber/15"}`}>
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{title}</span>
      <ul className="m-0 pl-4 text-eu-ink-2 text-[length:var(--fs-13)] break-words">{rows.slice(0, 30).map((r, i) => <li key={i}>{r}</li>)}</ul>
      {rows.length > 30 && <span className="text-eu-muted text-[length:var(--fs-13)]">και άλλες {rows.length - 30}</span>}
    </div>
  );
}
