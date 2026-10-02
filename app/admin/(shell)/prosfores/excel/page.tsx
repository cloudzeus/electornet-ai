import { requirePermission } from "@/lib/rbac/guard";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { ExcelImport } from "@/components/admin/promos/ExcelImport";

export const metadata = { title: "Ειδικές τιμές από Excel" };
export const dynamic = "force-dynamic";

export default async function ExcelImportPage() {
  await requirePermission("catalog.promos.write");
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs active="list" title="Ειδικές τιμές από Excel" lead="Ανέβασε .xlsx ή .csv (ή επικόλλησε από το Excel) με δύο στήλες: κωδικός (ή EAN) και τελική τιμή με ΦΠΑ. Βλέπεις προεπισκόπηση με ό,τι δεν ταιριάζει, και η προσφορά δημιουργείται ως πρόχειρη για έλεγχο και δημοσίευση." />
      <ExcelImport />
    </div>
  );
}
