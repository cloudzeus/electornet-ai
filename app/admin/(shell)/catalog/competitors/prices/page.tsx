import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { filterOptions, listBatches, previewBulk, writeBlocked, type Filter } from "@/lib/competitors/bulk";
import { DEFAULT_RULE, MAX_BATCH } from "@/lib/competitors/bulk-core";
import { BulkPrices } from "@/components/admin/competitors/BulkPrices";

export const metadata = { title: "Μαζική αλλαγή τιμών" };
export const dynamic = "force-dynamic";

/** Μαζική αλλαγή τιμής web με βάση τον Κωτσόβολο: φίλτρα, κανόνας, δικλείδες, προεπισκόπηση, εφαρμογή, αναίρεση. */
export default async function BulkPricesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("catalog.products.read");
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && sp.product.length < 64 ? sp.product : undefined;
  // από τη σελίδα προϊόντος: μόνο αυτό, ακόμη κι αν δεν είμαστε ακριβότεροι
  const filter: Filter = { productId, onlyExpensive: !productId };
  const [rows, options, batches, blocked, product] = await Promise.all([
    previewBulk(filter, DEFAULT_RULE),
    filterOptions(),
    listBatches(),
    writeBlocked(),
    productId ? db.product.findUnique({ where: { id: productId }, select: { id: true, title: true } }) : null,
  ]);
  const canRun = can(user.permissions, "catalog.sync.run");
  const reason = !canRun ? "Η εφαρμογή θέλει δικαίωμα συγχρονισμού με το SoftOne." : blocked;

  return (
    <div className="grid gap-5 min-w-0">
      <div className="grid gap-1 min-w-0">
        <Link href="/admin/catalog/competitors" className="inline-flex w-fit items-center gap-1.5 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Σύγκριση τιμών</Link>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Μαζική αλλαγή τιμών</h2>
        <p className="m-0 max-w-[70ch] text-eu-ink-2 text-[length:var(--fs-15)]">Διάλεξε ποια προϊόντα θέλεις και πόσο κάτω από τον Κωτσόβολο να πάνε. Πριν αλλάξει οτιδήποτε βλέπεις κάθε νέα τιμή.</p>
      </div>
      <BulkPrices initialRows={rows} initialFilter={filter} product={product} options={options} batches={batches} blockedReason={reason} canRun={canRun} maxBatch={MAX_BATCH} />
    </div>
  );
}
