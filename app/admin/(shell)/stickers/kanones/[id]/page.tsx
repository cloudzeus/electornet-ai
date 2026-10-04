import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { StickerRuleEditor } from "@/components/admin/stickers/StickerRuleEditor";
import type { PromoTarget } from "@/lib/promo/engine";
import type { RuleInput } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Κανόνας sticker" };

export default async function StickerRulePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("catalog.promos.write");
  const { id } = await params;
  let initial: RuleInput = { id: null, name: "", stickerId: "", targets: [], minPrice: null, maxPrice: null, onlyInStock: false, startsAt: null, endsAt: null, priority: 100, active: true };
  if (id !== "new") {
    const r = await db.stickerRule.findUnique({ where: { id } });
    if (!r) notFound();
    initial = { id: r.id, name: r.name, stickerId: r.stickerId, targets: (r.targets as unknown as PromoTarget[]) ?? [], minPrice: r.minPrice, maxPrice: r.maxPrice, onlyInStock: r.onlyInStock, startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null, priority: r.priority, active: r.active };
  }
  // ονόματα για τις επιλογές (κατηγορίες, μάρκες, προϊόντα)
  const ids = (k: PromoTarget["kind"]) => initial.targets.filter((t) => t.kind === k).map((t) => t.refId);
  const bc = ids("brandcat").map((x) => x.split("|"));
  const [cats, brands, prods] = await Promise.all([
    db.category.findMany({ where: { id: { in: [...ids("category"), ...bc.map((x) => x[1])] } }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { id: { in: [...ids("brand"), ...bc.map((x) => x[0])] } }, select: { id: true, name: true } }),
    db.product.findMany({ where: { id: { in: ids("product") } }, select: { id: true, title: true } }),
  ]);
  const n = new Map([...cats.map((c) => [c.id, c.name] as const), ...brands.map((b) => [b.id, b.name] as const), ...prods.map((p) => [p.id, p.title] as const)]);
  const names: Record<string, string> = {};
  for (const t of initial.targets) names[t.refId] = t.kind === "brandcat" ? (() => { const [b, c] = t.refId.split("|"); return `${n.get(b) ?? b} στα ${n.get(c) ?? c}`; })() : n.get(t.refId) ?? t.refId;
  return (
    <div className="grid gap-3 min-w-0">
      <Link href="/admin/stickers/kanones" className="inline-flex items-center gap-1 min-h-11 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline w-fit"><ChevronLeft className="size-4" aria-hidden /> Όλοι οι κανόνες</Link>
      <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">{initial.id ? initial.name : "Νέος κανόνας sticker"}</h2>
      <StickerRuleEditor initial={initial} names={names} />
    </div>
  );
}
