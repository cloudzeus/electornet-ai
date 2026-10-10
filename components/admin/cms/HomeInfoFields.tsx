"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { ExternalLink, Package, Sparkles, Tag, Zap } from "lucide-react";
import { useOptions } from "./brand/BlockEditors";
import { ProductPickerDialog } from "./brand/ProductPicker";
import { DateTime } from "./brand/fields";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";

/** Τι δείχνει σήμερα η αρχική (από τον server): «Προσφορά ημέρας», slides, αυτόματες προσφορές. */
export type HomeLive = { heroDeal: { title: string; image: string | null; manual: boolean } | null; slides: number; autoDeals: number };
export const HomeLiveInfo = createContext<HomeLive>({ heroDeal: null, slides: 0, autoDeals: 0 });
export const HomeProductInfo = createContext<{ info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void }>({ info: {}, onInfo: () => {} });

/** Ενότητα slides: τι δείχνει σήμερα το πλακίδιο «Προσφορά ημέρας» και από πού αλλάζει. */
export function HeroInfoField() {
  const live = useContext(HomeLiveInfo);
  return (
    <div className="grid gap-2 rounded-xl border border-eu-line bg-eu-surface/60 p-3">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Σήμερα στην αρχική</span>
      <span className="text-eu-ink-2 text-[length:var(--fs-14)]">{live.slides ? `${live.slides} ενεργά slides` : "Κανένα ενεργό slide"}</span>
      <div className="flex items-center gap-3">
        <span className="size-12 shrink-0 rounded-lg bg-white border border-eu-line bg-contain bg-center bg-no-repeat" style={live.heroDeal?.image ? { backgroundImage: `url("${live.heroDeal.image.replace(/"/g, "")}")` } : undefined} aria-hidden />
        <span className="grid min-w-0 text-[length:var(--fs-14)]">
          <span className="font-bold text-eu-ink">Προσφορά ημέρας: {live.heroDeal ? live.heroDeal.title : "καμία"}</span>
          <span className="text-eu-muted text-[length:var(--fs-13)]">{live.heroDeal ? (live.heroDeal.manual ? "Ορίστηκε για σήμερα στα Hero slides." : "Αυτόματα: το προϊόν με τη μεγαλύτερη έκπτωση.") : "Δεν υπάρχουν προϊόντα σε έκπτωση· όρισε μία για σήμερα στα Hero slides."}</span>
        </span>
      </div>
      <Link href="/admin/cms/slides" className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue">Slides & Προσφορά ημέρας <ExternalLink className="size-4" aria-hidden /></Link>
    </div>
  );
}

type Deals = { source?: "auto" | "promotion" | "products"; promotionId?: string; productIds?: string[]; endsAt?: string };
const SRC: { v: NonNullable<Deals["source"]>; t: string; d: string; I: typeof Zap }[] = [
  { v: "auto", t: "Αυτόματα", d: "Τα προϊόντα με τη μεγαλύτερη έκπτωση αυτή τη στιγμή. Δεν χρειάζεται τίποτα άλλο.", I: Zap },
  { v: "promotion", t: "Από μια προσφορά", d: "Τα προϊόντα μιας προσφοράς από «Προσφορές & κουπόνια», με τη δική της λήξη.", I: Tag },
  { v: "products", t: "Προϊόντα που διαλέγω", d: "Διαλέγεις εσύ τα προϊόντα και ως πότε φαίνονται.", I: Package },
];

