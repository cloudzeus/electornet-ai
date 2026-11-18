"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, DatabaseZap, Loader2, X } from "lucide-react";
import type { PromoDraft } from "@/lib/promo/admin";
import { ProductBrowser } from "./ProductBrowser";
import { CodesUpload } from "./TargetTools";
import { ListMore, ListSearch, visible } from "./ListTools";
import { erpBasketAction, type ErpRow } from "@/app/admin/(shell)/prosfores/actions";

const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/**
 * Το καλάθι μιας προσφοράς «Διαγραμμένες τιμές SoftOne». Οι τιμές δεν γράφονται εδώ: «Αρχική Τιμή Web» (διαγραμμένη) και
 * «Τιμή Web» έρχονται από το SoftOne. Εδώ μόνο μαζεύονται τα προϊόντα — όλα όσα έχουν αρχική τιμή με ένα πάτημα, από
 * λίστα κωδικών ή ένα-ένα από τον κατάλογο. Προϊόν χωρίς αρχική τιμή σημαδεύεται: δεν θα δείξει έκπτωση.
 */
export function ErpBasket({ d, set, setNames }: { d: PromoDraft; set: (p: Partial<PromoDraft>) => void; setNames: (f: (n: Record<string, string>) => Record<string, string>) => void }) {
  const ids = d.targets.filter((t) => t.kind === "product" && !t.exclude).map((t) => t.refId);
  const key = ids.join(",");
  const [rows, setRows] = useState<ErpRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  useEffect(() => {
    if (!key) return;
    let on = true;
    void erpBasketAction(key.split(",")).then((r) => { if (on) setRows(r); }).catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, [key]);

  const add = (items: { id: string; title: string; sku: string }[]) => {
    setNames((n) => ({ ...n, ...Object.fromEntries(items.map((p) => [p.id, `${p.title} · ${p.sku}`])) }));
    const have = new Set(ids);
    set({ targets: [...d.targets, ...items.filter((p) => !have.has(p.id)).map((p) => ({ kind: "product" as const, refId: p.id, exclude: false }))].slice(0, 2000) });
  };
  const remove = (id: string) => set({ targets: d.targets.filter((t) => t.refId !== id) });
  const all = () => start(async () => {
    const r = await erpBasketAction("all");
    add(r);
    setMsg(r.length ? `Στο SoftOne ${r.length === 1 ? "1 προϊόν έχει" : `${r.length} προϊόντα έχουν`} αρχική τιμή μεγαλύτερη από την τιμή web. Μπήκαν όλα στο καλάθι.` : "Κανένα προϊόν δεν έχει αρχική τιμή στο SoftOne αυτή τη στιγμή.");
  });
  const list = key ? rows ?? [] : [];
  const [q, setQ] = useState("");
  const [wide, setWide] = useState(false);
  const view = visible(list, (r) => `${r.title} ${r.sku}`, q, wide);
  const missing = list.filter((r) => r.initial == null || r.price == null || r.initial <= r.price).length;

  return (
    <div className="grid gap-4">
      <section data-help="promo.erp-add" className="rounded-2xl border border-eu-line bg-white p-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="grid min-w-0 flex-1 basis-64">
            <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)]">Ο πιο γρήγορος τρόπος</span>
            <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Βάλε με ένα πάτημα όλα τα προϊόντα που έχουν σήμερα «Αρχική Τιμή Web» στο SoftOne. Μετά βγάζεις όσα δεν θέλεις.</span>
          </span>
          <button type="button" disabled={busy} onClick={all} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50 cursor-pointer">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <DatabaseZap className="size-4" aria-hidden />}Όλα όσα έχουν αρχική τιμή</button>
        </div>
        {msg && <p role="status" className="m-0 rounded-xl bg-eu-chip text-eu-navy font-semibold px-3 py-2 text-[length:var(--fs-14)]">{msg}</p>}
      </section>

      <section data-help="promo.erp-table" className="rounded-2xl border border-eu-line bg-white @container" aria-label="Το καλάθι της προσφοράς">
        <h4 className="m-0 px-4 py-3 font-extrabold text-eu-ink text-[length:var(--fs-15)]">Το καλάθι της προσφοράς <span className="font-normal text-eu-muted tabular-nums">{ids.length}</span></h4>
        {key && rows === null ? <p className="m-0 px-4 pb-4 inline-flex items-center gap-2 text-eu-muted text-[length:var(--fs-14)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Φέρνω τιμές…</p>
          : !list.length ? <p className="m-0 px-4 pb-4 text-eu-ink-3 text-[length:var(--fs-14)]">Άδειο. Πάτα «Όλα όσα έχουν αρχική τιμή» ή πρόσθεσε προϊόντα από κάτω.</p> : (
          <>
            <ListSearch q={q} onQ={setQ} total={list.length} />
            <div aria-hidden className="hidden @3xl:grid grid-cols-[minmax(0,1fr)_8rem_7rem_5rem_2.75rem] gap-x-3 px-4 py-2 bg-eu-surface/60 text-eu-muted font-bold text-[length:var(--fs-12)]"><span>Προϊόν</span><span className="text-right">Αρχική τιμή (SoftOne)</span><span className="text-right">Τιμή web</span><span className="text-right">Έκπτωση</span><span /></div>
            <ul className="m-0 p-0 list-none divide-y divide-eu-line border-t border-eu-line">
              {view.shown.map((r) => {
                const ok = r.initial != null && r.price != null && r.initial > r.price;
                return (
                  <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_2.75rem] @3xl:grid-cols-[minmax(0,1fr)_8rem_7rem_5rem_2.75rem] items-center gap-x-3 gap-y-1 px-4 py-2">
                    <span className="grid min-w-0"><span className="font-semibold text-eu-ink text-[length:var(--fs-14)] line-clamp-2">{r.title}</span><span className="font-mono text-eu-muted text-[length:var(--fs-12)] truncate">{r.sku}</span></span>
                    <button type="button" aria-label={`Αφαίρεση ${r.title}`} onClick={() => remove(r.id)} className="@3xl:order-last size-11 grid place-items-center rounded-full text-eu-ink-3 hover:bg-eu-surface cursor-pointer"><X className="size-4" aria-hidden /></button>
                    <span className="col-span-2 @3xl:col-span-1 @3xl:contents grid grid-cols-3 items-center gap-x-3 tabular-nums text-[length:var(--fs-14)]">
                      <span className="@3xl:text-right">{ok ? <s className="text-eu-ink-3">{eur(r.initial!)}</s> : <span className="text-eu-amber font-bold">λείπει</span>}</span>
                      <span className="text-right font-bold text-eu-ink">{r.price != null ? eur(r.price) : "—"}</span>
                      <span className={`text-right font-bold ${ok ? "text-eu-red" : "text-eu-amber"}`}>{ok ? `−${Math.round(((r.initial! - r.price!) / r.initial!) * 100)} %` : "—"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <ListMore shown={view.shown.length} found={view.found.length} total={list.length} all={wide} onAll={setWide} q={q} />
          </>
        )}
        {missing > 0 && (
          <p className="m-0 mx-4 mb-4 mt-2 flex items-start gap-2 rounded-xl bg-eu-amber/15 px-3 py-2 text-eu-ink text-[length:var(--fs-14)]"><AlertTriangle className="size-4 mt-0.5 shrink-0 text-eu-amber" aria-hidden />
            <span><b>{missing === 1 ? "1 προϊόν δεν έχει" : `${missing} προϊόντα δεν έχουν`} «Αρχική Τιμή Web» μεγαλύτερη από την τιμή web στο SoftOne.</b> Δεν θα {missing === 1 ? "φαίνεται" : "φαίνονται"} στην προσφορά μέχρι να συμπληρωθεί εκεί· το eshop την παίρνει μέσα σε 10 λεπτά.</span></p>
        )}
      </section>

      <details className="rounded-2xl border border-eu-line bg-white p-4">
        <summary className="cursor-pointer font-extrabold text-eu-ink text-[length:var(--fs-15)] min-h-11 md:min-h-8 inline-flex items-center">Προσθήκη από λίστα κωδικών (Excel)</summary>
        <div className="pt-3"><CodesUpload exclude={false} onAdd={add} /></div>
      </details>

      <details className="rounded-2xl border border-eu-line bg-white p-4">
        <summary className="cursor-pointer font-extrabold text-eu-ink text-[length:var(--fs-15)] min-h-11 md:min-h-8 inline-flex items-center">Προσθήκη προϊόντων από τον κατάλογο</summary>
        <div className="pt-3"><ProductBrowser mode="products" selected={new Set(ids)} onProduct={(p) => (ids.includes(p.id) ? remove(p.id) : add([p]))} /></div>
      </details>
    </div>
  );
}
