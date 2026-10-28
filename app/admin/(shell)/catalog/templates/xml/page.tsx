import Link from "next/link";
import { ArrowLeft, FileCode2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { brandOptions, categoryOptions, markOptions, unitOptions } from "@/lib/catalog/foreign-import/options";
import { listSuppliers } from "@/lib/catalog/xml-import/suppliers";
import { db } from "@/lib/db";
import { XmlImportWizard } from "@/components/admin/catalog/xml/XmlImportWizard";
import type { SupplierCard } from "@/lib/catalog/xml-import/ui-core";

export const metadata = { title: "XML προμηθευτές" };
export const dynamic = "force-dynamic";

/**
 * Μαζική εισαγωγή προϊόντων από XML feed προμηθευτή: προμηθευτής → feed → αντιστοίχιση σε χωριστά βήματα (στήλες,
 * μάρκες, κατηγορίες, χαρακτηριστικά, τιμές & ERP — με προτάσεις AI μόνο για τα αβέβαια) → λίστα ελέγχου και εισαγωγή. Στα υπάρχοντα είδη συμπληρώνονται ΜΟΝΟ τα κενά· τα νέα είδη πάνε
 * για έγκριση. Οι φωτογραφίες κατεβαίνουν και ανεβαίνουν στη βιβλιοθήκη με τη σειρά που ορίζει ο χρήστης.
 */
export default async function XmlImportPage() {
  const user = await requirePermission("catalog.products.write");
  const [suppliers, brands, categories, units, marks, writeOn] = await Promise.all([
    listSuppliers(""),
    brandOptions(),
    categoryOptions(),
    unitOptions(),
    markOptions(),
    itemWriteEnabled(),
  ]);
  const feedIds = suppliers.map((s) => s.feed?.id).filter((v): v is string => !!v);
  const counts = feedIds.length
    ? await db.supplierFeedItem.groupBy({ by: ["feedId"], where: { feedId: { in: feedIds } }, _count: { _all: true } })
    : [];
  const byFeed = new Map(counts.map((c) => [c.feedId, c._count._all]));
  // Πρώτα όσοι έχουν feed (είναι η συνηθισμένη επανάληψη), μετά αλφαβητικά· η αναζήτηση φέρνει τους υπόλοιπους.
  const cards: SupplierCard[] = suppliers
    .map((s) => ({
      id: s.id, s1Trdr: s.s1Trdr, code: s.code, name: s.name, afm: s.afm,
      feed: s.feed ? { id: s.feed.id, url: s.feed.url, lastRunAt: s.feed.lastRunAt?.toISOString() ?? null, lastCount: s.feed.lastCount, items: byFeed.get(s.feed.id) ?? 0 } : null,
    }))
    .sort((a, b) => Number(!a.feed) - Number(!b.feed) || a.name.localeCompare(b.name, "el"))
    .slice(0, 60);

  return (
    <div className="grid gap-4 min-w-0">
      <div className="grid gap-1">
        <Link href="/admin/catalog/templates" className="inline-flex items-center gap-1 min-h-11 md:min-h-9 w-fit font-bold text-eu-blue text-[length:var(--fs-13)] hover:underline"><ArrowLeft className="size-4" aria-hidden /> Templates &amp; excel</Link>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><FileCode2 className="size-4" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">XML προμηθευτές</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">Διάλεξε προμηθευτή, δώσε τη διεύθυνση του XML feed του και φόρτωσε όλα τα προϊόντα του σε μια λίστα ελέγχου. Η αντιστοίχιση των πεδίων προτείνεται αυτόματα και αποθηκεύεται, ώστε το επόμενο τρέξιμο να είναι ένα πάτημα. Στα υπάρχοντα είδη συμπληρώνονται μόνο τα κενά· τα νέα πάνε στη λίστα «Νέα είδη» για έγκριση.</p>
      </div>
      <XmlImportWizard
        suppliers={cards}
        brands={brands.map(({ id, name, s1 }) => ({ id, name, s1 }))}
        categories={categories.map(({ id, path }) => ({ id, name: path }))}
        units={units.map(({ id, name }) => ({ id, name }))}
        marks={marks.map(({ id, name }) => ({ id, name }))}
        writeOn={writeOn}
        canErp={can(user.permissions, "catalog.sync.run")}
      />
    </div>
  );
}
