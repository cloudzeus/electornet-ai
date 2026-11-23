import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE } from "@/lib/seo/product";
import { LISTED } from "@/lib/data/db-catalog";
import { getGuidesFull, getNews, getServicesFull, getStores } from "@/lib/data/repo";

// ξαναχτίζεται το πολύ μία φορά την ώρα· όχι στο build (η βάση μπορεί να λείπει εκεί)
export const revalidate = 3600;
export const dynamic = "force-dynamic";

const STATIC = ["", "/proionta", "/prosfores", "/brands", "/katastimata", "/ypiresies", "/odigoi", "/odigos-agoras", "/nea", "/renew", "/kartes-dorou", "/newsletter", "/epikoinonia", "/etaireia", "/tropoi-pliromis", "/tropoi-apostolis", "/epistrofes", "/syxnes-erotiseis", "/oroi-chrisis", "/aporrito", "/cookies", "/prosvasimotita", "/oikonomika-stoixeia"];

/**
 * sitemap.xml για τις μηχανές αναζήτησης: σταθερές σελίδες, κατηγορίες με προϊόντα, μάρκες, καταστήματα, υπηρεσίες, οδηγοί, νέα,
 * δημοσιευμένες σελίδες προσφορών και κάθε προϊόν που φαίνεται στις λίστες του site (ίδιο φίλτρο `LISTED`: με φωτογραφία, έτοιμο
 * για δημοσίευση — όχι ό,τι απλώς είναι ενεργό). Σελίδες εκτός ευρετηρίου (καλάθι, λογαριασμός, αναζήτηση) δεν μπαίνουν. Οι διευθύνσεις έχουν το ίδιο domain με τα canonical των σελίδων (SITE). Ως 50.000 διευθύνσεις ανά αρχείο (όριο Google).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [cats, brands, landings, products] = await Promise.all([
    db.category.findMany({ where: { active: true, productCount: { gt: 0 } }, select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } }),
    db.brand.findMany({ where: { products: { some: LISTED } }, select: { slug: true } }),
    db.landingPage.findMany({ where: { status: "published", OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({ where: LISTED, select: { slug: true, updatedAt: true }, take: 45_000 }),
  ]).catch(() => [[], [], [], []] as const);
  // περιεχόμενο εκτός καταλόγου: αποτυχία σε ένα από αυτά δεν ρίχνει όλο το sitemap
  const [stores, services, guides, news] = await Promise.all([getStores().catch(() => []), getServicesFull().catch(() => []), getGuidesFull().catch(() => []), getNews().catch(() => [])]);
  return [
    ...STATIC.map((p) => ({ url: `${SITE}${p}`, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.5 })),
    ...cats.map((c) => ({ url: `${SITE}/k/${[c.parent?.parent?.slug, c.parent?.slug, c.slug].filter(Boolean).join("/")}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...brands.map((b) => ({ url: `${SITE}/brands/${b.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...stores.map((x) => ({ url: `${SITE}/katastimata/${x.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...services.map((x) => ({ url: `${SITE}/ypiresies/${x.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...guides.map((x) => ({ url: `${SITE}/odigoi/${x.slug}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...news.map((x) => ({ url: `${SITE}/nea/${x.slug}`, lastModified: new Date(x.date), changeFrequency: "monthly" as const, priority: 0.4 })),
    ...landings.map((l) => ({ url: `${SITE}/prosfores/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE}/proion/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
  ];
}
