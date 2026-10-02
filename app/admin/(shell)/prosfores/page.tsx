import Link from "next/link";
import { Plus, Zap, CalendarClock, Hourglass, Euro, Tag, Sparkles, FileSpreadsheet } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PromoTable, type PromoRowDTO } from "@/components/admin/promos/PromoTable";
import { describePromo, MECHANISM_LABEL, STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import type { PromoReward, PromoRules } from "@/lib/promo/engine";
import { services } from "@/lib/data/fixtures/services";

export const metadata = { title: "Προσφορές" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("el-GR");
/** χρονική αφετηρία του αιτήματος (εκτός render, για τον κανόνα καθαρότητας) */
const daysAgo = (days: number) => new Date(Date.now() - days * 86400_000);
const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;

/** Όλες οι προσφορές: KPIs, φίλτρα, κατάσταση με μια ματιά, μαζικές ενέργειες. */
export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; m?: string }> }) {
  const user = await requirePermission("catalog.promos.write");
  const { q = "", s = "live", m = "" } = await searchParams;
  const statusWhere: Prisma.PromotionWhereInput =
    s === "live" ? { status: { in: ["active", "scheduled", "paused", "pending"] } } : s === "all" ? { status: { not: "archived" } } : { status: s };
  const where: Prisma.PromotionWhereInput = {
    ...statusWhere,
    ...(m ? { mechanism: m } : {}),
    ...(q.trim() ? { OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { code: { contains: q.trim(), mode: "insensitive" } }, { coupons: { some: { code: q.trim().toUpperCase() } } }] } : {}),
  };
  const since = daysAgo(30);
  const [rows, counts, usage, orders, offers] = await Promise.all([
    db.promotion.findMany({ where, orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }], take: 300, include: { _count: { select: { targets: true, coupons: true } }, coupons: { where: { kind: "shared" }, take: 1, select: { code: true } }, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } }),
    db.promotion.groupBy({ by: ["status"], _count: true }),
    db.promotionUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { amount: true } }),
    db.promotionUsage.findMany({ where: { createdAt: { gte: since } }, distinct: ["orderId"], select: { orderId: true } }),
    db.productOffer.count(),
  ]);
  const c = (k: string) => counts.find((x) => x.status === k)?._count ?? 0;
  const giftIds = rows.flatMap((r) => ((r.reward as PromoReward).giftProductId ? [(r.reward as PromoReward).giftProductId!] : []));
  const gifts = new Map((giftIds.length ? await db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, title: true } }) : []).map((g) => [g.id, g.title]));
  const svc = new Map(services.map((x) => [x.slug, x.title.toLocaleLowerCase("el-GR")]));

  const dto: PromoRowDTO[] = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, status: r.status as PromoStatus, mechanism: r.mechanism, held: r.held,
    summary: describePromo({ mechanism: r.mechanism, reward: r.reward as PromoReward, rules: r.rules as PromoRules }, { gift: gifts.get((r.reward as PromoReward).giftProductId ?? ""), service: svc.get((r.reward as PromoReward).serviceSlug ?? "") }),
    startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
    usedCount: r.usedCount, maxUses: r.maxUses, spent: Number(r.spentEur), budget: r.budgetEur != null ? Number(r.budgetEur) : null,
    targets: r._count.targets, coupon: r.coupons[0]?.code ?? null, coupons: r._count.coupons, version: r.version, stacking: r.stacking, priority: r.priority,
    pendingChange: (r.versions[0]?.version ?? 0) > r.version,
  }));

  const kpis = [
    { t: "Ενεργές τώρα", v: n(c("active")), s: `${n(offers)} προϊόντα με προσφορά στη βιτρίνα`, href: "?s=active", Icon: Zap },
    { t: "Προγραμματισμένες", v: n(c("scheduled")), s: c("paused") ? `${n(c("paused"))} σε παύση` : "ξεκινούν αυτόματα", href: "?s=scheduled", Icon: CalendarClock },
    { t: "Αναμένουν έγκριση", v: n(c("pending")), s: hasPermission(user, "catalog.promos.approve") ? "μπορείς να τις εγκρίνεις" : "από δεύτερο πρόσωπο", href: "?s=pending", Icon: Hourglass },
    { t: "Έκπτωση 30 ημερών", v: eur(Number(usage._sum.amount ?? 0)), s: `σε ${n(orders.length)} παραγγελίες`, href: "/admin/prosfores/anafores", Icon: Euro },
  ];

  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs active="list" title="Προσφορές & κουπόνια" lead="Κάθε προσφορά ζει στο e-shop και γράφεται στη γραμμή του παραστατικού SoftOne με κωδικό και έκδοση. Οι αλλαγές φαίνονται στη βιτρίνα μέσα σε λίγα δευτερόλεπτα."
        actions={<>
          <Link href="/admin/prosfores/ermis" className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-chip"><Sparkles className="size-4" aria-hidden /> Περιγραφή στον Ερμή</Link>
          <Link href="/admin/prosfores/excel" className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-chip"><FileSpreadsheet className="size-4" aria-hidden /> Από Excel</Link>
          <Link href="/admin/prosfores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα προσφορά</Link>
        </>} />

      <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Link key={k.t} href={k.href} className="rounded-2xl bg-white border border-eu-line p-4 min-w-0 hover:border-eu-navy focus-visible:outline-2 focus-visible:outline-eu-blue">
            <div className="text-eu-muted text-[length:var(--fs-13)] inline-flex items-center gap-1.5"><k.Icon className="size-4" aria-hidden /> {k.t}</div>
            <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-24)] tabular-nums">{k.v}</div>
            <div className="text-eu-ink-3 text-[length:var(--fs-13)]">{k.s}</div>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="pr-q">Αναζήτηση</label>
        <input id="pr-q" name="q" defaultValue={q} placeholder="Όνομα, κωδικός CMP-…, κωδικός κουπονιού" className="flex-1 min-w-[240px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
        <label className="sr-only" htmlFor="pr-s">Κατάσταση</label>
        <select id="pr-s" name="s" defaultValue={s} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white">
          <option value="live">Σε εξέλιξη & επερχόμενες</option>
          <option value="all">Όλες (εκτός αρχείου)</option>
          {(Object.keys(STATUS_LABEL) as PromoStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k].label} ({n(c(k))})</option>)}
        </select>
        <label className="sr-only" htmlFor="pr-m">Μηχανισμός</label>
        <select id="pr-m" name="m" defaultValue={m} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white">
          <option value="">Όλοι οι μηχανισμοί</option>
          {Object.entries(MECHANISM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Φίλτρο</button>
      </form>

      {dto.length ? (
        <PromoTable rows={dto} canApprove={hasPermission(user, "catalog.promos.approve")} now={since.getTime() + 30 * 86400_000} />
      ) : (
        <div className="rounded-2xl bg-white border border-eu-line p-8 text-center grid gap-3 justify-items-center">
          <Tag className="size-8 text-eu-muted" aria-hidden />
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">{q || m || s !== "live" ? "Καμία προσφορά με αυτά τα κριτήρια." : "Δεν τρέχει καμία προσφορά αυτή τη στιγμή."}</p>
          <Link href="/admin/prosfores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-yellow-dark"><Plus className="size-4" aria-hidden /> Φτιάξε την πρώτη</Link>
        </div>
      )}
    </div>
  );
}
