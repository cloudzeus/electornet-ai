import { FolderTree } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { categoryTree } from "@/lib/catalog/category-admin";
import { categoriesWriteEnabled } from "@/lib/softone/category-write";
import { CategoryTree } from "@/components/admin/catalog/CategoryTree";

export const metadata = { title: "Κατηγορίες" };
export const dynamic = "force-dynamic";

/** Το δέντρο κατηγοριών web του SoftOne (κεντρική → κατηγορία → τύπος προϊόντος) με drag & drop, προσθήκη και μετονομασία. */
export default async function CategoriesPage() {
  const user = await requirePermission("catalog.products.read");
  const [tree, writeOn] = await Promise.all([categoryTree(), categoriesWriteEnabled()]);
  const write = can(user.permissions, "catalog.products.write");
  const erpPerm = write && can(user.permissions, "catalog.sync.run");
  const reason = !erpPerm ? "Μόνο ανάγνωση στο SoftOne: χρειάζονται «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Οι αλλαγές κατηγοριών στο SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne → «Αλλαγές κατηγοριών προς SoftOne»)." : null;
  const mains = tree.reduce((a, m) => a + m.children.length, 0), groups = tree.reduce((a, m) => a + m.children.reduce((b, c) => b + c.children.length, 0), 0);
  return (
    <div className="grid gap-2.5 min-w-0">
      <header className="grid min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><FolderTree className="size-5 text-eu-blue" aria-hidden /> Κατηγορίες</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[90ch]">{tree.length} κεντρικές, {mains} κατηγορίες και {groups} τύποι προϊόντος, όπως στο SoftOne. Κάθε αλλαγή (νέα, μετονομασία, ενεργή/ανενεργή, μετακίνηση) γράφεται και στο SoftOne με επαλήθευση· η μετακίνηση ενημερώνει και κάθε είδος της κατηγορίας.</p>
      </header>
      <CategoryTree tree={tree} can={{ write, erp: erpPerm && writeOn, reason }} />
    </div>
  );
}
