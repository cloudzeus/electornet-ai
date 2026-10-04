import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { loadBannerStudio } from "@/lib/catalog/banner-studio-data";
import { BannerStudio } from "@/components/admin/banner-studio/BannerStudio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Απόδελτίωση banners" };

/** Εργαλείο απόδελτίωσης για ένα προϊόν: banners → κείμενο + φωτογραφίες → ενότητες της σελίδας (και μέσα στην καρτέλα προϊόντος). */
export default async function BannersPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog.products.write");
  const data = await loadBannerStudio((await params).id);
  if (!data) notFound();
  return <BannerStudio {...data} />;
}
