import Link from "next/link";
import { ListChecks, CalendarRange, TicketPercent, Tags, ShieldCheck, FlaskConical, BarChart3, LayoutTemplate, Megaphone } from "lucide-react";

const TABS = [
  { key: "list", href: "/admin/prosfores", label: "Προσφορές", Icon: ListChecks },
  { key: "calendar", href: "/admin/prosfores/imerologio", label: "Ημερολόγιο", Icon: CalendarRange },
  { key: "coupons", href: "/admin/prosfores/kouponia", label: "Κουπόνια", Icon: TicketPercent },
  { key: "tags", href: "/admin/prosfores/etiketes", label: "Ετικέτες", Icon: Tags },
  { key: "sim", href: "/admin/prosfores/prosomoiotis", label: "Προσομοιωτής", Icon: FlaskConical },
  { key: "rules", href: "/admin/prosfores/kanones", label: "Κανόνες", Icon: ShieldCheck },
  { key: "report", href: "/admin/prosfores/anafores", label: "Αναφορές", Icon: BarChart3 },
  { key: "landing", href: "/admin/prosfores/selides", label: "Landing pages", Icon: LayoutTemplate },
  { key: "ads", href: "/admin/prosfores/theseis", label: "Διαφημιστικές θέσεις", Icon: Megaphone },
] as const;
export type PromoTab = (typeof TABS)[number]["key"];

/** Η πλοήγηση της ενότητας «Προσφορές» — ίδια σε κάθε σελίδα της. */
export function PromoTabs({ active, title, lead, actions }: { active: PromoTab; title: string; lead?: string; actions?: React.ReactNode }) {
  return (
    <div className="grid gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Προσφορές</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">{title}</h2>
          {lead && <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav aria-label="Ενότητες προσφορών" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] border ${t.key === active ? "bg-eu-navy text-white border-eu-navy" : "bg-white text-eu-ink-2 border-eu-line hover:border-eu-navy"}`}>
            <t.Icon className="size-4" aria-hidden /> {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
