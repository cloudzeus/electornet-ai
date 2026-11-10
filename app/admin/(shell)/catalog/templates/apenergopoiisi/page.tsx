import Link from "next/link";
import { ArrowLeft, PowerOff } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { DeactivateWizard } from "@/components/admin/catalog/DeactivateWizard";

export const metadata = { title: "Απενεργοποίηση από Excel" };
export const dynamic = "force-dynamic";

/** Απενεργοποίηση προϊόντων από excel/csv που απαριθμεί είδη: αρχείο → τι βρέθηκε και τι είναι σήμερα κάθε είδος → εκτέλεση («μόνο από το eshop» με Εξαίρεση Web, ή «και από το SoftOne» ως ανενεργό είδος). */
export default async function DeactivatePage() {
  await requirePermission("catalog.products.write");
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates & excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><PowerOff className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Απενεργοποίηση από Excel</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Ανέβασε μια λίστα με τα προϊόντα που πρέπει να φύγουν (π.χ. όσα κατάργησε ο προμηθευτής). Βλέπεις ποιο είδος είναι το καθένα και τι είναι σήμερα, διαλέγεις αν φεύγουν μόνο από το eshop ή και από το SoftOne, και εκτελείς.</p>
      </div>
      <DeactivateWizard />
    </div>
  );
}
