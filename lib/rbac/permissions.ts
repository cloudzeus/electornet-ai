/**
 * Permission catalogue of the back office. Keys are "<group>.<resource>.<action>".
 * Roles are rows in the database (seeded, editable in the UI); this list is the
 * single source of what can be granted. Add a permission here → it appears in
 * the role matrix after the next seed.
 */
export const PERMISSION_GROUPS = {
  cms: "Περιεχόμενο (CMS)",
  catalog: "Κατάλογος",
  orders: "Παραγγελίες",
  customers: "Πελάτες",
  stores: "Καταστήματα",
  marketing: "Marketing",
  settings: "Ρυθμίσεις",
  staff: "Χρήστες & ρόλοι",
  reports: "Αναφορές",
  service: "Service & εγγυήσεις",
} as const;
export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

export const PERMISSIONS: { key: string; group: PermissionGroup; description: string }[] = [
  { key: "cms.zones.read", group: "cms", description: "Προβολή ζωνών αρχικής" },
  { key: "cms.zones.write", group: "cms", description: "Επεξεργασία ζωνών αρχικής (σειρά, props, schedule)" },
  { key: "cms.zones.publish", group: "cms", description: "Δημοσίευση ζωνών" },
  { key: "cms.slides.write", group: "cms", description: "Hero slides" },
  { key: "cms.campaigns.write", group: "cms", description: "Καμπάνιες κατασκευαστών" },
  { key: "cms.brandstores.write", group: "cms", description: "Brand stores" },
  { key: "cms.menu.write", group: "cms", description: "Mega menu" },
  { key: "cms.pages.write", group: "cms", description: "Σελίδες, πολιτικές, FAQ" },
  { key: "cms.news.write", group: "cms", description: "Νέα & οδηγοί" },
  { key: "cms.copy.write", group: "cms", description: "Κείμενα UI (copy)" },
  { key: "cms.media.read", group: "cms", description: "Βιβλιοθήκη media: προβολή & επιλογή" },
  { key: "cms.media.write", group: "cms", description: "Βιβλιοθήκη media: upload, επεξεργασία, διαγραφή" },
  { key: "cms.publish", group: "cms", description: "Δημοσίευση οποιουδήποτε CMS εγγράφου" },
  { key: "catalog.products.read", group: "catalog", description: "Προβολή προϊόντων" },
  { key: "catalog.products.write", group: "catalog", description: "Επεξεργασία web πεδίων προϊόντων (περιγραφές, εικόνες, cutouts, SEO)" },
  { key: "catalog.promos.write", group: "catalog", description: "Stickers/promo (1+1, δώρο, διαγωνισμός, cashback)" },
  { key: "catalog.categories.write", group: "catalog", description: "Κατηγορίες, facets, οδηγοί κατηγορίας" },
  { key: "catalog.sync.run", group: "catalog", description: "Εκτέλεση συγχρονισμού ERP" },
  { key: "orders.read", group: "orders", description: "Προβολή παραγγελιών" },
  { key: "orders.write", group: "orders", description: "Αλλαγή κατάστασης, ακύρωση, επιστροφή" },
  { key: "orders.refund", group: "orders", description: "Επιστροφή χρημάτων" },
  { key: "customers.read", group: "customers", description: "Προβολή πελατών" },
  { key: "customers.write", group: "customers", description: "Επεξεργασία πελατών, συγκαταθέσεις, GDPR αιτήματα" },
  { key: "customers.export", group: "customers", description: "Εξαγωγή δεδομένων πελάτη" },
  { key: "stores.read", group: "stores", description: "Προβολή καταστημάτων" },
  { key: "stores.write", group: "stores", description: "Στοιχεία, ωράρια, υπηρεσίες καταστήματος" },
  { key: "stores.stock.read", group: "stores", description: "Απόθεμα ανά κατάστημα" },
  { key: "stores.pick.write", group: "stores", description: "«Επιλογή καταστήματος» σε προϊόντα" },
  { key: "marketing.newsletter.write", group: "marketing", description: "Newsletter, segments" },
  { key: "marketing.emails.write", group: "marketing", description: "Emails επικοινωνίας: προεπισκόπηση, δοκιμαστική αποστολή" },
  { key: "marketing.advisor.write", group: "marketing", description: "Ο Ερμής: κείμενα, ερωτήσεις, exit-intent, cart tips" },
  { key: "marketing.radar.read", group: "marketing", description: "Ραντάρ ζήτησης" },
  { key: "service.tickets.read", group: "service", description: "Αιτήματα service / βλάβες" },
  { key: "service.tickets.write", group: "service", description: "Ανάθεση, ραντεβού, κλείσιμο αιτημάτων" },
  { key: "service.warranties.write", group: "service", description: "Εγγυήσεις & επεκτάσεις" },
  { key: "settings.read", group: "settings", description: "Προβολή ρυθμίσεων" },
  { key: "settings.write", group: "settings", description: "Ρυθμίσεις site, motion, stickers" },
  { key: "settings.integrations.write", group: "settings", description: "ERP, PSP, courier, email integrations" },
  { key: "staff.read", group: "staff", description: "Προβολή χρηστών" },
  { key: "staff.write", group: "staff", description: "Χρήστες: δημιουργία, ρόλοι, απενεργοποίηση" },
  { key: "staff.roles.write", group: "staff", description: "Ρόλοι και δικαιώματα" },
  { key: "reports.read", group: "reports", description: "Αναφορές πωλήσεων, conversion, AI κόστος" },
  { key: "audit.read", group: "reports", description: "Audit log" },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Permission check with wildcard support ("cms.*", "*"). */
export function can(granted: Iterable<string>, key: string): boolean {
  for (const g of granted) {
    if (g === "*" || g === key) return true;
    if (g.endsWith(".*") && key.startsWith(g.slice(0, -1))) return true;
  }
  return false;
}
