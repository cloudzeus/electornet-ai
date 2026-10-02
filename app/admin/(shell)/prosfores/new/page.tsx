import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { emptyDraft, targetNames } from "@/lib/promo/admin";
import { PromoWizard } from "@/components/admin/promos/PromoWizard";
import { services } from "@/lib/data/fixtures/services";
import { TEMPLATES } from "@/lib/promo/catalog";

export const metadata = { title: "Νέα προσφορά" };
export const dynamic = "force-dynamic";

/**
 * Νέα προσφορά. Ανοίγει και προσυμπληρωμένη: ?template=nplusm, ?products=id1,id2 (από την καρτέλα ή μαζικά από τον κατάλογο),
 * ?brand=… / ?category=…, ?draft=<base64 JSON> (από τον Ερμή ή το Excel). Τίποτα δεν δημοσιεύεται χωρίς τον χρήστη.
 */
export default async function NewPromotionPage({ searchParams }: { searchParams: Promise<{ template?: string; products?: string | string[]; brand?: string; category?: string; draft?: string }> }) {
  const user = await requirePermission("catalog.promos.write");
  const sp = await searchParams;
  const tpl = TEMPLATES.find((t) => t.key === sp.template && !t.held)?.key;
  let d = emptyDraft(tpl ?? "percent");
  if (sp.draft) {
    try { d = { ...d, ...JSON.parse(Buffer.from(sp.draft, "base64url").toString("utf8")), id: null }; } catch { /* άκυρο προσχέδιο: κενός οδηγός */ }
  }
  const ids = (Array.isArray(sp.products) ? sp.products : (sp.products ?? "").split(",")).map((x) => x.trim()).filter(Boolean).slice(0, 500);
  if (ids.length) {
    const ok = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (d.mechanism === "special-price") d.reward = { ...d.reward, price: Object.fromEntries(ok.map((p) => [p.id, 0])) };
    else d.targets = [...d.targets, ...ok.map((p) => ({ kind: "product" as const, refId: p.id, exclude: false }))];
  }
  if (sp.brand) d.targets = [...d.targets, { kind: "brand", refId: sp.brand, exclude: false }];
  if (sp.category) d.targets = [...d.targets, { kind: "category", refId: sp.category, exclude: false }];
  const names = await targetNames([...d.targets, ...Object.keys(d.reward.price ?? {}).map((refId) => ({ kind: "product", refId })), ...(d.reward.giftProductId ? [{ kind: "product", refId: d.reward.giftProductId }] : [])]);
  const prefilled = !!(tpl || sp.draft || ids.length || sp.brand || sp.category);
  return (
    <PromoWizard initial={d} names={names} status={null} code={null} canApprove={hasPermission(user, "catalog.promos.approve")} startStep={prefilled ? (tpl || sp.draft ? 1 : 0) : 0}
      services={services.map((s) => ({ slug: s.slug, title: s.title, price: s.priceFrom ?? 0 }))} />
  );
}
