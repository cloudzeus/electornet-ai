import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { brandOptions, categoryOptions } from "@/lib/catalog/foreign-import/options";
import { listBatches, writeBlocked } from "@/lib/competitors/bulk";
import { PricingTool } from "@/components/admin/catalog/PricingTool";

export const metadata = { title: "Τιμολόγηση" };
export const dynamic = "force-dynamic";
// οι εγγραφές τρέχουν στο after() των server actions της σελίδας (έως 50 είδη)
export const maxDuration = 300;

/** Τιμολόγηση: τιμή web από το κόστος αγοράς × markup, με πρόταση από τις πωλήσεις· μαζική εγγραφή σε SoftOne και eshop, με αναίρεση. */
export default async function PricingPage() {
  const user = await requirePermission("catalog.products.read");
  const [brands, categories, batches, blocked] = await Promise.all([brandOptions(), categoryOptions(), listBatches(), writeBlocked()]);
  const canRun = can(user.permissions, "catalog.sync.run");
  return (
    <div className="grid gap-5 min-w-0">
      <div className="grid gap-1 min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Τιμολόγηση</h2>
        <p className="m-0 max-w-[70ch] text-eu-ink-2 text-[length:var(--fs-15)]">Βλέπεις πόσο πουλήθηκε τελευταία κάθε προϊόν και πόσο το αγοράσαμε, βάζεις το κέρδος (markup) πάνω στο κόστος και η νέα τιμή γράφεται στο SoftOne και στο eshop. Πριν αλλάξει οτιδήποτε βλέπεις κάθε νέα τιμή.</p>
      </div>
      <PricingTool
        brands={brands.map((b) => ({ id: b.id, name: b.name }))} categories={categories.map((c) => ({ id: c.id, name: c.path }))}
        batches={batches} canRun={canRun} blockedReason={!canRun ? "Η εγγραφή θέλει δικαίωμα συγχρονισμού με το SoftOne." : blocked}
      />
    </div>
  );
}
