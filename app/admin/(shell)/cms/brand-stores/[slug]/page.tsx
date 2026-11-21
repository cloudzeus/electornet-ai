import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getStoreDoc } from "@/lib/cms/brand-stores";
import { getProductsByIds } from "@/lib/data/repo";
import { BrandStoreEditor } from "@/components/admin/cms/BrandStoreEditor";
import type { BrandStore } from "@/lib/cms/brand-store";
import { can } from "@/lib/rbac/permissions";
import { brandHealth } from "@/lib/cms/brand-health";
import { getPlans } from "@/lib/cms/doc-plans";
import { brandTarget } from "@/lib/cms/brand-plans";
import { decodeSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const doc = await getStoreDoc(decodeSlug((await params).slug));
  return { title: doc ? `Σελίδα ${doc.draft.name}` : "Σελίδα μάρκας" };
}

function productIds(s: BrandStore) {
  const ids = new Set<string>([s.hero.productId]);
  for (const b of s.blocks) { if ("productIds" in b && Array.isArray(b.productIds)) b.productIds.forEach((i) => ids.add(i)); if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((i) => ids.add(i))); }
  return [...ids].filter(Boolean);
}

export default async function BrandStoreEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requirePermission("cms.brandstores.write");
  const slug = decodeSlug((await params).slug);
  const [doc, brand] = await Promise.all([getStoreDoc(slug), db.brand.findUnique({ where: { slug }, select: { id: true, name: true, logo: true, logoCdn: true, logoStatus: true } })]);
  // ποτέ γυμνό 404 εδώ: ο διαχειριστής πρέπει να μάθει ΤΙ λείπει (σελίδα ή μάρκα) και να μπορεί να γυρίσει πίσω
  if (!doc || !brand) return <Missing slug={slug} what={!doc ? "doc" : "brand"} />;
  const [list, health, plans] = await Promise.all([
    getProductsByIds(productIds(doc.draft)),
    brandHealth(doc.draft).catch(() => ({ empty: {}, issues: [] })),
    getPlans(brandTarget(slug)).catch(() => ({ scenarios: [], review: null })),
  ]);
  const scheduled = plans.scenarios.filter((x) => x.status === "scheduled" && x.publishAt).map((x) => ({ name: x.name, publishAt: x.publishAt! })).sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));
  const info = Object.fromEntries(list.map((p) => [p.id, { id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }]));
  return (
    <BrandStoreEditor
      initial={doc.draft}
      published={doc.published}
      savedAt={doc.updatedAt.toISOString()}
      brand={{ id: brand.id, name: brand.name, logo: brand.logo ?? (brand.logoStatus === "approved" ? brand.logoCdn : null) }}
      info={info}
      canPublish={can(user.permissions, "cms.publish")}
      health={health}
      plans={{ review: plans.review, scheduled }}
      me={user.id}
    />
  );
}

/** Η σελίδα ή η μάρκα δεν βρέθηκε: εξήγηση στη γλώσσα του διαχειριστή, με δρόμο πίσω. */
function Missing({ slug, what }: { slug: string; what: "doc" | "brand" }) {
  return (
    <div className="grid gap-4 max-w-2xl">
      <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Η σελίδα μάρκας δεν άνοιξε</h1>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">
        {what === "doc"
          ? <>Δεν υπάρχει σελίδα για το «{slug}». Ίσως διαγράφηκε ή ο σύνδεσμος είναι παλιός — φτιάξε τη ξανά από τη λίστα.</>
          : <>Η σελίδα «{slug}» υπάρχει, αλλά η μάρκα δεν βρίσκεται πια στον κατάλογο (ίσως άλλαξε κωδικό ή διαγράφηκε από το SoftOne). Χωρίς μάρκα δεν μπορούν να επιλεγούν προϊόντα· ενημέρωσε τον κατάλογο ή σβήσε τη σελίδα από τη λίστα.</>}
      </p>
      <Link href="/admin/cms/brand-stores" className="justify-self-start rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 inline-flex items-center">Πίσω στις σελίδες μαρκών</Link>
    </div>
  );
}
