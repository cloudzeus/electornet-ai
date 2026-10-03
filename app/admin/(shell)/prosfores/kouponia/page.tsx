import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { CouponTools, ExpireCoupon } from "@/components/admin/promos/CouponTools";
import { describePromo, STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import type { PromoReward, PromoRules } from "@/lib/promo/engine";
import { Pagination } from "@/components/admin/Pagination";

export const metadata = { title: "Κουπόνια" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const TRIGGER: Record<string, string> = { signup: "Εγγραφή", newsletter: "Newsletter", manual: "Χειροκίνητα", batch: "Παρτίδα", birthday: "Γενέθλια", "next-order": "Επόμενη αγορά", cart: "Καλάθι" };

/** Κουπόνια: οι προσφορές-κουπόνια, οι κωδικοί τους (κοινοί, προσωπικοί, παρτίδες) και πόσο χρησιμοποιήθηκαν. */
export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; page?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { q = "", p = "", page: pg = "1" } = await searchParams;
  const page = Math.max(1, Number(pg) || 1);
  const where: Prisma.CouponWhereInput = { ...(p ? { promotionId: p } : {}), ...(q.trim() ? { OR: [{ code: { contains: q.trim().toUpperCase() } }, { email: { contains: q.trim().toLowerCase() } }] } : {}) };
  const [promos, rows, total] = await Promise.all([
    db.promotion.findMany({ where: { mechanism: { startsWith: "coupon" }, status: { not: "archived" } }, orderBy: { createdAt: "desc" }, include: { _count: { select: { coupons: true } } } }),
    db.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { promotion: { select: { name: true, code: true } } } }),
    db.coupon.count({ where }),
  ]);
  const used = await db.coupon.groupBy({ by: ["promotionId"], where: { usedCount: { gt: 0 } }, _sum: { usedCount: true } });
  const usedBy = new Map(used.map((u) => [u.promotionId, u._sum.usedCount ?? 0]));
  const now = new Date();
  const href = (n: number) => `?${new URLSearchParams({ q, p, page: String(n) })}`;

  return (
    <div className="grid gap-5 min-w-0">
      <PromoTabs help="coupons" active="coupons" title="Κουπόνια" lead="Ένα κουπόνι είναι προσφορά με μηχανισμό «κουπόνι» και έναν ή πολλούς κωδικούς: κοινός κωδικός (π.χ. WELCOME10), προσωπικοί μίας χρήσης (εγγραφή, newsletter, σε email) ή παρτίδες για φυλλάδια και συνεργάτες." />
      <section className="grid gap-2">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Προσφορές-κουπόνια</h3>
        {promos.length ? (
          <ul className="m-0 p-0 list-none grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
            {promos.map((x) => (
              <li key={x.id} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-1">
                <div className="flex items-start justify-between gap-2"><Link href={`/admin/prosfores/${x.id}`} className="font-bold text-eu-ink hover:text-eu-blue hover:underline">{x.name}</Link><span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-13)] font-bold ${STATUS_LABEL[x.status as PromoStatus]?.tone ?? ""}`}>{STATUS_LABEL[x.status as PromoStatus]?.label ?? x.status}</span></div>
                <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{describePromo({ mechanism: x.mechanism, reward: x.reward as PromoReward, rules: x.rules as PromoRules })}</div>
                <div className="text-eu-muted text-[length:var(--fs-13)]"><span className="font-mono">{x.code}</span> · {x._count.coupons.toLocaleString("el-GR")} κωδικοί · {(usedBy.get(x.id) ?? 0).toLocaleString("el-GR")} χρήσεις</div>
                <Link href={`?p=${x.id}`} className="justify-self-start font-bold text-eu-blue text-[length:var(--fs-14)] hover:underline min-h-11 inline-flex items-center">Κωδικοί →</Link>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 rounded-2xl bg-white border border-eu-line p-5 text-eu-muted text-[length:var(--fs-14)]">Δεν υπάρχει προσφορά-κουπόνι. <Link href="/admin/prosfores/new?template=coupon-amount" className="text-eu-blue font-bold hover:underline">Φτιάξε μία</Link>.</p>}
      </section>

      <CouponTools promos={promos.filter((x) => ["active", "scheduled", "draft"].includes(x.status) && !x.held).map((x) => ({ id: x.id, code: x.code, name: x.name }))} />

      <section className="grid gap-2">
        <form className="flex flex-wrap gap-2">
          {p && <input type="hidden" name="p" value={p} />}
          <label className="sr-only" htmlFor="cp-q">Αναζήτηση</label>
          <input id="cp-q" name="q" defaultValue={q} placeholder="Κωδικός ή email" className="flex-1 min-w-[240px] rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)]" />
          <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:bg-eu-blue">Αναζήτηση</button>
          {(p || q) && <Link href="?" className="rounded-full border-2 border-eu-line px-4 min-h-11 inline-flex items-center font-bold text-[length:var(--fs-14)]">Όλοι</Link>}
        </form>
        <div className="rounded-2xl border border-eu-line bg-white overflow-hidden">
          <table className="eu-rtable w-full text-[length:var(--fs-14)]">
            <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-2 px-3">Κωδικός</th><th className="py-2 px-3">Προσφορά</th><th className="py-2 px-3">Είδος</th><th className="py-2 px-3">Για</th><th className="py-2 px-3 text-right">Χρήσεις</th><th className="py-2 px-3">Λήξη</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {rows.map((c) => { const expired = !!c.expiresAt && c.expiresAt < now; const spent = c.maxUses != null && c.usedCount >= c.maxUses; return (
                <tr key={c.id} className={`border-t border-eu-line ${expired || spent ? "text-eu-muted" : ""}`}>
                  <td className="py-2 px-3 font-mono font-bold">{c.code}</td>
                  <td data-label="Προσφορά" className="py-2 px-3"><Link href={`/admin/prosfores/${c.promotionId}`} className="hover:underline">{c.promotion.name}</Link></td>
                  <td data-label="Είδος" className="py-2 px-3">{c.kind === "shared" ? "Κοινός" : "Μοναδικός"}{c.trigger ? ` · ${TRIGGER[c.trigger] ?? c.trigger}` : ""}</td>
                  <td data-label="Για" className="py-2 px-3">{c.email ?? (c.customerId ? "πελάτης" : "—")}</td>
                  <td data-label="Χρήσεις" className="py-2 px-3 text-right tabular-nums">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td>
                  <td data-label="Λήξη" className="py-2 px-3 whitespace-nowrap">{c.expiresAt ? c.expiresAt.toLocaleDateString("el-GR") : "—"}{expired && " · έληξε"}</td>
                  <td className="py-2 px-3 text-right">{!expired && <ExpireCoupon id={c.id} code={c.code} />}</td>
                </tr>
              ); })}
              {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-eu-muted">Κανένας κωδικός.</td></tr>}
            </tbody>
          </table>
          <div className="flex justify-center px-3 py-3 border-t border-eu-line"><Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} label="κωδικοί" href={href} /></div>
        </div>
      </section>
    </div>
  );
}
