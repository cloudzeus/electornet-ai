import Link from "next/link";
import { Plus, Mail, Building2, Link2, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Πελάτες" };
export const dynamic = "force-dynamic";

/** Retail customers: search, filters, ERP link state. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; p?: string }> }) {
  const user = await requirePermission("customers.read");
  const { q = "", f = "", p = "1" } = await searchParams;
  const page = Math.max(1, Number(p) || 1), take = 50;
  const where: Prisma.CustomerWhereInput = {};
  if (q) where.OR = [{ email: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { mobile: { contains: q } }, { vatNumber: { contains: q } }, { erpCode: { contains: q, mode: "insensitive" } }];
  if (f === "business") where.type = "business";
  if (f === "newsletter") where.newsletter = true;
  if (f === "unlinked") where.erpTrdr = null;
  if (f === "failed") where.erpSyncStatus = "failed";
  if (f === "blocked") where.status = "blocked";
  if (f === "anonymised") where.status = "anonymised";
  const [rows, total, stats] = await Promise.all([
    db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { _count: { select: { orders: true, devices: true, tickets: true } }, preferredStore: { select: { city: true } } } }),
    db.customer.count({ where }),
    Promise.all([db.customer.count(), db.customer.count({ where: { type: "business" } }), db.customer.count({ where: { newsletter: true } }), db.customer.count({ where: { erpTrdr: null, status: "active" } }), db.customer.count({ where: { erpSyncStatus: "failed" } }), db.gdprRequest.count({ where: { status: { in: ["open", "verifying", "in-progress"] } } })]),
  ]);
  const [all, business, newsletter, unlinked, failed, gdprOpen] = stats;
  const chip = (on: boolean) => `rounded-full px-3 min-h-9 inline-flex items-center gap-1 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  const link = (nf: string) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(nf ? { f: nf } : {}) })}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Λιανική</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Πελάτες</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Λογαριασμοί e-shop και πελάτες καταστημάτων, συνδεδεμένοι με το SoftOne (CUSTOMER/TRDR). Συναινέσεις με αποδεικτικά, συσκευές και εγγυήσεις, service, πόντοι, GDPR.</p>
        </div>
        <div className="flex gap-2">
          {gdprOpen > 0 && <Link href="/admin/gdpr" className="inline-flex items-center gap-2 rounded-full bg-eu-red/10 text-eu-red font-extrabold text-[length:var(--fs-14)] px-4 min-h-11"><AlertTriangle className="size-4" aria-hidden /> {gdprOpen} ανοιχτά GDPR</Link>}
          {can(user.permissions, "customers.write") && <Link href="/admin/customers/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέος πελάτης</Link>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2 flex-1 min-w-[240px]"><input type="hidden" name="f" value={f} /><input name="q" defaultValue={q} placeholder="Όνομα, email, τηλέφωνο, ΑΦΜ, κωδικός ERP…" className="flex-1 rounded-full border-2 border-eu-line px-4 min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" /><button type="submit" className="rounded-full bg-eu-navy text-white font-bold px-4 min-h-10 text-[length:var(--fs-14)]">Αναζήτηση</button></form>
        <Link href={link("")} className={chip(!f)}>Όλοι {all}</Link>
        <Link href={link("business")} className={chip(f === "business")}><Building2 className="size-3.5" aria-hidden /> Εταιρείες {business}</Link>
        <Link href={link("newsletter")} className={chip(f === "newsletter")}><Mail className="size-3.5" aria-hidden /> Newsletter {newsletter}</Link>
        <Link href={link("unlinked")} className={chip(f === "unlinked")}><Link2 className="size-3.5" aria-hidden /> Χωρίς SoftOne {unlinked}</Link>
        <Link href={link("failed")} className={chip(f === "failed")}>Αποτυχία sync {failed}</Link>
        <Link href={link("blocked")} className={chip(f === "blocked")}>Μπλοκαρισμένοι</Link>
        <Link href={link("anonymised")} className={chip(f === "anonymised")}>Ανωνυμοποιημένοι</Link>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[length:var(--fs-14)]">
            <thead><tr className="text-left text-eu-muted"><th className="p-3 font-bold">Πελάτης</th><th className="p-3 font-bold">Επικοινωνία</th><th className="p-3 font-bold">ΑΦΜ / SoftOne</th><th className="p-3 font-bold">Παραγγελίες</th><th className="p-3 font-bold">Πόντοι</th><th className="p-3 font-bold">Κατάστημα</th><th className="p-3 font-bold">Κατάσταση</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-eu-line-2 hover:bg-eu-surface/60">
                  <td className="p-3"><Link href={`/admin/customers/${c.id}`} className="font-bold text-eu-navy hover:underline">{c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`}</Link><div className="text-eu-muted text-[length:var(--fs-13)]">#{c.number} · {c.type === "business" ? `${c.lastName} ${c.firstName}` : c.source}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</div></td>
                  <td className="p-3"><div className="truncate max-w-[240px]">{c.email}</div><div className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{c.mobile ?? c.phone ?? "—"}</div></td>
                  <td className="p-3 tabular-nums"><div>{c.vatNumber ?? "—"}</div><div className={`text-[length:var(--fs-13)] ${c.erpSyncStatus === "failed" ? "text-eu-red font-bold" : c.erpTrdr ? "text-eu-green" : "text-eu-muted"}`}>{c.erpTrdr ? `${c.erpCode ?? "TRDR"} · ${c.erpSyncStatus ?? "linked"}` : "χωρίς σύνδεση"}</div></td>
                  <td className="p-3 tabular-nums">{c._count.orders}<div className="text-eu-muted text-[length:var(--fs-13)]">{c._count.devices} συσκευές · {c._count.tickets} service</div></td>
                  <td className="p-3 tabular-nums">{c.loyaltyPoints.toLocaleString("el-GR")}<div className="text-eu-muted text-[length:var(--fs-13)]">{c.loyaltyTier ?? "—"}</div></td>
                  <td className="p-3 text-eu-ink-2">{c.preferredStore?.city ?? "—"}</td>
                  <td className="p-3">{c.status === "active" ? <span className="text-eu-green font-bold">Ενεργός</span> : c.status === "blocked" ? <span className="text-eu-red font-bold">Μπλοκ</span> : <span className="text-eu-muted font-bold">Ανώνυμος</span>}{c.newsletter && <div className="text-eu-muted text-[length:var(--fs-13)]">newsletter</div>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-eu-muted">Κανένας πελάτης με αυτά τα κριτήρια.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-eu-line text-eu-muted text-[length:var(--fs-13)]"><span>{total} πελάτες</span>{total > take && <span className="inline-flex gap-2">{page > 1 && <Link href={`?${new URLSearchParams({ q, f, p: String(page - 1) })}`} className="font-bold text-eu-blue">Προηγούμενη</Link>}{page * take < total && <Link href={`?${new URLSearchParams({ q, f, p: String(page + 1) })}`} className="font-bold text-eu-blue">Επόμενη</Link>}</span>}</div>
      </div>
    </>
  );
}
