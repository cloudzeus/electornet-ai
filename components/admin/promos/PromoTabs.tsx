import Link from "next/link";
import { ListChecks, CalendarRange, TicketPercent, Tags, ShieldCheck, FlaskConical, BarChart3, LayoutTemplate, Megaphone, Users, LifeBuoy, Sparkles, Wrench, MonitorSmartphone, FileSpreadsheet, type LucideIcon } from "lucide-react";
import type { PAGE_HELP } from "@/lib/promo/help";

type Page = { key: string; href: string; label: string; Icon: LucideIcon; hidden?: boolean };
type Group = { key: string; label: string; Icon: LucideIcon; pages: Page[] };

/**
 * Η ενότητα «Προσφορές» σε 6 περιοχές εργασίας αντί για 12 καρτέλες: Προσφορές (λίστα, ημερολόγιο), Κουπόνια,
 * Στόχευση (κοινά, προσωπικές), Στο site (θέσεις, landing pages, ετικέτες), Αναφορές, Εργαλεία.
 */
const GROUPS: Group[] = [
  { key: "promos", label: "Προσφορές", Icon: ListChecks, pages: [
    { key: "list", href: "/admin/prosfores", label: "Λίστα", Icon: ListChecks },
    { key: "calendar", href: "/admin/prosfores/imerologio", label: "Ημερολόγιο & επικαλύψεις", Icon: CalendarRange },
    { key: "excel", href: "/admin/prosfores/excel", label: "Από Excel", Icon: FileSpreadsheet, hidden: true },
    { key: "ermis", href: "/admin/prosfores/ermis", label: "Με τον Ερμή", Icon: Sparkles, hidden: true },
  ] },
  { key: "coupons", label: "Κουπόνια", Icon: TicketPercent, pages: [{ key: "coupons", href: "/admin/prosfores/kouponia", label: "Κουπόνια", Icon: TicketPercent }] },
  { key: "target", label: "Στόχευση", Icon: Users, pages: [
    { key: "segments", href: "/admin/prosfores/koina", label: "Κοινά πελατών", Icon: Users },
    { key: "personal", href: "/admin/prosfores/prosopikes", label: "Προσωπικές προσφορές", Icon: Sparkles },
  ] },
  { key: "site", label: "Στο site", Icon: MonitorSmartphone, pages: [
    { key: "ads", href: "/admin/prosfores/theseis", label: "Διαφημιστικές θέσεις", Icon: Megaphone },
    { key: "landing", href: "/admin/prosfores/selides", label: "Landing pages", Icon: LayoutTemplate },
    { key: "tags", href: "/admin/prosfores/etiketes", label: "Ετικέτες", Icon: Tags },
  ] },
  { key: "report", label: "Αναφορές", Icon: BarChart3, pages: [{ key: "report", href: "/admin/prosfores/anafores", label: "Αναφορές", Icon: BarChart3 }] },
  { key: "tools", label: "Εργαλεία", Icon: Wrench, pages: [
    { key: "sim", href: "/admin/prosfores/prosomoiotis", label: "Προσομοιωτής καλαθιού", Icon: FlaskConical },
    { key: "rules", href: "/admin/prosfores/kanones", label: "Κανόνες & δικλείδες", Icon: ShieldCheck },
    { key: "help", href: "/admin/prosfores/voitheia", label: "Οδηγοί & γλωσσάρι", Icon: LifeBuoy },
  ] },
];
export type PromoTab = Group["pages"][number]["key"];

/**
 * Κεφαλίδα + πλοήγηση της ενότητας «Προσφορές» — ίδια σε κάθε σελίδα της. Συμπαγής: τίτλος και ενέργειες σε μία γραμμή,
 * περιοχές σε μία σειρά, και οι σελίδες της περιοχής (όταν είναι πάνω από μία) σε δεύτερη. Η βοήθεια της σελίδας είναι
 * στο «Βοήθεια» (F1) της κεφαλίδας της διαχείρισης.
 */
export function PromoTabs({ active, title, lead, actions }: { active: PromoTab | string; title: string; lead?: string; actions?: React.ReactNode; help?: keyof typeof PAGE_HELP }) {
  const group = GROUPS.find((g) => g.pages.some((p) => p.key === active)) ?? GROUPS[0];
  const subs = group.pages.filter((p) => !p.hidden || p.key === active);
  return (
    <div className="grid gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 grid">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">{title}</h2>
          {lead && <p className="m-0 mt-0.5 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[90ch] leading-snug">{lead}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <nav data-help="promo.nav" aria-label="Περιοχές προσφορών" className="grid gap-2 border-b border-eu-line">
        <ul className="m-0 p-0 list-none flex flex-wrap gap-x-1 gap-y-1 -mb-px">
          {GROUPS.map((g) => {
            const on = g.key === group.key;
            return (
              <li key={g.key}>
                <Link href={g.pages[0].href} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 px-3 min-h-11 border-b-[3px] font-bold text-[length:var(--fs-14)] ${on ? "border-eu-navy text-eu-navy" : "border-transparent text-eu-ink-3 hover:text-eu-blue hover:border-eu-line-2"}`}>
                  <g.Icon className="size-4" aria-hidden /> {g.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {subs.length > 1 && (
        <nav aria-label={`Σελίδες: ${group.label}`} className="flex flex-wrap gap-1.5 -mt-1">
          {subs.map((p) => (
            <Link key={p.key} href={p.href} aria-current={p.key === active ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${p.key === active ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip hover:text-eu-blue"}`}>
              <p.Icon className="size-3.5" aria-hidden /> {p.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
