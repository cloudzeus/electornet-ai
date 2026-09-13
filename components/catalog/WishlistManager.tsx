"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart, Plus, Share2, Trash2, Pencil, Bell, BellOff, ShoppingCart, ArrowDownRight, Copy, Check, Star } from "lucide-react";
import type { WishlistView } from "@/lib/wishlist/repo";
import type { Product } from "@/lib/data/types";
import { ProductImage } from "@/components/commerce/ProductImage";
import { useCart } from "@/components/commerce/CartProvider";
import { priceLong } from "@/lib/format";
import { createList, renameList, deleteList, setListVisibility, updateItem, moveItem, removeItem } from "@/app/(shop)/lista/actions";

/**
 * @dynamic Favourites manager for signed-in customers: several lists,
 * price-drop badge (price when saved vs now), stock, notes, priority,
 * per-item alerts, move between lists, share by link, add to cart.
 */
const availabilityLabel = (a: Product["availability"]) => (a.kind === "in-stock" ? "Διαθέσιμο" : a.kind === "days" ? `Σε ${a.min}–${a.max} ημέρες` : a.label ?? "Κατόπιν παραγγελίας");

export function WishlistManager({ lists }: { lists: WishlistView[] }) {
  const { add, toggleWishlist, wishlist } = useCart();
  const [active, setActive] = useState(lists[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const list = lists.find((l) => l.id === active) ?? lists[0];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => { const r = await fn(); setMsg(r.ok ? ok ?? null : r.error ?? "Σφάλμα"); });
  const share = () => { const url = `${location.origin}/lista/k/${list.shareToken}`; navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  const chip = (on: boolean) => `rounded-full px-3 min-h-10 inline-flex items-center gap-1.5 font-bold text-[length:var(--fs-14)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  if (!list) return null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {lists.map((l) => <button key={l.id} type="button" onClick={() => setActive(l.id)} className={chip(l.id === list.id)}><Heart className="size-4" aria-hidden /> {l.name} <span className="opacity-70">{l.items.length}</span></button>)}
        <button type="button" disabled={pending} onClick={() => { const n = prompt("Όνομα νέας λίστας (π.χ. Νέο σπίτι, Γάμος)"); if (n) start(async () => { const r = await createList(n); if (r.ok) setActive(r.id); }); }} className="rounded-full border-2 border-dashed border-eu-line px-3 min-h-10 inline-flex items-center gap-1.5 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue"><Plus className="size-4" aria-hidden /> Νέα λίστα</button>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)]">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] mr-auto">{list.name} <span className="text-eu-muted font-normal">· {list.items.length} προϊόντα</span></h2>
        <button type="button" onClick={() => { const n = prompt("Νέο όνομα", list.name); if (n) run(() => renameList(list.id, n)); }} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold hover:border-eu-navy"><Pencil className="size-4" aria-hidden /> Μετονομασία</button>
        {list.visibility === "link" ? (
          <><button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-3 min-h-10 font-bold hover:bg-eu-blue">{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Αντιγράφηκε" : "Αντιγραφή συνδέσμου"}</button><button type="button" onClick={() => run(() => setListVisibility(list.id, "private"), "Η λίστα είναι πάλι ιδιωτική.")} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold hover:border-eu-navy">Ιδιωτική</button></>
        ) : (
          <button type="button" onClick={() => run(() => setListVisibility(list.id, "link"), "Η λίστα μοιράζεται με σύνδεσμο.")} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold hover:border-eu-navy"><Share2 className="size-4" aria-hidden /> Κοινοποίηση</button>
        )}
        {!list.isDefault && <button type="button" onClick={() => confirm(`Διαγραφή λίστας «${list.name}»;`) && run(async () => { const r = await deleteList(list.id); if (r.ok) setActive(lists[0].id); return r; })} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-eu-red hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>}
      </div>
      {list.items.length === 0 ? (
        <div className="rounded-2xl bg-eu-surface p-8 text-center"><div className="font-bold text-eu-ink text-[length:var(--fs-17)] mb-1">Η λίστα είναι άδεια</div><p className="m-0 text-eu-muted text-[length:var(--fs-15)]">Πάτησε την καρδιά σε ένα προϊόν για να το κρατήσεις εδώ.</p><Link href="/prosfores" className="inline-flex mt-4 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 items-center">Δες τις προσφορές</Link></div>
      ) : (
        <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 gap-3">
          {list.items.map((it) => { const p = it.product; return (
            <li key={it.id} className="rounded-2xl bg-white border border-eu-line p-3 grid grid-cols-[96px_minmax(0,1fr)] gap-3">
              <Link href={p ? `/proion/${p.slug}` : "#"} className="relative size-24 rounded-xl bg-eu-surface overflow-hidden">{p && <ProductImage src={p.image} sizes="96px" className="size-24" />}</Link>
              <div className="min-w-0 grid gap-1.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{p ? <Link href={`/proion/${p.slug}`} className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-snug hover:text-eu-blue line-clamp-2">{p.brand} {p.title}</Link> : <span className="font-bold text-eu-muted">Το προϊόν δεν είναι πλέον διαθέσιμο</span>}</div>
                  <button type="button" onClick={() => run(() => removeItem(it.productId, list.id))} onClickCapture={() => { if (wishlist.includes(it.productId) && lists.filter((l) => l.items.some((x) => x.productId === it.productId)).length === 1) toggleWishlist(it.productId); }} aria-label="Αφαίρεση" className="size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-red/10 hover:text-eu-red shrink-0"><Trash2 className="size-4" aria-hidden /></button>
                </div>
                {p && (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-extrabold text-eu-ink text-[length:var(--fs-17)] tabular-nums">{priceLong(p.price)}</span>
                    {it.drop ? <span className="inline-flex items-center gap-1 rounded-full bg-eu-red/10 text-eu-red font-extrabold text-[length:var(--fs-13)] px-2 py-0.5"><ArrowDownRight className="size-3.5" aria-hidden /> −{priceLong(it.drop)} από όταν το αποθήκευσες</span> : it.priceAtAdd && p.price > it.priceAtAdd ? <span className="text-eu-muted text-[length:var(--fs-13)]">ήταν {priceLong(it.priceAtAdd)} όταν το αποθήκευσες</span> : null}
                    <span className={`text-[length:var(--fs-13)] font-bold ${p.availability.kind === "in-stock" ? "text-eu-green" : "text-eu-amber"}`}>{availabilityLabel(p.availability)}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-13)]">
                  {[0, 1, 2].map((n) => <button key={n} type="button" onClick={() => run(() => updateItem(it.id, { priority: n }))} aria-label={["Κανονικό", "Σημαντικό", "Το θέλω οπωσδήποτε"][n]} aria-pressed={it.priority === n} className={`size-8 rounded-full inline-flex items-center justify-center ${it.priority >= n && it.priority > 0 ? "text-eu-yellow" : "text-eu-line-3"} ${n === 0 ? "hidden" : ""}`}><Star className="size-4" fill={it.priority >= n ? "currentColor" : "none"} aria-hidden /></button>)}
                  <button type="button" onClick={() => run(() => updateItem(it.id, { notifyPriceDrop: !it.notifyPriceDrop }), it.notifyPriceDrop ? "Δεν θα ειδοποιηθείς για πτώση τιμής." : "Θα ειδοποιηθείς αν πέσει η τιμή.")} className={`inline-flex items-center gap-1 rounded-full px-2.5 min-h-8 font-bold ${it.notifyPriceDrop ? "bg-eu-navy/10 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{it.notifyPriceDrop ? <Bell className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />} Πτώση τιμής</button>
                  <button type="button" onClick={() => run(() => updateItem(it.id, { notifyBackInStock: !it.notifyBackInStock }))} className={`inline-flex items-center gap-1 rounded-full px-2.5 min-h-8 font-bold ${it.notifyBackInStock ? "bg-eu-navy/10 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{it.notifyBackInStock ? <Bell className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />} Διαθεσιμότητα</button>
                  {lists.length > 1 && <select value="" onChange={(e) => e.target.value && run(() => moveItem(it.id, e.target.value), "Μεταφέρθηκε.")} aria-label="Μεταφορά σε λίστα" className="rounded-full border border-eu-line px-2 min-h-8 bg-white font-bold"><option value="">Μεταφορά σε…</option>{lists.filter((l) => l.id !== list.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input defaultValue={it.note ?? ""} placeholder="Σημείωση (π.χ. για την κουζίνα)" onBlur={(e) => e.target.value !== (it.note ?? "") && run(() => updateItem(it.id, { note: e.target.value }))} className="flex-1 min-w-[160px] rounded-full border border-eu-line px-3 min-h-9 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" aria-label="Σημείωση" />
                  {p && <button type="button" onClick={() => add(p)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-10 hover:brightness-105"><ShoppingCart className="size-4" aria-hidden /> Στο καλάθι</button>}
                </div>
              </div>
            </li>
          ); })}
        </ul>
      )}
    </div>
  );
}
