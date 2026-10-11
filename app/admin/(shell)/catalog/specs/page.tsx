import { ListChecks } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { specGroup, specTree } from "@/lib/catalog/spec-admin";
import { specWriteEnabled } from "@/lib/softone/spec-write";
import { SpecManager } from "@/components/admin/catalog/SpecManager";

export const metadata = { title: "Χαρακτηριστικά" };
export const dynamic = "force-dynamic";

/** Χαρακτηριστικά & ομάδες χαρακτηριστικών ανά τύπο προϊόντος, όπως στο SoftOne, με αλλαγές μόνο e-shop ή και στο SoftOne. */
export default async function SpecsPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { g } = await searchParams;
  const id = Number(g);
  const [tree, group, writeOn] = await Promise.all([specTree(), Number.isInteger(id) && id > 0 ? specGroup(id) : null, specWriteEnabled()]);
  const local = can(user.permissions, "catalog.products.write");
  const erp = local && can(user.permissions, "catalog.sync.run");
  const softoneReason = !erp ? "Μόνο ανάγνωση στο SoftOne: χρειάζονται «Επεξεργασία προϊόντων» και «Εκτέλεση συγχρονισμού ERP»." : !writeOn ? "Οι αλλαγές στο SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne → Αλλαγές χαρακτηριστικών)." : null;
  const groups = tree.reduce((a, m) => a + m.mains.reduce((b, x) => b + x.groups.length, 0), 0);
  return (
    <div className="grid gap-2.5 min-w-0">
      <header className="grid min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><ListChecks className="size-5 text-eu-blue" aria-hidden /> Χαρακτηριστικά</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{groups} τύποι προϊόντων με τα χαρακτηριστικά και τα φίλτρα τους, όπως στο SoftOne (ομάδες χαρακτηριστικών). Αλλαγές μόνο για το e-shop ή και στο SoftOne.</p>
      </header>
      <SpecManager tree={tree} group={group} can={{ local, softone: erp && writeOn, softoneReason }} />
    </div>
  );
}
