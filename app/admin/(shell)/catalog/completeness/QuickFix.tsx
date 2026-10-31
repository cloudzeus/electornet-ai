"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, X, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ProductEditor, type EditorSection } from "@/components/admin/catalog/ProductEditor";
import { ProductImages } from "@/components/admin/catalog/ProductImages";
import { PUBLISH_CRITERIA } from "@/lib/catalog/publish-ready";
import { SuggestPanel } from "./SuggestPanel";
import { quickFixAction, recheckProductAction, type QuickFixData } from "./actions";

const LABEL = Object.fromEntries(PUBLISH_CRITERIA.map((c) => [c.key, c.missing])) as Record<string, string>;
const HINT = Object.fromEntries(PUBLISH_CRITERIA.map((c) => [c.key, c.hint])) as Record<string, string>;
/** Κάθε κενό → η ενότητα της φόρμας του προϊόντος που το συμπληρώνει */
const SECTION: Record<string, EditorSection> = { specs: "specs", dims: "dims", avail: "warranty" };

/**
 * «Γρήγορη διόρθωση» στη λίστα πληρότητας: παράθυρο με μόνο τα πεδία που λείπουν (φωτογραφίες, χαρακτηριστικά,
 * διαστάσεις & βάρος, φράση διαθεσιμότητας) — ίδιες φόρμες και αποθήκευση με την καρτέλα προϊόντος. Στο κλείσιμο το
 * προϊόν ξαναμετριέται και η λίστα ανανεώνεται.
 */
export function QuickFix({ productId, title }: { productId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QuickFixData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [checking, startCheck] = useTransition();
  // μετά από «Εισαγωγή» της πρότασης η φόρμα ξαναστήνεται με τις νέες τιμές
  const [ver, setVer] = useState(0);
  const router = useRouter();

  const load = () => startLoad(async () => {
    setErr(null);
    const d = await quickFixAction(productId).catch(() => null);
    if (!d) setErr("Δεν βρέθηκε το προϊόν.");
    setData(d);
    setVer((n) => n + 1);
  });
  const recheck = () => startCheck(async () => {
    const r = await recheckProductAction(productId);
    setData((d) => (d ? { ...d, publishReady: r.publishReady, missing: r.missing } : d));
    router.refresh();
  });
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) load();
    else { recheck(); setData(null); }
  };

  const missing = data?.missing ?? [];
  const sections = [...new Set(missing.map((k) => SECTION[k]).filter(Boolean))];
  const erpOnly = missing.filter((k) => k === "web" || k === "category");

  return (
    <>
      <button type="button" onClick={() => onOpenChange(true)} data-help="completeness.quickfix"
        className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy bg-white px-3 min-h-11 md:min-h-9 font-bold text-[length:var(--fs-13)] cursor-pointer hover:bg-eu-navy hover:text-white">
        <Wrench className="size-4" aria-hidden /> Γρήγορη διόρθωση
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="p-0 gap-0 sm:max-w-[860px] max-w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl text-eu-ink bg-white">
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-eu-line-2 sticky top-0 bg-white z-10">
            <div className="min-w-0">
              <DialogTitle className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)] break-words">{title}</DialogTitle>
              <DialogDescription className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Συμπλήρωσε ό,τι λείπει για να δημοσιευτεί. Τα πεδία γράφονται στο SoftOne και στο e-shop.</DialogDescription>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Κλείσιμο" className="shrink-0 inline-flex items-center justify-center size-11 md:size-9 rounded-full hover:bg-eu-surface cursor-pointer"><X className="size-5" aria-hidden /></button>
          </div>

          <div className="grid gap-4 p-4 min-w-0 @container">
            {loading && !data && <p className="m-0 inline-flex items-center gap-2 text-eu-ink-3"><Loader2 className="size-4 animate-spin" aria-hidden /> Φόρτωση…</p>}
            {err && <p className="m-0 text-eu-red font-bold">{err}</p>}

            {data && (
              <>
                <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
                  {missing.length ? missing.map((k) => <span key={k} className="rounded-full bg-eu-chip text-eu-ink font-bold px-2.5 min-h-8 inline-flex items-center text-[length:var(--fs-13)]">{LABEL[k] ?? k}</span>)
                    : <span className="inline-flex items-center gap-1.5 rounded-full bg-eu-green/10 text-eu-green font-bold px-2.5 min-h-8 text-[length:var(--fs-13)]"><CheckCircle2 className="size-4" aria-hidden /> Πλήρες — δεν λείπει τίποτα</span>}
                  <button type="button" onClick={recheck} disabled={checking} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-11 md:min-h-9 font-bold text-eu-navy text-[length:var(--fs-13)] cursor-pointer hover:border-eu-navy disabled:opacity-60">
                    {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Έλεγχος ξανά
                  </button>
                </div>

                {data.editor && (missing.includes("specs") || missing.includes("dims") || missing.includes("avail")) && (
                  <SuggestPanel productId={data.id} readonly={!!data.editor.readonlyReason} onApplied={() => { load(); recheck(); }} />
                )}

                {missing.includes("photo") && (
                  <section className="grid gap-2 min-w-0" aria-label="Φωτογραφίες">
                    <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Φωτογραφίες</h3>
                    <ProductImages productId={data.id} initial={data.images} canWrite={data.canWrite} canUploadToLibrary={data.canMedia} embedded />
                  </section>
                )}

                {sections.length > 0 && (data.editor
                  ? <ProductEditor key={ver} productId={data.id} only={sections} initial={data.editor.initial} readonly={!!data.editor.readonlyReason} readonlyReason={data.editor.readonlyReason} meta={data.editor.meta} dimCandidates={data.editor.dimCandidates} />
                  : <p className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]">Το προϊόν δεν προέρχεται από το SoftOne — τα στοιχεία του αλλάζουν από την καρτέλα προϊόντος.</p>)}

                {erpOnly.map((k) => (
                  <p key={k} className="m-0 rounded-lg bg-eu-surface px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]">
                    <b className="text-eu-ink">{LABEL[k]}.</b> {HINT[k]} {k === "category" ? "Ορίζεται στο SoftOne ή από την εισαγωγή XML / Excel (αντιστοίχιση κατηγοριών)." : "Αλλάζει στο SoftOne."}
                  </p>
                ))}

                <Link href={`/admin/catalog/${data.id}`} className="inline-flex items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline justify-self-start">
                  Όλη η καρτέλα του προϊόντος <ExternalLink className="size-4" aria-hidden />
                </Link>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
