/**
 * Role definitions (data) — the client's list. Permissions accept exact keys
 * or wildcards ("cms.*", "*"). «super-admin» is the system role: always "*",
 * cannot be edited or deleted from the UI. All other roles are editable in
 * /admin/roles; this file only sets their starting point (re-seeding resets it).
 */
export const ROLES: { key: string; name: string; description: string; system?: boolean; permissions: string[] }[] = [
  {
    key: "super-admin",
    name: "Super Admin",
    description: "Πλήρης πρόσβαση, ρόλοι & δικαιώματα, integrations. Ρόλος συστήματος.",
    system: true,
    permissions: ["*"],
  },
  {
    key: "admin",
    name: "Admin",
    description: "Όλη η διαχείριση εκτός από ρόλους/δικαιώματα και integrations.",
    permissions: ["cms.*", "catalog.*", "orders.*", "customers.*", "stores.*", "marketing.*", "service.*", "settings.read", "settings.write", "staff.read", "staff.write", "reports.read", "audit.read"],
  },
  {
    key: "manager",
    name: "Manager",
    description: "Λειτουργία: παραγγελίες, πελάτες, καταστήματα, service, αναφορές.",
    permissions: ["orders.*", "customers.read", "customers.write", "stores.*", "service.*", "reports.read", "catalog.products.read", "catalog.promos.write", "marketing.radar.read", "staff.read", "audit.read", "cms.media.read"],
  },
  {
    key: "marketer",
    name: "Marketer",
    description: "Καμπάνιες, ζώνες αρχικής, stickers/promo, newsletter, ο Ερμής, ραντάρ.",
    permissions: ["cms.*", "marketing.*", "catalog.products.read", "catalog.promos.write", "reports.read"],
  },
  {
    key: "editor",
    name: "Editor",
    description: "Περιεχόμενο: κείμενα, σελίδες, νέα, slides, brand stores, web πεδία προϊόντων. Χωρίς δημοσίευση.",
    permissions: ["cms.zones.read", "cms.zones.write", "cms.slides.write", "cms.menu.write", "cms.pages.write", "cms.news.write", "cms.copy.write", "cms.brandstores.write", "cms.media.read", "cms.media.write", "catalog.products.read", "catalog.products.write", "catalog.categories.write"],
  },
  {
    key: "employee",
    name: "Employee",
    description: "Υπάλληλος καταστήματος: παραγγελίες, πελάτες, απόθεμα, αιτήματα service.",
    permissions: ["orders.read", "orders.write", "customers.read", "stores.read", "stores.stock.read", "service.tickets.read", "service.tickets.write", "catalog.products.read"],
  },
  {
    key: "customer",
    name: "Customer",
    description: "Πελάτης e-shop (λογαριασμός storefront). Καμία πρόσβαση στη διαχείριση.",
    permissions: [],
  },
];

/** Super-admin account created by the seed. Password comes from SEED_SUPERADMIN_PASSWORD in .env (never in code). */
export const SUPER_ADMIN = { email: "gkozyris@i4ria.com", name: "Γιάννης Κοζύρης" };
