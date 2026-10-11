import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { CouponTools, ExpireCoupon } from "@/components/admin/promos/CouponTools";
import { describePromo, STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import type { PromoReward, PromoRules } from "@/lib/promo/engine";
import { Pagination } from "@/components/admin/Pagination";
import { KpiTile } from "@/components/admin/charts/Charts";
import { Plus, Search, TicketPercent } from "lucide-react";

export const metadata = { title: "Κουπόνια" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const TRIGGER: Record<string, string> = { signup: "Εγγραφή", newsletter: "Newsletter", manual: "Χειροκίνητα", batch: "Παρτίδα", birthday: "Γενέθλια", "next-order": "Επόμενη αγορά", cart: "Καλάθι" };

const ST = [{ k: "", t: "Όλοι" }, { k: "active", t: "Σε ισχύ" }, { k: "used", t: "Χρησιμοποιήθηκαν" }, { k: "expired", t: "Έληξαν" }];
/** χρονική αφετηρία του αιτήματος (εκτός render, για τον κανόνα καθαρότητας) */
const requestTime = () => new Date();

/**
 * Κουπόνια: KPIs, αριστερά οι προσφορές-κουπόνια (πάτα μία για τους κωδικούς της), δεξιά οι κωδικοί με αναζήτηση,
 * φίλτρο κατάστασης και τις ενέργειες «Παρτίδα κωδικών» / «Κωδικός σε πελάτη».
 */
export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; st?: string; page?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { q = "", p = "", st = "", page: pg = "1" } = await searchParams;
  const page = Math.max(1, Number(pg) || 1);
  const now = requestTime();
  const stWhere: Prisma.CouponWhereInput = st === "expired" ? { expiresAt: { lt: now } } : st === "used" ? { usedCount: { gt: 0 } } : st === "active" ? { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] } : {};
  const where: Prisma.CouponWhereInput = { AND: [{ ...(p ? { promotionId: p } : {}) }, stWhere, ...(q.trim() ? [{ OR: [{ code: { contains: q.trim().toUpperCase() } }, { email: { contains: q.trim().toLowerCase() } }] }] : [])] };
  const week = new Date(now.getTime() + 7 * 86400_000), month = new Date(now.getTime() - 30 * 86400_000);
  const [promos, rows, total, live, expiring, uses30] = await Promise.all([
    db.promotion.findMany({ where: { OR: [{ mechanism: { startsWith: "coupon" }, status: { not: "archived" } }, { coupons: { some: {} } }] }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { _count: { select: { coupons: true } } } }),
    db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { promotion: { select: { name: true, code: true } } } }),
    db.coupon.count({ where }),
    db.coupon.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] } }),
    db.coupon.count({ where: { expiresAt: { gte: now, lt: week } } }),
    db.promotionUsage.count({ where: { couponCode: { not: null }, createdAt: { gte: month } } }),
  ]);
  const used = await db.coupon.groupBy({ by: ["promotionId"], where: { usedCount: { gt: 0 } }, _sum: { usedCount: true } });
  const usedBy = new Map(used.map((u) => [u.promotionId, u._sum.usedCount ?? 0]));
  const href = (x: Record<string, string>) => { const sp = new URLSearchParams({ q, p, st, page: "1", ...x }); for (const [k, v] of [...sp]) if (!v || (k === "page" && v === "1")) sp.delete(k); const t = sp.toString(); return t ? `?${t}` : "?"; };
  const cur = promos.find((x) => x.id === p);
  const activePromos = promos.filter((x) => ["active", "scheduled"].includes(x.status) && !x.held).length;

  return (
    <div className="grid gap-4 min-w-0">
      <PromoTabs active="coupons" title="Κουπόνια" lead="Προσφορές με κωδικό: κοινός (π.χ. WELCOME10), προσωπικοί μίας χρήσης (εγγραφή, newsletter, σε email, σε κοινό) ή παρτίδες για φυλλάδια και συνεργάτες."
        actions={<Link href="/admin/prosfores/new?template=coupon-amount" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο κουπόνι</Link>} />

      <div data-help="promo.coupons.kpis" className="grid grid-cols-2 @4xl:grid-cols-4 gap-3">
        <KpiTile label="Προσφορές-κουπόνια σε ισχύ" value={activePromos.toLocaleString("el-GR")} sub={`${promos.length.toLocaleString("el-GR")} συνολικά`} />
        <KpiTile label="Κωδικοί σε ισχύ" value={live.toLocaleString("el-GR")} href={href({ st: "active", p: "" })} />
        <KpiTile label="Λήγουν σε 7 ημέρες" value={expiring.toLocaleString("el-GR")} tone={expiring ? "warn" : undefined} />
        <KpiTile label="Χρήσεις 30 ημερών" value={uses30.toLocaleString("el-GR")} href="/admin/prosfores/anafores" />
      </div>

      <div className="grid gap-4 items-start @5xl:grid-cols-[19rem_minmax(0,1fr)]">
        <nav data-help="promo.coupons.promos" aria-label="Προσφορές-κουπόνια" className="rounded-2xl bg-white border border-eu-line p-2 grid gap-1 min-w-0">
          <span className="px-2 pt-1 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Προσφορές-κουπόνια</span>
          <Link href={href({ p: "" })} aria-current={!p ? "page" : undefined} className={`flex items-center gap-2 rounded-xl px-2.5 min-h-11 text-[length:var(--fs-14)] font-bold ${!p ? "bg-eu-navy text-white" : "text-eu-ink-2 hover:bg-eu-surface"}`}><TicketPercent className="size-4 shrink-0" aria-hidden /> Όλοι οι κωδικοί</Link>
          {promos.map((x) => {
            const on = x.id === p, s = STATUS_LABEL[x.status as PromoStatus];
            return (
              <Link key={x.id} href={href({ p: x.id })} aria-current={on ? "page" : undefined} className={`grid gap-0.5 rounded-xl px-2.5 py-2 ${on ? "bg-eu-chip ring-2 ring-eu-navy" : "hover:bg-eu-surface"}`}>
                <span className="flex items-start gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-snug flex-1 min-w-0">{x.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--fs-12)] font-bold ${s?.tone ?? ""}`}>{s?.label ?? x.status}</span></span>
                <span className="text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{describePromo({ mechanism: x.mechanism, reward: x.reward as PromoReward, rules: x.rules as PromoRules })}</span>
                <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums">{x._count.coupons.toLocaleString("el-GR")} κωδικοί · {(usedBy.get(x.id) ?? 0).toLocaleString("el-GR")} χρήσεις</span>
              </Link>
            );
          })}
          {!promos.length && <p className="m-0 px-2.5 py-2 text-eu-muted text-[length:var(--fs-14)]">Καμία ακόμη. <Link href="/admin/prosfores/new?template=coupon-amount" className="text-eu-blue font-bold hover:underline">Νέο κουπόνι</Link></p>}
        </nav>

        <section data-help="promo.coupons.codes" className="grid gap-2 min-w-0" aria-label="Κωδικοί">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] flex-1 min-w-0">{cur ? <>Κωδικοί · <Link href={`/admin/prosfores/${cur.id}`} className="hover:text-eu-blue hover:underline">{cur.name}</Link></> : "Όλοι οι κωδικοί"} <span className="text-eu-muted font-normal text-[length:var(--fs-14)]">({total.toLocaleString("el-GR")})</span></h3>
            <CouponTools current={p || undefined} promos={promos.filter((x) => ["active", "scheduled", "draft"].includes(x.status) && !x.held).map((x) => ({ id: x.id, code: x.code, name: x.name }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Κατάσταση κωδικών" className="flex flex-wrap gap-1.5">{ST.map((x) => <Link key={x.k} href={href({ st: x.k })} aria-current={st === x.k ? "page" : undefined} className={`rounded-full px-3 min-h-10 inline-flex items-center font-bold text-[length:var(--fs-13)] border ${st === x.k ? "bg-eu-navy text-white border-eu-navy" : "bg-white border-eu-line hover:border-eu-blue"}`}>{x.t}</Link>)}</nav>
            <form className="flex flex-1 min-w-[min(100%,16rem)] gap-2">
              {p && <input type="hidden" name="p" value={p} />}{st && <input type="hidden" name="st" value={st} />}
              <label className="relative flex-1 min-w-0"><span className="sr-only">Αναζήτηση κωδικού ή email</span><Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden /><input name="q" defaultValue={q} placeholder="Κωδικός ή email" className="w-full rounded-full border border-eu-line bg-white pl-10 pr-3 min-h-10 text-[length:var(--fs-14)]" /></label>
              <button className="rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue">Αναζήτηση</button>
            </form>
          </div>
          <div className="rounded-2xl border border-eu-line bg-white overflow-hidden">
            <ul className="m-0 p-0 list-none divide-y divide-eu-line">
              {rows.map((c) => { const expired = !!c.expiresAt && c.expiresAt < now; const spent = c.maxUses != null && c.usedCount >= c.maxUses; const dead = expired || spent; return (
                <li key={c.id} className={`grid grid-cols-[minmax(0,1fr)_auto] @3xl:grid-cols-[minmax(9rem,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_6rem_auto] gap-x-3 gap-y-0.5 items-center px-3 py-2 text-[length:var(--fs-14)] ${dead ? "text-eu-muted" : ""}`}>
                  <span className="font-mono font-bold min-w-0 truncate">{c.code}</span>
                  <span className="hidden @3xl:block min-w-0 truncate">{!p && <Link href={`/admin/prosfores/${c.promotionId}`} className="hover:underline">{c.promotion.name}</Link>}{p && <span className="text-eu-ink-3">{c.kind === "shared" ? "Κοινός" : "Μοναδικός"}{c.trigger ? ` · ${TRIGGER[c.trigger] ?? c.trigger}` : ""}</span>}</span>
                  <span className="col-start-1 @3xl:col-start-auto min-w-0 truncate text-eu-ink-3 text-[length:var(--fs-13)]">{c.email ?? (c.customerId ? "πελάτης" : c.kind === "shared" ? "όλοι" : "—")}{!p && <span className="@3xl:hidden"> · {c.promotion.name}</span>}</span>
                  <span className="row-start-1 col-start-2 @3xl:row-start-auto @3xl:col-start-auto text-right tabular-nums">{c.usedCount}{c.maxUses != null ? `/${c.maxUses}` : ""} <span className="text-eu-muted text-[length:var(--fs-12)]">χρ.</span></span>
                  <span className="col-start-2 @3xl:col-start-auto flex items-center justify-end gap-2 whitespace-nowrap text-[length:var(--fs-13)]">{c.expiresAt ? <span className={expired ? "text-eu-red font-bold" : ""}>{expired ? "έληξε " : "έως "}{c.expiresAt.toLocaleDateString("el-GR")}</span> : <span className="text-eu-muted">χωρίς λήξη</span>}{!expired && <ExpireCoupon id={c.id} code={c.code} />}</span>
                </li>
              ); })}
              {!rows.length && <li className="p-6 text-center text-eu-muted text-[length:var(--fs-14)]">Κανένας κωδικός{q ? ` με «${q}»` : ""}.</li>}
            </ul>
            {total > PAGE && <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} label="κωδικοί" href={(n: number) => href({ page: String(n) })} /></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
