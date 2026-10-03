import Link from "next/link";
import { notFound } from "next/navigation";
import { History, Receipt } from "lucide-react";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { draftOf, pendingChange, targetNames } from "@/lib/promo/admin";
import { PendingChange } from "@/components/admin/promos/PendingChange";
import { PromoWizard } from "@/components/admin/promos/PromoWizard";
import { services } from "@/lib/data/fixtures/services";
import { describePromo, type PromoStatus } from "@/lib/promo/catalog";
import type { PromoReward, PromoRules } from "@/lib/promo/engine";

export const metadata = { title: "Προσφορά" };
export const dynamic = "force-dynamic";

/** Επεξεργασία μιας προσφοράς + οι εκδόσεις της (όπως ίσχυαν) + οι χρήσεις της ανά παραστατικό. */
export default async function PromotionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const user = await requirePermission("catalog.promos.write");
  const { id } = await params;
  const { step } = await searchParams;
  const p = await db.promotion.findUnique({ where: { id }, include: { targets: true, coupons: true, versions: { orderBy: { version: "desc" } } } });
  if (!p) notFound();
  const change = await pendingChange(p.id, p.version);
  const d = draftOf(p);
  const [names, usage, orders, staff] = await Promise.all([
    targetNames([...d.targets, ...Object.keys(d.reward.price ?? {}).map((refId) => ({ kind: "product", refId })), ...(d.reward.giftProductId ? [{ kind: "product", refId: d.reward.giftProductId }] : [])]),
    db.promotionUsage.aggregate({ where: { promotionId: id }, _sum: { amount: true }, _count: true }),
    db.promotionUsage.findMany({ where: { promotionId: id }, distinct: ["orderId"], orderBy: { createdAt: "desc" }, take: 12, select: { orderId: true, version: true, couponCode: true, createdAt: true, order: { select: { number: true, total: true } } } }),
    db.staff.findMany({ where: { id: { in: [p.createdById, p.approvedById, change?.by ?? null, ...p.versions.map((v) => v.createdById)].filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const who = new Map(staff.map((s) => [s.id, s.name]));
  const eur = (v: number) => `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  return (
    <div className="grid gap-6 min-w-0">
      {(change || p.status === "pending") && (
        <PendingChange id={p.id} isNew={!change} canApprove={hasPermission(user, "catalog.promos.approve")}
          summary={change ? `${change.draft.name}: ${describePromo(change.draft)}` : `${p.name}: ${describePromo({ mechanism: p.mechanism, reward: p.reward as PromoReward, rules: p.rules as PromoRules })}`}
          by={who.get((change ? change.by : p.createdById) ?? "") ?? null} at={(change?.at ?? p.updatedAt).toISOString()} />
      )}
      <PromoWizard initial={d} names={names} status={p.status as PromoStatus} code={p.code} canApprove={hasPermission(user, "catalog.promos.approve")} startStep={Math.min(4, Math.max(0, Number(step) || 3))}
        services={services.map((s) => ({ slug: s.slug, title: s.title, price: s.priceFrom ?? 0 }))}
        stores={(await db.store.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true } }))}
        segments={(await db.segment.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, members: true } })).map((x) => ({ id: x.id, label: `${x.name} (${x.members})` }))} />

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 content-start" aria-labelledby="pv-h">
          <h3 id="pv-h" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><History className="size-4" aria-hidden /> Εκδόσεις</h3>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Κάθε δημοσίευση κρατά ένα στιγμιότυπο. Οι παραγγελίες γράφουν την έκδοση που ίσχυε — οι όροι τους δεν αλλάζουν αναδρομικά.</p>
          <div className="text-[length:var(--fs-14)] text-eu-ink-2">Δημιουργία: <strong>{who.get(p.createdById ?? "") ?? "—"}</strong> · {p.createdAt.toLocaleString("el-GR")}{p.approvedById && <> · έγκριση: <strong>{who.get(p.approvedById) ?? "—"}</strong></>}</div>
          {p.versions.length ? (
            <ol className="m-0 p-0 list-none grid gap-2">
              {p.versions.filter((v) => v.version <= p.version).map((v) => {
                const s = v.snapshot as unknown as { name: string; mechanism: string; reward: PromoReward; rules: PromoRules; startsAt: string | null; endsAt: string | null; termsText: string | null };
                return (
                  <li key={v.id} className="rounded-xl border border-eu-line p-3 text-[length:var(--fs-14)]">
                    <div className="flex flex-wrap justify-between gap-2"><strong className="text-eu-ink">v{v.version}{v.version === p.version ? " · τρέχουσα" : ""}</strong><span className="text-eu-muted">{v.createdAt.toLocaleString("el-GR")} · {who.get(v.createdById ?? "") ?? "—"}</span></div>
                    <div className="text-eu-ink-2">{describePromo(s)}</div>
                    <div className="text-eu-muted">{s.startsAt ? new Date(s.startsAt).toLocaleDateString("el-GR") : "—"} → {s.endsAt ? new Date(s.endsAt).toLocaleDateString("el-GR") : "χωρίς λήξη"}</div>
                    {s.termsText && <details className="mt-1"><summary className="cursor-pointer text-eu-blue font-bold">Όροι όπως ίσχυαν</summary><p className="m-0 mt-1 text-eu-ink-3">{s.termsText}</p></details>}
                  </li>
                );
              })}
            </ol>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Δεν έχει δημοσιευτεί ακόμη.</p>}
        </section>

        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3 content-start" aria-labelledby="pu-h">
          <h3 id="pu-h" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Receipt className="size-4" aria-hidden /> Χρήσεις</h3>
          <div className="flex flex-wrap gap-6">
            <div><div className="text-eu-muted text-[length:var(--fs-13)]">Παραγγελίες</div><div className="font-heading font-extrabold text-[length:var(--fs-22)] tabular-nums">{p.usedCount.toLocaleString("el-GR")}</div></div>
            <div><div className="text-eu-muted text-[length:var(--fs-13)]">Συνολική έκπτωση</div><div className="font-heading font-extrabold text-[length:var(--fs-22)] tabular-nums">{eur(Number(usage._sum.amount ?? 0))}</div></div>
          </div>
          {orders.length ? (
            <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-xl border border-eu-line">
              {orders.map((o) => <li key={o.orderId} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-[length:var(--fs-14)]"><Link href={`/admin/prosfores/anafores/paraggelia/${o.orderId}`} className="font-bold text-eu-blue hover:underline">{o.order.number}</Link><span className="text-eu-muted">v{o.version}{o.couponCode ? ` · ${o.couponCode}` : ""} · {o.createdAt.toLocaleDateString("el-GR")}</span></li>)}
            </ul>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία παραγγελία ακόμη.</p>}
          <Link href={`/admin/prosfores/anafores?promo=${p.id}`} className="justify-self-start font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Πλήρης αναφορά καμπάνιας →</Link>
        </section>
      </div>
    </div>
  );
}
