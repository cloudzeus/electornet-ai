import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { CustomerWorkspace } from "@/components/admin/customers/CustomerWorkspace";
import { getS1Config } from "@/lib/softone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Πελάτης" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("customers.read");
  const { id } = await params;
  const { tab } = await searchParams;
  const stores = await db.store.findMany({ where: { active: true }, orderBy: [{ region: "asc" }, { city: "asc" }], select: { id: true, name: true, city: true } });
  const perms = { write: can(user.permissions, "customers.write"), export: can(user.permissions, "customers.export"), service: can(user.permissions, "service.tickets.write") };
  if (id === "new") return (<><CustomerWorkspace customer={null} stores={stores} perms={perms} erpConfigured={false} /></>);
  const c = await db.customer.findUnique({ where: { id }, include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, consents: { orderBy: { at: "desc" }, take: 200 }, devices: { orderBy: { purchasedAt: "desc" } }, tickets: { orderBy: { createdAt: "desc" } }, loyalty: { orderBy: { at: "desc" }, take: 100 }, customerNotes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] }, events: { orderBy: { at: "desc" }, take: 100 }, logins: { orderBy: { at: "desc" }, take: 50 }, gdprRequests: { orderBy: { requestedAt: "desc" } }, subscriptions: true, social: true, wishlists: { include: { items: { orderBy: { addedAt: "desc" } } } }, purchases: { where: { parentId: null }, orderBy: { date: "desc" }, take: 200, include: { lines: { orderBy: { lineNo: "asc" } }, docs: { orderBy: { date: "asc" }, select: { id: true, kind: true, docNo: true, date: true, total: true, seriesName: true } } } }, orders: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, status: true, total: true, createdAt: true, fulfilment: true } }, preferredStore: { select: { name: true, city: true } } } });
  if (!c) notFound();
  const j = JSON.parse(JSON.stringify(c)); // dates → ISO strings, Decimal → string
  return (
    <>
      <CustomerWorkspace customer={j} stores={stores} perms={perms} erpConfigured={!!(await getS1Config())} initialTab={tab} />
    </>
  );
}
