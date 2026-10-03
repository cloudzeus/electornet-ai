import { requirePermission } from "@/lib/rbac/guard";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { ErmisDraft } from "@/components/admin/promos/ErmisDraft";

export const metadata = { title: "Προσφορά με τον Ερμή" };
export const dynamic = "force-dynamic";

export default async function ErmisPromoPage() {
  await requirePermission("catalog.promos.write");
  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="ermis" active="list" title="Περιέγραψε την προσφορά" lead="Γράψε την προσφορά όπως θα τη λέγατε στη σύσκεψη. Ο Ερμής ετοιμάζει τον οδηγό με τα στοιχεία συμπληρωμένα — εσύ ελέγχεις και δημοσιεύεις. Τίποτα δεν δημοσιεύεται αυτόματα." />
      <ErmisDraft />
    </div>
  );
}
