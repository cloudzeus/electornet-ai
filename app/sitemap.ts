import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE } from "@/lib/seo/product";

// ξαναχτίζεται το πολύ μία φορά την ώρα· όχι στο build (η βάση μπορεί να λείπει εκεί)
export const revalidate = 3600;
export const dynamic = "force-dynamic";

const STATIC = ["", "/prosfores", "/brands", "/katastimata", "/ypiresies", "/odigoi", "/epikoinonia", "/etaireia", "/tropoi-pliromis", "/tropoi-apostolis", "/epistrofes", "/syxnes-erotiseis", "/oroi-chrisis", "/aporrito", "/cookies", "/prosvasimotita"];

/**
 * sitemap.xml για τις μηχανές αναζήτησης: σταθερές σελίδες, κατηγορίες, μάρκες, δημοσιευμένες σελίδες προσφορών και κάθε ενεργό προϊόν
 * που πωλείται. Οι διευθύνσεις έχουν το ίδιο domain με τα canonical των σελίδων (SITE). Ως 50.000 διευθύνσεις ανά αρχείο (όριο Google).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [cats, brands, landings, products] = await Promise.all([
    db.category.findMany({ where: { active: true }, select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } }),
    db.brand.findMany({ where: { products: { some: { active: true } } }, select: { slug: true } }),
    db.landingPage.findMany({ where: { status: "published", OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({ where: { active: true, soldAlone: true, price: { gt: 0 } }, select: { slug: true, updatedAt: true }, take: 45_000 }),
  ]).catch(() => [[], [], [], []] as const);
  return [
    ...STATIC.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.5 })),
    ...cats.map((c) => ({ url: `${SITE}/k/${[c.parent?.parent?.slug, c.parent?.slug, c.slug].filter(Boolean).join("/")}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...brands.map((b) => ({ url: `${SITE}/brands/${b.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...landings.map((l) => ({ url: `${SITE}/prosfores/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE}/proion/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
