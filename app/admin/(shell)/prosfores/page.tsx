import Link from "next/link";
import { Plus, Tag, Sparkles, FileSpreadsheet, Search, CircleAlert, Hourglass, Clock, Wallet, CalendarX, ArrowRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { PromoTable, type PromoRowDTO } from "@/components/admin/promos/PromoTable";
import { KpiTile } from "@/components/admin/charts/Charts";
import { describePromo, MECHANISM_LABEL, STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import type { PromoReward, PromoRules } from "@/lib/promo/engine";
import { getServiceList } from "@/lib/services/catalog";
import { promoStats, delta } from "@/lib/promo/stats";
import { promoAppearances } from "@/lib/promo/where";

export const metadata = { title: "Προσφορές" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("el-GR");
const eur = (v: number) => `${v.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
/** χρονική αφετηρία του αιτήματος (εκτός render, για τον κανόνα καθαρότητας) */
const requestTime = () => Date.now();
const LIVE = ["active", "scheduled", "paused", "pending"];
const FILTERS: { key: string; label: string }[] = [
  { key: "live", label: "Σε εξέλιξη" }, { key: "active", label: "Ενεργές" }, { key: "scheduled", label: "Προγραμματισμένες" }, { key: "pending", label: "Για έγκριση" },
  { key: "paused", label: "Σε παύση" }, { key: "draft", label: "Πρόχειρα" }, { key: "ended", label: "Έληξαν" }, { key: "all", label: "Όλες" },
];

/**
 * Προσφορές: ό,τι θέλει ενέργεια, KPIs 30 ημερών με τάση, φίλτρα κατάστασης με πλήθη και η λίστα με διάρκεια,
 * απόδοση και πού εμφανίζεται κάθε προσφορά στο site.
 */
export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; m?: string }> }) {
  const user = await requirePermission("catalog.promos.write");
  const { q = "", s = "live", m = "" } = await searchParams;
  const statusWhere: Prisma.PromotionWhereInput = s === "live" ? { status: { in: LIVE } } : s === "all" ? { status: { not: "archived" } } : { status: s };
  const where: Prisma.PromotionWhereInput = {
    ...statusWhere,
    ...(m ? { mechanism: m } : {}),
    ...(q.trim() ? { OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { code: { contains: q.trim(), mode: "insensitive" } }, { coupons: { some: { code: q.trim().toUpperCase() } } }] } : {}),
  };
  const now = requestTime();
  const [rows, counts, stats, ordersAll, offers, live] = await Promise.all([
    db.promotion.findMany({ where, orderBy: [{ status: "asc" }, { startsAt: "desc" }, { createdAt: "desc" }], take: 300, include: { _count: { select: { targets: true, coupons: true } }, coupons: { where: { kind: "shared" }, take: 1, select: { code: true } }, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } }),
    db.promotion.groupBy({ by: ["status"], _count: true }),
    promoStats(30, undefined, now),
    db.order.count({ where: { createdAt: { gte: new Date(now - 30 * 86400_000) }, status: { notIn: ["cancelled"] } } }),
    db.productOffer.count(),
    db.promotion.findMany({ where: { status: { in: LIVE } }, select: { id: true, name: true, status: true, endsAt: true, startsAt: true, budgetEur: true, spentEur: true, version: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } }),
  ]);
  const c = (k: string): number => (k === "live" ? LIVE.reduce((a, x) => a + c(x), 0) : k === "all" ? counts.filter((x) => x.status !== "archived").reduce((a, x) => a + x._count, 0) : counts.find((x) => x.status === k)?._count ?? 0);
  const giftIds = rows.flatMap((r) => ((r.reward as PromoReward).giftProductId ? [(r.reward as PromoReward).giftProductId!] : []));
  const [gifts, services, where_] = await Promise.all([
    giftIds.length ? db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, title: true } }) : [],
    getServiceList(),
    promoAppearances(rows.map((r) => r.id)),
  ]);
  const giftName = new Map(gifts.map((g) => [g.id, g.title]));
  const svc = new Map(services.map((x) => [x.slug, x.title.toLocaleLowerCase("el-GR")]));

  const dto: PromoRowDTO[] = rows.map((r) => {
    const app = where_.get(r.id) ?? [];
    const perf = stats.byPromo.get(r.id);
    return {
      id: r.id, code: r.code, name: r.name, status: r.status as PromoStatus, mechanism: r.mechanism, held: r.held,
      summary: describePromo({ mechanism: r.mechanism, reward: r.reward as PromoReward, rules: r.rules as PromoRules }, { gift: giftName.get((r.reward as PromoReward).giftProductId ?? ""), service: svc.get((r.reward as PromoReward).serviceSlug ?? "") }),
      startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
      usedCount: r.usedCount, maxUses: r.maxUses, spent: Number(r.spentEur), budget: r.budgetEur != null ? Number(r.budgetEur) : null,
      targets: r._count.targets, coupon: r.coupons[0]?.code ?? null, coupons: r._count.coupons, version: r.version, stacking: r.stacking, priority: r.priority,
      pendingChange: (r.versions[0]?.version ?? 0) > r.version,
      perf: { orders: perf?.orders ?? 0, discount: perf?.discount ?? 0 },
      appears: app.map((a) => ({ kind: a.kind, place: a.place, what: a.what, live: a.live, href: a.href })),
    };
  });

  // ό,τι θέλει ενέργεια τώρα (από όλες τις ζωντανές, όχι μόνο όσες φαίνονται με το φίλτρο)
  const H48 = now + 48 * 3600_000;
  const pending = live.filter((p) => p.status === "pending" || (p.versions[0]?.version ?? 0) > p.version);
  const ending = live.filter((p) => p.status === "active" && p.endsAt && +p.endsAt < H48 && +p.endsAt > now);
  const budget = live.filter((p) => p.budgetEur && Number(p.spentEur) / Number(p.budgetEur) >= 0.8);
  const noEnd = live.filter((p) => p.status === "active" && !p.endsAt);
  const attention = [
    pending.length && { Icon: Hourglass, tone: "text-eu-amber", text: `${pending.length} ${pending.length === 1 ? "προσφορά περιμένει" : "προσφορές περιμένουν"} έγκριση`, sub: pending.slice(0, 3).map((p) => p.name).join(" · "), href: "?s=pending", cta: hasPermission(user, "catalog.promos.approve") ? "Έγκριση" : "Προβολή" },
    ending.length && { Icon: Clock, tone: "text-eu-red", text: `${ending.length} λήγ${ending.length === 1 ? "ει" : "ουν"} μέσα σε 48 ώρες`, sub: ending.slice(0, 3).map((p) => p.name).join(" · "), href: "?s=active", cta: "Παράταση;" },
    budget.length && { Icon: Wallet, tone: "text-eu-amber", text: `${budget.length} ${budget.length === 1 ? "έχει" : "έχουν"} ξοδέψει ≥ 80 % του budget`, sub: budget.slice(0, 3).map((p) => p.name).join(" · "), href: "?s=active", cta: "Έλεγχος" },
    noEnd.length && { Icon: CalendarX, tone: "text-eu-ink-3", text: `${noEnd.length} ενεργ${noEnd.length === 1 ? "ή" : "ές"} χωρίς ημερομηνία λήξης`, sub: noEnd.slice(0, 3).map((p) => p.name).join(" · "), href: "?s=active", cta: "Βάλε λήξη" },
  ].filter(Boolean) as { Icon: typeof Clock; tone: string; text: string; sub: string; href: string; cta: string }[];

  const qs = (x: Record<string, string>) => { const p = new URLSearchParams({ ...(q ? { q } : {}), ...(m ? { m } : {}), s, ...x }); if (p.get("s") === "live") p.delete("s"); const t = p.toString(); return t ? `?${t}` : "/admin/prosfores"; };

  return (
    <div className="grid gap-4 min-w-0">
      <PromoTabs active="list" title="Προσφορές & κουπόνια" lead="Κάθε προσφορά ισχύει στη βιτρίνα και στο καλάθι μέσα σε δευτερόλεπτα και γράφεται στο παραστατικό SoftOne με κωδικό και έκδοση."
        actions={<>
          <Link href="/admin/prosfores/ermis" className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-navy text-[length:var(--fs-14)] hover:bg-eu-chip"><Sparkles className="size-4" aria-hidden /> Με τον Ερμή</Link>
          <Link href="/admin/prosfores/excel" className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 font-bold text-eu-navy text-[length:var(--fs-14)] hover:bg-eu-chip"><FileSpreadsheet className="size-4" aria-hidden /> Από Excel</Link>
          <Link data-help="promo.new" href="/admin/prosfores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα προσφορά</Link>
        </>} />

      <div data-help="promo.kpis" className="grid grid-cols-2 @4xl:grid-cols-4 gap-3">
        <KpiTile label="Ενεργές τώρα" value={n(c("active"))} sub={`${n(offers)} προϊόντα με προσφορά στη βιτρίνα`} href="?s=active" />
        <KpiTile label="Προγραμματισμένες" value={n(c("scheduled"))} sub={c("paused") ? `${n(c("paused"))} σε παύση` : "ξεκινούν αυτόματα"} href="?s=scheduled" />
        <KpiTile label="Έκπτωση 30 ημερών" value={eur(stats.total.discount)} delta={delta(stats.total.discount, stats.prev.discount, "down")} trend={stats.discount} href="/admin/prosfores/anafores" />
        <KpiTile label="Παραγγελίες με προσφορά" value={n(stats.total.orders)} sub={ordersAll ? `${Math.round((stats.total.orders / ordersAll) * 100)} % των παραγγελιών 30 ημερών` : "καμία παραγγελία 30 ημερών"} delta={delta(stats.total.orders, stats.prev.orders)} trend={stats.orders} href="/admin/prosfores/anafores" />
      </div>

      {attention.length > 0 && (
        <section data-help="promo.attention" aria-labelledby="pa-h" className="rounded-2xl bg-white border border-eu-amber/50 p-3 @md:p-4 grid gap-2">
          <h3 id="pa-h" className="m-0 inline-flex items-center gap-2 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]"><CircleAlert className="size-5 text-eu-amber" aria-hidden /> Θέλουν προσοχή</h3>
          <ul className="m-0 p-0 list-none grid gap-1.5 @3xl:grid-cols-2">
            {attention.map((a) => (
              <li key={a.text}>
                <Link href={a.href} className="group flex items-start gap-2.5 rounded-xl bg-eu-surface/70 px-3 py-2 min-h-12 h-full hover:bg-eu-chip">
                  <a.Icon className={`size-4 mt-0.5 shrink-0 ${a.tone}`} aria-hidden />
                  <span className="flex-1 min-w-0 grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug">{a.text}</span>{a.sub && <span className="text-eu-muted text-[length:var(--fs-13)] truncate">{a.sub}</span>}</span>
                  <span className="shrink-0 inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-13)] group-hover:underline">{a.cta} <ArrowRight className="size-3.5" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div data-help="promo.filters" className="grid gap-2">
        <nav aria-label="Κατάσταση" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const on = f.key === s, k = c(f.key);
            if (!on && !k && !["live", "all"].includes(f.key)) return null;
            return (
              <Link key={f.key} href={qs({ s: f.key })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] border ${on ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-ink-2 border-eu-line hover:border-eu-blue"}`}>
                {f.label}<span className={`tabular-nums text-[length:var(--fs-12)] rounded-full px-1.5 ${on ? "bg-white/20" : f.key === "pending" && k ? "bg-eu-yellow/40 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{n(k)}</span>
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap gap-2">
          {s !== "live" && <input type="hidden" name="s" value={s} />}
          <label className="relative flex-1 min-w-[min(100%,16rem)]">
            <span className="sr-only">Αναζήτηση</span>
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
            <input name="q" defaultValue={q} enterKeyHint="search" placeholder="Όνομα, κωδικός CMP-…, κωδικός κουπονιού" className="w-full rounded-full border border-eu-line bg-white pl-10 pr-4 min-h-11 text-[length:var(--fs-14)] focus:border-eu-blue outline-none" />
          </label>
          <label className="sr-only" htmlFor="pr-m">Μηχανισμός</label>
          <select id="pr-m" name="m" defaultValue={m} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] bg-white min-w-0 max-w-full">
            <option value="">Όλοι οι μηχανισμοί</option>
            {Object.entries(MECHANISM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Αναζήτηση</button>
          {(q || m) && <Link href={s === "live" ? "/admin/prosfores" : `?s=${s}`} className="inline-flex items-center rounded-full px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:bg-eu-surface">Καθαρισμός</Link>}
        </form>
      </div>

      {dto.length ? (
        <PromoTable rows={dto} canApprove={hasPermission(user, "catalog.promos.approve")} now={now} />
      ) : (
        <div className="rounded-2xl bg-white border border-eu-line p-6 grid gap-3 justify-items-center text-center">
          <Tag className="size-8 text-eu-muted" aria-hidden />
          <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">{q || m || s !== "live" ? `Καμία προσφορά${s !== "live" && s !== "all" ? ` «${STATUS_LABEL[s as PromoStatus]?.label ?? s}»` : ""} με αυτά τα κριτήρια.` : "Δεν τρέχει καμία προσφορά αυτή τη στιγμή."}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/admin/prosfores/new" className="inline-flex items-center gap-2 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-yellow-dark"><Plus className="size-4" aria-hidden /> Νέα προσφορά</Link>
            <Link href="/admin/prosfores/ermis" className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-chip"><Sparkles className="size-4" aria-hidden /> Περιγραφή στον Ερμή</Link>
          </div>
        </div>
      )}
    </div>
  );
}
