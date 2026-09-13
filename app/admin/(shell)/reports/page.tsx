import Link from "next/link";
import { Bot, Heart, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";

export const metadata = { title: "Αναφορές" };

export default async function ReportsPage() {
  await requirePermission("reports.read");
  const reports = [
    { href: "/admin/reports/ai", icon: Bot, title: "Κόστος AI", desc: "Χρεωμένο κόστος ανά ημέρα, μοντέλο και λειτουργία, σε € με την ισοτιμία της ημέρας." },
    { href: "/admin/reports/wishlist", icon: Heart, title: "Αγαπημένα πελατών", desc: "Τα προϊόντα που αποθηκεύουν οι πελάτες, πόσοι περιμένουν πτώση τιμής." },
  ];
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Αναφορές</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Αναφορές</h2>
      </div>
      <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-3 gap-3">
        {reports.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="group flex items-start gap-3 rounded-2xl bg-white border border-eu-line p-4 h-full hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
              <r.icon className="size-6 text-eu-blue shrink-0" aria-hidden />
              <div className="min-w-0 flex-1"><div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">{r.title}</div><p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)]">{r.desc}</p></div>
              <ChevronRight className="size-5 text-eu-muted group-hover:text-eu-blue shrink-0 mt-1" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Πωλήσεις, conversion και ραντάρ ζήτησης προστίθενται με τον κατάλογο και τις παραγγελίες.</p>
    </>
  );
}
