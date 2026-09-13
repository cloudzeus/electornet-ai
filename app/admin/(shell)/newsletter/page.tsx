import Link from "next/link";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { NewsletterAdmin } from "@/components/admin/customers/NewsletterAdmin";
import { StatTile } from "@/components/admin/charts/Charts";


const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
export const metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  await requirePermission("marketing.newsletter.write");
  const { q = "", s = "" } = await searchParams;
  const where = { ...(s ? { status: s } : {}), ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { firstName: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [rows, counts, last30] = await Promise.all([
    db.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { customer: { select: { id: true, firstName: true, lastName: true } }, consents: { orderBy: { at: "desc" }, take: 1 } } }),
    db.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    db.newsletterSubscriber.count({ where: { status: "subscribed", confirmedAt: { gte: daysAgo(30) } } }),
  ]);
  const n = (st: string) => counts.find((c) => c.status === st)?._count._all ?? 0;
  const emails = await db.emailLog.findMany({ where: { template: "newsletter-confirm" }, orderBy: { at: "desc" }, take: 10 });
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Marketing</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Newsletter</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Εγγραφές με double opt-in. Κάθε εγγραφή, επιβεβαίωση και διαγραφή καταγράφεται στο ledger συναινέσεων με IP, συσκευή, URL και έκδοση κειμένου. Οι πελάτες με λογαριασμό συνδέονται αυτόματα.</p>
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-5 gap-3">
        <StatTile label="Ενεργοί εγγεγραμμένοι" value={n("subscribed").toLocaleString("el-GR")} accent />
        <StatTile label="Νέοι (30 ημ.)" value={last30.toLocaleString("el-GR")} />
        <StatTile label="Εκκρεμεί επιβεβαίωση" value={n("pending").toLocaleString("el-GR")} />
        <StatTile label="Διαγραφές" value={n("unsubscribed").toLocaleString("el-GR")} />
        <StatTile label="Bounces / παράπονα" value={(n("bounced") + n("complained")).toLocaleString("el-GR")} />
      </div>
      <NewsletterAdmin q={q} status={s} rows={rows.map((r) => ({ id: r.id, email: r.email, firstName: r.firstName, status: r.status, source: r.source, lists: r.lists, confirmedAt: r.confirmedAt?.toISOString() ?? null, unsubscribedAt: r.unsubscribedAt?.toISOString() ?? null, unsubscribeReason: r.unsubscribeReason, createdAt: r.createdAt.toISOString(), customer: r.customer ? { id: r.customer.id, name: `${r.customer.lastName} ${r.customer.firstName}` } : null, last: r.consents[0] ? { ip: r.consents[0].ip, os: r.consents[0].os, browser: r.consents[0].browser, method: r.consents[0].method, at: r.consents[0].at.toISOString() } : null }))} />
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τελευταία emails επιβεβαίωσης</h3>
        {emails.length ? <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{emails.map((e) => <li key={e.id} className="grid grid-cols-[150px_minmax(0,1fr)_110px] gap-2 border-t border-eu-line-2 py-1"><span className="tabular-nums text-eu-muted">{e.at.toLocaleString("el-GR")}</span><span className="truncate">{e.to}{e.error ? <span className="text-eu-red"> — {e.error}</span> : null}</span><span className={`font-bold ${e.status === "sent" ? "text-eu-green" : e.status === "failed" ? "text-eu-red" : "text-eu-muted"}`}>{e.status}</span></li>)}</ul> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κανένα email ακόμη.</p>}
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η αποστολή γίνεται με τον πάροχο των Ρυθμίσεων → Email & SMS. Μέχρι να ρυθμιστεί, τα emails καταγράφονται ως «skipped». <Link href="/admin/settings/email" className="text-eu-blue underline">Ρυθμίσεις email</Link></p>
      </section>
    </>
  );
}
