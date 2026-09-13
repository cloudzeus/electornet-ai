import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { getSharedList } from "@/lib/wishlist/repo";

export const metadata: Metadata = { title: "Κοινόχρηστη λίστα", robots: { index: false } };

/** Read-only view of a list shared by link. */
export default async function SharedList({ params }: { params: Promise<{ token: string }> }) {
  const l = await getSharedList((await params).token);
  if (!l) notFound();
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Λίστα" }]} />
      <PageIntro kicker={`Λίστα ${l.owner ? `του/της ${l.owner}` : ""}`} title={l.name} lead={`${l.products.length} προϊόντα. Πάτησε την καρδιά για να τα κρατήσεις και στη δική σου λίστα.`} />
      <div className="eu-canvas eu-gutter pb-12"><ProductGrid products={l.products} /></div>
    </div>
  );
}
