import Link from "next/link";
import { ArrowLeft, FileUp } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { brandOptions, categoryOptions } from "@/lib/catalog/foreign-import/options";
import { recentForeignJobs } from "@/lib/catalog/foreign-import/server";
import { getSettings } from "@/lib/cms/settings-server";
import { ForeignImportWizard } from "@/components/admin/catalog/ForeignImportWizard";

export const metadata = { title: "Εισαγωγή από άλλο Excel" };
export const dynamic = "force-dynamic";

/** Εισαγωγή προϊόντων από οποιοδήποτε excel/csv (τιμοκατάλογος προμηθευτή): 5 βήματα — αρχείο, στήλες (με ερωτήσεις για όσες δεν αναγνωρίστηκαν), τιμή & τιμές μάρκας/κατηγορίας, προεπισκόπηση και εκτέλεση σε παρτίδες, δημιουργία νέων ειδών & όσα λείπουν από το αρχείο. Γράφει μόνο κενά πεδία. */
export default async function ForeignImportPage() {
  const user = await requirePermission("catalog.products.write");
  const [brands, categories, writeOn, recent, settings] = await Promise.all([brandOptions(), categoryOptions(), itemWriteEnabled(), recentForeignJobs(10), getSettings()]);
  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates & excel</Link>
        <h2 className="m-0 inline-flex items-center gap-2 font-heading font-semibold text-eu-ink text-[length:var(--fs-24)]"><FileUp className="size-6 text-eu-blue" aria-hidden /> Εισαγωγή από άλλο Excel</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Ανέβασε τιμοκατάλογο ή λίστα προϊόντων σε οποιαδήποτε μορφή (.xlsx ή .csv). Ο οδηγός αναγνωρίζει τις στήλες και σε ρωτά για όσες δεν κατάλαβε· διαλέγεις ποιο πεδίο γίνεται κάθε στήλη (ή φτιάχνεις σύνθετο, π.χ. όνομα από Περιγραφή + Μάρκα + Μοντέλο) και βλέπεις αμέσως την κάρτα του eshop. Στα υπάρχοντα είδη συμπληρώνονται μόνο τα κενά· τα νέα τα δημιουργείς στο τελευταίο βήμα, στο SoftOne και στο eshop.</p>
      </div>
      <ForeignImportWizard brands={brands.map(({ id, name, s1 }) => ({ id, name, s1 }))} categories={categories} writeOn={writeOn} canSync={can(user.permissions, "catalog.sync.run")} recent={recent} settings={settings} />
    </div>
  );
}
