import type { LucideIcon } from "lucide-react";
import { Images, LayoutDashboard, Sticker, LayoutTemplate, Package, ShoppingBag, Users, Store, Megaphone, Wrench, Settings, ShieldCheck, BarChart3, ScrollText, Radar } from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** permission needed to see it (wildcards allowed) */
  perm: string;
  soon?: boolean;
  /** visible only to the super-admin role, regardless of permissions */
  superOnly?: boolean;
}
export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/** Sidebar map of the back office. Items appear only when the staff member has the permission. */
export const ADMIN_NAV: AdminNavGroup[] = [
  { label: "Επισκόπηση", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "*" }] },
  {
    label: "Περιεχόμενο",
    items: [
      { href: "/admin/cms/zones", label: "Ζώνες αρχικής", icon: LayoutTemplate, perm: "cms.zones.read", soon: true },
      { href: "/admin/cms/slides", label: "Hero slides", icon: LayoutTemplate, perm: "cms.slides.write", soon: true },
      { href: "/admin/cms/campaigns", label: "Καμπάνιες", icon: Megaphone, perm: "cms.campaigns.write", soon: true },
      { href: "/admin/cms/brand-stores", label: "Brand stores", icon: Store, perm: "cms.brandstores.write", soon: true },
      { href: "/admin/cms/copy", label: "Κείμενα UI", icon: ScrollText, perm: "cms.copy.write", soon: true },
      { href: "/admin/media", label: "Media", icon: Images, perm: "cms.media.read" },
    ],
  },
  {
    label: "Εμπόριο",
    items: [
      { href: "/admin/catalog", label: "Κατάλογος", icon: Package, perm: "catalog.products.read", soon: true },
      { href: "/admin/stickers", label: "Stickers", icon: Sticker, perm: "catalog.promos.write" },
      { href: "/admin/orders", label: "Παραγγελίες", icon: ShoppingBag, perm: "orders.read", soon: true },
      { href: "/admin/customers", label: "Πελάτες", icon: Users, perm: "customers.read", soon: true },
      { href: "/admin/stores", label: "Καταστήματα", icon: Store, perm: "stores.read", soon: true },
      { href: "/admin/service", label: "Service & εγγυήσεις", icon: Wrench, perm: "service.tickets.read", soon: true },
    ],
  },
  {
    label: "Marketing & αναφορές",
    items: [
      { href: "/admin/radar", label: "Ραντάρ ζήτησης", icon: Radar, perm: "marketing.radar.read" },
      { href: "/admin/reports", label: "Αναφορές", icon: BarChart3, perm: "reports.read" },
    ],
  },
  {
    label: "Διαχείριση",
    items: [
      { href: "/admin/settings", label: "Ρυθμίσεις & διασυνδέσεις", icon: Settings, perm: "*", superOnly: true },
      { href: "/admin/staff", label: "Χρήστες", icon: Users, perm: "staff.read" },
      { href: "/admin/roles", label: "Ρόλοι & δικαιώματα", icon: ShieldCheck, perm: "staff.roles.write" },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit.read" },
    ],
  },
];
