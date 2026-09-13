import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { WishlistGrid } from "@/components/catalog/WishlistGrid";
import { WishlistManager } from "@/components/catalog/WishlistManager";
import { getProductsByIds } from "@/lib/data/repo";
import { getCustomerSession } from "@/lib/account/session";
import { getLists, ensureDefaultList } from "@/lib/wishlist/repo";

export const metadata: Metadata = { title: "Η λίστα μου" };

/** Guests: device list (localStorage → ?ids). Signed-in: server lists with price-drop badges, notes, alerts, sharing. */
export default async function WishlistPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const me = await getCustomerSession();
  if (me) {
    await ensureDefaultList(me.id);
    const lists = await getLists(me.id);
    const drops = lists.flatMap((l) => l.items).filter((i) => i.drop).length;
    return (
      <div className="eu-container">
        <Breadcrumbs items={[{ label: "Η λίστα μου" }]} />
        <PageIntro kicker="Αγαπημένα" title={`Τα αγαπημένα σου, ${me.firstName}`} lead={drops ? `${drops} ${drops === 1 ? "προϊόν έπεσε" : "προϊόντα έπεσαν"} σε τιμή από τότε που τα αποθήκευσες.` : "Σε όλες τις συσκευές σου. Ειδοποίηση για πτώση τιμής και διαθεσιμότητα, κοινοποίηση με σύνδεσμο."} />
        <div className="eu-canvas eu-gutter pb-12"><WishlistManager lists={lists} /></div>
      </div>
    );
  }
  const products = ids ? await getProductsByIds(ids.split(",").filter(Boolean)) : [];
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Η λίστα μου" }]} />
      <PageIntro kicker="Αγαπημένα" title="Η λίστα μου" lead="Τα προϊόντα που ξεχώρισες. Αποθηκεύονται στη συσκευή σου· με λογαριασμό, σε όλες τις συσκευές και με ειδοποίηση πτώσης τιμής." />
      <div className="eu-canvas eu-gutter pb-12 grid gap-4">
        <div className="rounded-2xl bg-eu-navy text-white p-4 flex flex-wrap items-center gap-3"><span className="text-[length:var(--fs-15)]">Συνδέσου για να κρατήσεις τη λίστα σε όλες τις συσκευές και να ειδοποιείσαι όταν πέφτει η τιμή.</span><Link href="/syndesi?next=/lista" className="ml-auto rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 inline-flex items-center">Σύνδεση</Link></div>
        <WishlistGrid initial={products} />
      </div>
    </div>
  );
}
