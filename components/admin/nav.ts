import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck, BadgePercent, BookOpen, BarChart3, Box, Boxes, Database, DatabaseBackup, FileSpreadsheet, Images, LayoutDashboard, LayoutTemplate, Mail, Megaphone, Package, Radar,
  RefreshCw, ScanText, ScrollText, Settings, ShieldCheck, ShoppingBag, Sticker, Store, Truck, Users, Wrench, Zap,
} from "lucide-react";
import type { Feature } from "@/lib/admin/features";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** permission needed to see it (wildcards allowed) */
  perm: string;
  /** δεν έχει υλοποιηθεί ακόμη — δεν εμφανίζεται στο μενού */
  soon?: boolean;
  /** visible only to the super-admin role, regardless of permissions */
  superOnly?: boolean;
  /** εμφανίζεται μόνο όταν η λειτουργία είναι ενεργή στις Ρυθμίσεις */
  feature?: Feature;
}
export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Το μενού της διαχείρισης, ανά περιοχή εργασίας. Ένα στοιχείο φαίνεται μόνο αν ο χρήστης έχει το δικαίωμα ΚΑΙ η
 * λειτουργία είναι ενεργή στις Ρυθμίσεις (`feature`)· όσα είναι «σύντομα» δεν φαίνονται καθόλου.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  { label: "Dashboard", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "*" }] },
  {
    label: "Πωλήσεις & πελάτες",
    items: [
      { href: "/admin/orders", label: "Παραγγελίες", icon: ShoppingBag, perm: "orders.read", soon: true },
      { href: "/admin/customers", label: "Πελάτες", icon: Users, perm: "customers.read" },
      { href: "/admin/stores", label: "Καταστήματα", icon: Store, perm: "stores.read" },
      { href: "/admin/gdpr", label: "GDPR", icon: ShieldCheck, perm: "customers.read" },
      { href: "/admin/service", label: "Service & εγγυήσεις", icon: Wrench, perm: "service.tickets.read", soon: true },
    ],
  },
  {
    label: "Αποστολές",
    items: [
      { href: "/admin/apostoles", label: "Αποστολές", icon: Truck, perm: "catalog.products.read" },
      { href: "/admin/apostoles/vouchers", label: "Vouchers · Γενική Ταχυδρομική", icon: Truck, perm: "orders.read", feature: "geniki" },
    ],
  },
  {
    label: "Κατάλογος",
    items: [
      { href: "/admin/catalog", label: "Προϊόντα", icon: Package, perm: "catalog.products.read" },
      { href: "/admin/catalog/sets", label: "Bundles · sets", icon: Boxes, perm: "catalog.products.read" },
      { href: "/admin/catalog/templates", label: "Templates & excel", icon: FileSpreadsheet, perm: "catalog.products.read" },
      { href: "/admin/catalog/banners", label: "Απόδελτίωση banners", icon: ScanText, perm: "catalog.products.write" },
      { href: "/admin/eprel", label: "Ενεργειακές ετικέτες (EPREL)", icon: Zap, perm: "catalog.products.read" },
      { href: "/admin/ar", label: "AR · στον χώρο σου", icon: Box, perm: "catalog.products.read" },
    ],
  },
  {
    label: "Προσφορές & υπηρεσίες",
    items: [
      { href: "/admin/prosfores", label: "Προσφορές & κουπόνια", icon: BadgePercent, perm: "catalog.promos.write" },
      { href: "/admin/stickers", label: "Stickers", icon: Sticker, perm: "catalog.promos.write" },
      { href: "/admin/ypiresies", label: "Υπηρεσίες", icon: Wrench, perm: "catalog.products.read" },
      { href: "/admin/epektasi-eggyisis", label: "Επέκταση εγγύησης", icon: ShieldCheck, perm: "catalog.products.read" },
    ],
  },
  {
    label: "Περιεχόμενο",
    items: [
      { href: "/admin/cms/home", label: "Ζώνες αρχικής", icon: LayoutTemplate, perm: "cms.zones.read" },
      { href: "/admin/cms/slides", label: "Hero slides", icon: LayoutTemplate, perm: "cms.slides.write" },
      { href: "/admin/cms/campaigns", label: "Καμπάνιες", icon: Megaphone, perm: "cms.campaigns.write", soon: true },
      { href: "/admin/cms/brand-stores", label: "Σελίδες μαρκών", icon: Store, perm: "cms.brandstores.write" },
      { href: "/admin/cms/pages", label: "Ζώνες σελίδων", icon: LayoutTemplate, perm: "cms.pages.write" },
      { href: "/admin/cms/components", label: "Συλλογή components", icon: LayoutTemplate, perm: "cms.pages.write" },
      { href: "/admin/cms/copy", label: "Κείμενα UI", icon: ScrollText, perm: "cms.copy.write" },
      { href: "/admin/media", label: "Media", icon: Images, perm: "cms.media.read" },
    ],
  },
  {
    label: "Marketing & αναφορές",
    items: [
      { href: "/admin/newsletter", label: "Newsletter", icon: Megaphone, perm: "marketing.newsletter.write" },
      { href: "/admin/emails", label: "Emails πελατών", icon: Mail, perm: "marketing.emails.write" },
      { href: "/admin/radar", label: "Ραντάρ ζήτησης", icon: Radar, perm: "marketing.radar.read", feature: "advisor" },
      { href: "/admin/reports", label: "Αναφορές", icon: BarChart3, perm: "reports.read" },
    ],
  },
  {
    label: "SoftOne ERP",
    items: [
      { href: "/admin/softone", label: "Βασικοί πίνακες", icon: Database, perm: "settings.integrations.write", feature: "softone" },
      { href: "/admin/softone/brand/logos", label: "Λογότυπα μαρκών", icon: BadgeCheck, perm: "settings.integrations.write", feature: "softone" },
      { href: "/admin/softone/sync", label: "Συγχρονισμοί & ιστορικό", icon: RefreshCw, perm: "settings.integrations.write", feature: "softone" },
      { href: "/admin/softone/catalog", label: "Κατάλογος & CCC", icon: Package, perm: "catalog.products.read", feature: "softone" },
      { href: "/admin/softone/customers", label: "Πελάτες ERP", icon: Users, perm: "settings.integrations.write", feature: "softone" },
      { href: "/admin/softone/orders", label: "Παραγγελίες προς ERP", icon: ShoppingBag, perm: "settings.integrations.write", soon: true, feature: "softone" },
    ],
  },
  { label: "Βοήθεια", items: [{ href: "/admin/help", label: "Wiki & οδηγοί", icon: BookOpen, perm: "*" }] },
  {
    label: "Διαχείριση",
    items: [
      { href: "/admin/settings", label: "Ρυθμίσεις & διασυνδέσεις", icon: Settings, perm: "*", superOnly: true },
      { href: "/admin/settings/softone", label: "SoftOne · σύνδεση", icon: Database, perm: "*", superOnly: true },
      { href: "/admin/staff", label: "Χρήστες", icon: Users, perm: "staff.read" },
      { href: "/admin/roles", label: "Ρόλοι & δικαιώματα", icon: ShieldCheck, perm: "staff.roles.write" },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText, perm: "audit.read" },
      { href: "/admin/backups", label: "Backups βάσης", icon: DatabaseBackup, perm: "*", superOnly: true },
    ],
  },
];

/** Τα στοιχεία του μενού που βλέπει ο χρήστης: δικαίωμα + ενεργή λειτουργία, χωρίς όσα δεν έχουν υλοποιηθεί. */
export function visibleNav(user: { roles: string[]; permissions: string[] }, features: Partial<Record<Feature, boolean>>, can: (perms: string[], key: string) => boolean): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.soon && (!i.feature || features[i.feature]) && (i.superOnly ? user.roles.includes("super-admin") : can(user.permissions, i.perm))),
  })).filter((g) => g.items.length);
}
