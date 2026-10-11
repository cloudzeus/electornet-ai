import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { InfoTagsEditor } from "@/components/admin/promos/InfoTagsEditor";
import { INFO_TAGS, getTagConfig } from "@/lib/promo/tags";

export const metadata = { title: "Ετικέτες προϊόντων" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { price: "Έκπτωση τιμής", qty: "Πολλά τεμάχια", gift: "Δώρο", service: "Δωρεάν υπηρεσία", shipping: "Δωρεάν μεταφορικά", members: "Τιμή μέλους" };

/** Εμπορικές ετικέτες (αυτόματα από τις προσφορές) και ενημερωτικές (κανόνες ή χειροκίνητα). */
export default async function TagsPage() {
  await requirePermission("catalog.promos.write");
  const [offers, cfg, tagRows] = await Promise.all([
    db.productOffer.findMany({ select: { tags: true } }),
    getTagConfig(),
    db.tag.findMany({ where: { slug: { in: INFO_TAGS.map((t) => t.slug) } }, include: { _count: { select: { products: true } }, products: { take: 40, select: { product: { select: { id: true, title: true, sku: true } } } } } }),
  ]);
  const commercial = new Map<string, { kind: string; label: string; n: number }>();
  for (const o of offers) for (const t of (o.tags as { kind: string; label: string }[]) ?? []) { const k = `${t.kind}|${t.label}`; const c = commercial.get(k) ?? { kind: t.kind, label: t.label, n: 0 }; c.n++; commercial.set(k, c); }
  const info = INFO_TAGS.map((t) => { const row = tagRows.find((r) => r.slug === t.slug); return { ...t, config: cfg[t.slug], stickerKey: row?.stickerKey ?? null, count: row?._count.products ?? 0, products: (row?.products ?? []).map((p) => ({ id: p.product.id, label: `${p.product.title} · ${p.product.sku}` })) }; });

  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs active="tags" title="Ετικέτες προϊόντων" lead="Τα σήματα στις κάρτες προϊόντων: οι εμπορικές βγαίνουν αυτόματα από τις προσφορές, οι ενημερωτικές με κανόνα ή χειροκίνητα. Έως 2 ανά κάρτα, πρώτα της προσφοράς." />
      <section data-help="promo.tags.commercial" aria-labelledby="tags-com" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="tags-com" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Εμπορικές · αυτόματα από τις προσφορές</h3>
          <span className="text-eu-muted text-[length:var(--fs-13)]">{offers.length.toLocaleString("el-GR")} προϊόντα με προσφορά τώρα</span>
        </div>
        {commercial.size ? (
          <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
            {[...commercial.values()].sort((a, b) => b.n - a.n).map((c) => <li key={c.kind + c.label} className="inline-flex items-center gap-2 rounded-full bg-eu-chip text-eu-navy pl-3 pr-1.5 min-h-9 text-[length:var(--fs-13)] font-bold">{c.label}<span className="text-eu-muted font-semibold">{KIND[c.kind] ?? c.kind}</span><span className="rounded-full bg-white px-2 py-0.5 tabular-nums">{c.n.toLocaleString("el-GR")}</span></li>)}
          </ul>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία ενεργή προσφορά αυτή τη στιγμή — οι ετικέτες εμφανίζονται μόλις ξεκινήσει μία. <Link href="/admin/prosfores/new" className="font-bold text-eu-blue hover:underline">Νέα προσφορά</Link></p>}
      </section>
      <InfoTagsEditor tags={info} />
    </div>
  );
}
