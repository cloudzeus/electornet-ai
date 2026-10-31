import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, History } from "lucide-react";
import { db } from "@/lib/db";
import { requirePortalUser, portalBase } from "@/lib/partner-portal/session";
import { hoursOf, servicesOf } from "@/lib/partner-portal/store-profile";
import { StoreWizard } from "@/components/synergaton/StoreWizard";
import { ago, Badge, Card, CardHead, PageHead } from "@/components/synergaton/ui";

export const metadata = { title: "Κατάστημα" };
const FIELD: Record<string, string> = { phone: "Σταθερό", mobile: "Κινητό", email: "Email", hours: "Ωράριο", services: "Υπηρεσίες", notes: "Σημείωμα" };

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const base = await portalBase();
  const { id } = await params;
  const s = await db.store.findFirst({ where: { id, partnerId: u.partner.id }, include: { branch: { select: { s1BranchId: true, name: true } } } });
  if (!s) notFound();
  const history = await db.partnerChange.findMany({ where: { partnerId: u.partner.id, entity: "Store", entityId: s.id }, orderBy: { createdAt: "desc" }, take: 30 });
  const accounts = await db.partnerAccount.findMany({ where: { id: { in: [...new Set(history.map((h) => h.accountId).filter((x): x is string => !!x))] } }, select: { id: true, contact: { select: { name: true } } } });
  const who = (h: (typeof history)[number]) => (h.accountId ? accounts.find((a) => a.id === h.accountId)?.contact.name ?? "Μέλος" : h.staffId ? "Euronics" : "—");
  return (
    <div className="grid gap-5 min-w-0">
      <Link href={`${base}/katastimata`} className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11 w-fit"><ChevronLeft className="size-4" aria-hidden /> Όλα τα καταστήματα</Link>
      <PageHead eyebrow={[s.city, s.branch?.s1BranchId ? `Υποκατάστημα ${s.branch.s1BranchId}` : null].filter(Boolean).join(" · ")} title={s.name} sub={[s.address, s.zip, s.city].filter(Boolean).join(", ")}
        action={<>{s.active ? <Badge tone="good">Ορατό στο eshop</Badge> : <Badge tone="neutral">Κρυφό στο eshop</Badge>}{s.active && <Link href={`/katastimata/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline min-h-11">Σελίδα στο eshop <ExternalLink className="size-4" aria-hidden /></Link>}</>} />
      <div data-help="portal.store-wizard"><StoreWizard storeId={s.id} storeName={s.name} initial={{ phone: s.phone ?? "", mobile: s.mobile ?? "", email: s.email ?? "", hours: hoursOf(s.hours), services: servicesOf(s.services), notes: s.notes ?? "" }} /></div>
      <Card data-help="portal.store-history">
        <CardHead icon={History} title="Ιστορικό αλλαγών" sub="Οι αλλαγές ισχύουν χωρίς έγκριση· εδώ φαίνεται ποιος άλλαξε τι." />
        <ol className="m-0 p-0 list-none px-4 sm:px-5 py-4 grid gap-2.5">
          {history.map((h) => (
            <li key={h.id} className="text-[length:var(--fs-14)] flex flex-wrap gap-x-2"><b>{FIELD[h.field] ?? h.field}</b><span className="text-eu-ink-3">· {who(h)} · {ago(h.createdAt)}</span></li>
          ))}
          {!history.length && <li className="text-eu-ink-3 text-[length:var(--fs-14)]">Καμία αλλαγή ακόμη.</li>}
        </ol>
      </Card>
    </div>
  );
}
