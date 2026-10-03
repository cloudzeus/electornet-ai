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
  const info = INFO_TAGS.map((t) => { const row = tagRows.find((r) => r.slug === t.slug); return { ...t, config: cfg[t.slug], count: row?._count.products ?? 0, products: (row?.products ?? []).map((p) => ({ id: p.product.id, label: `${p.product.title} · ${p.product.sku}` })) }; });

  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="tags" active="tags" title="Ετικέτες προϊόντων" lead="Οι εμπορικές ετικέτες βγαίνουν αυτόματα από τις προσφορές (έως 2 ανά κάρτα). Οι ενημερωτικές μπαίνουν με κανόνα ή χειροκίνητα και φαίνονται όταν δεν υπάρχει ετικέτα προσφοράς." />
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Εμπορικές (αυτόματες) · {offers.length.toLocaleString("el-GR")} προϊόντα με προσφορά</h3>
        {commercial.size ? (
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
            {[...commercial.values()].sort((a, b) => b.n - a.n).map((c) => <li key={c.kind + c.label} className="inline-flex items-center gap-2 rounded-full bg-eu-chip text-eu-navy pl-3 pr-1.5 min-h-10 text-[length:var(--fs-14)] font-bold">{c.label}<span className="text-eu-muted font-semibold">{KIND[c.kind] ?? c.kind}</span><span className="rounded-full bg-white px-2 py-0.5 tabular-nums">{c.n.toLocaleString("el-GR")}</span></li>)}
          </ul>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία ενεργή προσφορά αυτή τη στιγμή.</p>}
      </section>
      <InfoTagsEditor tags={info} />
    </div>
  );
}
