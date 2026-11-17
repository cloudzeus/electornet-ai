import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { missingOverview } from "@/lib/catalog/dims-missing";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { hasEprelKey } from "@/lib/eprel/client";
import { DimsMissingTool } from "@/components/admin/catalog/DimsMissingTool";

export const metadata = { title: "Διαστάσεις και βάρος που λείπουν" };
export const dynamic = "force-dynamic";
// οι παρτίδες αναζήτησης (EPREL, internet) και αποθήκευσης τρέχουν σε server actions της σελίδας
export const maxDuration = 300;

/** Τα ενεργά προϊόντα χωρίς διαστάσεις ή βάρος και η μαζική συμπλήρωσή τους από χαρακτηριστικά, EPREL και site κατασκευαστών. */
export default async function DimsMissingPage() {
  const user = await requirePermission("catalog.products.read");
  const [overview, s1On] = await Promise.all([missingOverview(), itemWriteEnabled()]);
  return (
    <div className="grid gap-5 min-w-0">
      <div className="grid gap-1 min-w-0">
        <Link href="/admin/catalog/completeness" className="inline-flex items-center gap-1.5 min-h-11 w-fit font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Πληρότητα</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Διαστάσεις και βάρος που λείπουν</h2>
        <p className="m-0 max-w-[72ch] text-eu-ink-2 text-[length:var(--fs-15)]">Χωρίς διαστάσεις και βάρος δεν υπολογίζεται σωστά η αποστολή ενός προϊόντος. Εδώ βλέπεις ποια προϊόντα του eshop τα έχουν κενά, το εργαλείο ψάχνει τις τιμές σε τρία βήματα και εσύ αποθηκεύεις όσες εγκρίνεις.</p>
      </div>
      <DimsMissingTool overview={overview} canWrite={can(user.permissions, "catalog.products.write")} s1On={s1On} eprelKey={hasEprelKey()} />
    </div>
  );
}
