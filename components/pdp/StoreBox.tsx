"use client";

import Link from "next/link";
import { Heart, MapPin, Scale, Store as StoreIcon, Truck, ShieldCheck } from "lucide-react";
import type { Product, Store } from "@/lib/data/types";
import { useCart } from "@/components/commerce/CartProvider";
import { compareScope } from "@/lib/data/compare-scope";

/**
 * Το κουτί της σελίδας προϊόντος όταν το προϊόν δεν έχει ακόμη τιμή online
 * (κατάλογος από το ERP, η τιμή του site δεν έχει συνδεθεί): αντί για «αγορά»,
 * ο δρόμος προς το κατάστημα — και ό,τι μπορεί να γίνει ήδη (λίστα, σύγκριση).
 */
export function StoreBox({ product: p, stores }: { product: Product; stores: Store[] }) {
  const { wishlist, toggleWishlist, compare, toggleCompare } = useCart();
  const liked = wishlist.includes(p.id), compared = compare.includes(p.id);
  const pill = "inline-flex items-center justify-center gap-2 rounded-full border-2 font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 transition-colors cursor-pointer";
  return (
    <section aria-label="Διαθεσιμότητα και τιμή" className="rounded-2xl border border-eu-line bg-white shadow-[var(--shadow-card)] p-5 @lg:p-6 grid gap-4">
      <div>
        <div className="font-extrabold text-eu-ink text-[length:var(--fs-27)] leading-tight">Τιμή στο κατάστημα</div>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] leading-snug">Η τιμή και η διαθεσιμότητα αυτού του προϊόντος δίνονται από το κατάστημα Euronics της περιοχής σου — μαζί με δόσεις χωρίς κάρτα, παράδοση και εγκατάσταση.</p>
      </div>
      <Link href="/katastimata" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] py-4 min-h-[56px] inline-flex items-center justify-center gap-2 hover:bg-eu-yellow-dark">
        <MapPin className="size-5" aria-hidden /> Βρες το κοντινότερο κατάστημα
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={liked} onClick={() => toggleWishlist(p.id)} className={`${pill} ${liked ? "border-eu-red text-eu-red" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}><Heart className="size-5" fill={liked ? "currentColor" : "none"} aria-hidden /> {liked ? "Στη λίστα" : "Στη λίστα μου"}</button>
        <button type="button" aria-pressed={compared} onClick={() => toggleCompare(p.id, compareScope(p))} className={`${pill} ${compared ? "border-eu-blue text-eu-blue" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}><Scale className="size-5" aria-hidden /> Σύγκριση</button>
      </div>
      <ul className="m-0 p-0 list-none grid gap-2.5 text-[length:var(--fs-15)] text-eu-ink-2">
        <li className="flex gap-2.5"><StoreIcon className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden /> {stores.length ? `${stores.length}+ καταστήματα σε όλη την Ελλάδα — δες το από κοντά πριν αποφασίσεις` : "Δες το από κοντά στο κατάστημα της περιοχής σου"}</li>
        <li className="flex gap-2.5"><Truck className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden /> Παράδοση, εγκατάσταση και παραλαβή της παλιάς συσκευής από το κατάστημα</li>
        <li className="flex gap-2.5"><ShieldCheck className="size-5 text-eu-blue shrink-0 mt-0.5" aria-hidden /> Επίσημη εγγύηση αντιπροσωπείας</li>
      </ul>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[length:var(--fs-14)] border-t border-eu-line pt-3">
        <dt className="text-eu-muted">Κωδικός</dt><dd className="m-0 text-eu-ink font-semibold break-all">{p.sku}</dd>
        {p.ean && <><dt className="text-eu-muted">Barcode</dt><dd className="m-0 text-eu-ink font-semibold">{p.ean}</dd></>}
      </dl>
    </section>
  );
}
