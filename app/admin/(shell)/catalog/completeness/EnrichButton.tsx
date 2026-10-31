"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EnrichPanel } from "@/components/admin/catalog/EnrichPanel";
import { recheckProductAction } from "./actions";

/**
 * «Στοιχεία από το internet» στη λίστα πληρότητας: Icecat → Channel3 → site κατασκευαστή → άλλα καταστήματα για ένα προϊόν, με
 * φωτογραφίες και χαρακτηριστικά καταστημάτων ως προτάσεις προς έγκριση. Στο κλείσιμο το προϊόν ξαναμετριέται.
 */
export function EnrichButton({ productId, title, canWrite }: { productId: string; title: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) recheckProductAction(productId).then(() => router.refresh()).catch(() => {});
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-help="completeness.enrich"
        className="inline-flex items-center gap-1.5 rounded-full border border-eu-line text-eu-navy bg-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy">
        <Globe className="size-4" aria-hidden /> Από το internet
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-[860px] max-w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl text-eu-ink bg-white">
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-eu-line-2 sticky top-0 bg-white z-10">
            <div className="min-w-0">
              <DialogTitle className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] break-words">{title}</DialogTitle>
              <DialogDescription className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Χαρακτηριστικά και φωτογραφίες από Icecat, το site του κατασκευαστή ή άλλα καταστήματα. Οι φωτογραφίες μπαίνουν μόνο με έγκριση.</DialogDescription>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Κλείσιμο" className="shrink-0 inline-flex items-center justify-center size-11 md:size-9 rounded-full hover:bg-eu-surface cursor-pointer"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="p-4 min-w-0">{open && <EnrichPanel productId={productId} canWrite={canWrite} />}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
