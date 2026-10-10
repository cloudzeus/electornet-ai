import { Wrench } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getServicesForAdmin } from "@/lib/services/catalog";
import { ServicesEditor } from "@/components/admin/services/ServicesEditor";

export const metadata = { title: "Υπηρεσίες" };
export const dynamic = "force-dynamic";

/** Οι υπηρεσίες Euronics: ένας κατάλογος για σελίδες υπηρεσιών, πρόσθετες υπηρεσίες, αρχική, hero, προσφορές και Ερμή. */
export default async function ServicesAdminPage() {
  const user = await requirePermission("catalog.products.read");
  const { all, fromDb } = await getServicesForAdmin();
  return (
    <div className="grid gap-5 max-w-5xl">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Wrench className="size-4" aria-hidden /> Εμπόριο</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">Υπηρεσίες</h1>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Μία λίστα για όλο το site: οι σελίδες «Υπηρεσίες», οι πρόσθετες υπηρεσίες με τιμή στη σελίδα προϊόντος και στο checkout, η ενότητα «Υπηρεσίες» της αρχικής, το πλακίδιο του hero, οι δωρεάν υπηρεσίες των Προσφορών και ο Ερμής. Η σειρά εδώ είναι η σειρά παντού.</p>
      </div>
      <ServicesEditor initial={all.map((s) => ({ id: s.id, slug: s.slug, title: s.title, blurb: s.blurb, body: s.body ?? "", priceFrom: s.priceFrom != null ? String(s.priceFrom) : "", steps: s.steps ?? [], faq: s.faq ?? [], addonAt: s.addonAt ?? [], image: s.image ?? "", active: s.active, used: s.usedInOrders ?? 0 }))} fromDb={fromDb} canWrite={can(user.permissions, "cms.pages.write")} />
    </div>
  );
}
