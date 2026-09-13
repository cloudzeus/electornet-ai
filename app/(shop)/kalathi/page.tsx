import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { CartView } from "@/components/checkout/CartView";
import { getProductsByIds, getServicesFull } from "@/lib/data/repo";
import { CartRestore } from "@/components/commerce/EmailCartButton";

export const metadata: Metadata = { title: "Καλάθι" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ restore?: string }> }) {
  const { restore } = await searchParams;
  const [services, crossSell] = await Promise.all([getServicesFull(), getProductsByIds(["r-138705", "r-140497", "r-138544", "r-119009"])]);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Καλάθι" }]} />
      {restore && <div className="eu-canvas eu-gutter pt-2"><CartRestore token={restore} /></div>}
      <CartView services={services.filter((s) => s.addonAt?.includes("checkout") || s.addonAt?.includes("pdp"))} crossSell={crossSell} />
    </div>
  );
}
