"use client";

import Link from "next/link";
import { Heart, LockKeyhole } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Countdown } from "@/components/commerce/Countdown";
import { ProductImage } from "@/components/commerce/ProductImage";
import { useCart } from "./CartProvider";

/**
 * Το μήνυμα που βλέπει ο πελάτης όταν πάει να βάλει στο καλάθι προϊόν καμπάνιας πριν την «έναρξη αγορών»:
 * πότε ανοίγουν οι αγορές (αντίστροφη μέτρηση), το μήνυμα της καμπάνιας, και τι μπορεί να κάνει τώρα (λίστα, σελίδα προσφοράς).
 */
export function CartGateDialog() {
  const { gateNotice, closeGate, wishlist, toggleWishlist } = useCart();
  const n = gateNotice;
  const saved = n ? wishlist.includes(n.product.id) : false;
  return (
    <Dialog open={!!n} onOpenChange={(o) => !o && closeGate()}>
      <DialogContent className="max-w-[min(100vw-2rem,30rem)] p-0 overflow-hidden border-0">
        {n && (
          <div className="grid">
            <div className="eu-gate-head relative isolate overflow-hidden bg-eu-navy text-white p-5 grid gap-3 justify-items-center text-center">
              <span aria-hidden className="eu-spot -z-10" />
              <span className="inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold px-3 py-1 text-[length:var(--fs-13)]"><LockKeyhole className="size-4" aria-hidden />{n.gate.title}</span>
              <DialogTitle className="m-0 font-heading font-extrabold leading-tight text-balance text-[length:var(--fs-24)]">Σχεδόν έτοιμο — οι αγορές ανοίγουν σε</DialogTitle>
              <Countdown endsAt={n.gate.opensAt} variant="blocks" tone="dark" />
            </div>
            <div className="p-5 grid gap-4">
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
                <ProductImage src={n.product.image} alt="" sizes="72px" className="w-[4.5rem]" />
                <span className="grid gap-0.5 min-w-0"><span className="font-extrabold uppercase text-eu-ink text-[length:var(--fs-13)]">{n.product.brand}</span><span className="text-eu-ink-2 leading-snug line-clamp-2 text-[length:var(--fs-14)]">{n.product.title}</span></span>
              </div>
              <DialogDescription className="m-0 text-eu-ink text-[length:var(--fs-16)] leading-relaxed">{n.gate.message}</DialogDescription>
              <div className="grid gap-2">
                <button type="button" onClick={() => { if (!saved) toggleWishlist(n.product.id); }} disabled={saved} className="inline-flex items-center justify-center gap-2 min-h-12 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] disabled:bg-eu-surface disabled:text-eu-green">
                  <Heart className="size-5" aria-hidden />{saved ? "Είναι στη λίστα σου" : "Βάλ’ το στη λίστα μου"}
                </button>
                {n.gate.href && <Link href={n.gate.href} onClick={closeGate} className="inline-flex items-center justify-center min-h-12 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-16)] hover:bg-eu-navy hover:text-white">Δες όλες τις προσφορές</Link>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