/** «Προσφορές της εβδομάδας»: από πού έρχονται τα προϊόντα — με απλές κάρτες και τον αντίστοιχο έλεγχο. */
export function DealsSourceField({ props, set }: { props: Record<string, unknown> | undefined; set: (patch: Record<string, unknown>) => void }) {
  const live = useContext(HomeLiveInfo);
  const { info, onInfo } = useContext(HomeProductInfo);
  const o = useOptions();
  const [picking, setPicking] = useState(false);
  const d = (props ?? {}) as Deals;
  const src = d.source ?? "auto";
  const ids = d.productIds ?? [];
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("el-GR", { day: "numeric", month: "short" }) : null);
  return (
    <div className="grid gap-3">
      <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Από πού έρχονται τα προϊόντα</span>
      <div role="radiogroup" aria-label="Πηγή προϊόντων" className="grid gap-2">
        {SRC.map((x) => (
          <label key={x.v} className={`flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 min-h-14 cursor-pointer ${src === x.v ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-navy/50"}`}>
            <input type="radio" name="deals-src" checked={src === x.v} onChange={() => set({ source: x.v })} className="mt-1 size-4 accent-eu-navy" />
            <x.I className="size-5 mt-0.5 shrink-0 text-eu-blue" aria-hidden />
            <span className="grid"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{x.t}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{x.d}</span></span>
          </label>
        ))}
      </div>
      {src === "auto" && (
        <p className={`m-0 rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${live.autoDeals ? "bg-eu-green/10 text-eu-ink-2" : "bg-eu-amber/15 text-eu-ink-2"}`}>
          {live.autoDeals ? <>Τώρα βρίσκονται <b>{live.autoDeals}</b> προϊόντα σε έκπτωση· η ενότητα δείχνει τα κορυφαία.</> : <><b>Δεν υπάρχουν προϊόντα σε έκπτωση αυτή τη στιγμή</b>, οπότε η ενότητα δεν εμφανίζεται. Φτιάξε μια προσφορά στο <Link href="/admin/prosfores" className="text-eu-blue underline font-bold">Προσφορές & κουπόνια</Link> ή διάλεξε «Προϊόντα που διαλέγω».</>}
        </p>
      )}
      {src === "promotion" && (
        <label className="grid gap-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Προσφορά</span>
          <select value={d.promotionId ?? ""} onChange={(e) => set({ promotionId: e.target.value || undefined })} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white">
            <option value="">{o ? (o.promos.length ? "Διάλεξε προσφορά…" : "Καμία ενεργή προσφορά") : "Φόρτωση…"}</option>
            {o?.promos.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === "scheduled" ? " · προγραμματισμένη" : ""}{p.endsAt ? ` · έως ${fmt(p.endsAt.toString())}` : ""}</option>)}
          </select>
          <span className="text-eu-muted text-[length:var(--fs-13)]">Νέα προσφορά φτιάχνεις στο <Link href="/admin/prosfores" className="text-eu-blue underline font-bold">Προσφορές & κουπόνια</Link>. Όταν λήξει, η ενότητα δείχνει αυτόματα τις μεγαλύτερες εκπτώσεις.</span>
        </label>
      )}
      {src === "products" && (
        <div className="grid gap-3">
          {ids.length ? (
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {ids.map((id) => { const p = info[id]; return (
                <li key={id} className="flex items-center gap-3 rounded-xl border border-eu-line px-3 py-2">
                  <span className="size-10 shrink-0 rounded-md bg-white border border-eu-line bg-contain bg-center bg-no-repeat" style={p?.image ? { backgroundImage: `url("${p.image.replace(/"/g, "")}")` } : undefined} aria-hidden />
                  <span className="min-w-0 grid text-[length:var(--fs-14)]"><span className="font-bold text-eu-ink truncate">{p?.title ?? id}</span>{p?.price != null && <span className="text-eu-muted">{p.price.toLocaleString("el-GR", { style: "currency", currency: "EUR" })}</span>}</span>
                </li>
              ); })}
            </ul>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Δεν έχεις διαλέξει προϊόντα ακόμη.</p>}
          <button type="button" onClick={() => setPicking(true)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Sparkles className="size-4" aria-hidden /> {ids.length ? "Αλλαγή προϊόντων" : "Διάλεξε προϊόντα"}</button>
          <DateTime label="Λήξη (για την αντίστροφη μέτρηση)" value={d.endsAt} onChange={(v) => set({ endsAt: v })} help="Κενό = την Κυριακή στις 23:59. Μετά τη λήξη η ενότητα δείχνει αυτόματα τις μεγαλύτερες εκπτώσεις." />
          {picking && <ProductPickerDialog brandId={null} brandName="Euronics" selected={ids} max={12} onClose={() => setPicking(false)} onDone={(sel, list) => { onInfo(list); set({ productIds: sel }); setPicking(false); }} />}
        </div>
      )}
    </div>
  );
}
