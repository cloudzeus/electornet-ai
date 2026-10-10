/**
 * Ο «πανόπτης» της διαχείρισης: dashboard με ζώνες και components ανά ρόλο.
 * Εδώ ζουν μόνο οι ορισμοί (ασφαλές και για τον browser): ποια components υπάρχουν, ποιος τα βλέπει (δικαιώματα),
 * οι ζώνες και η προεπιλεγμένη διάταξη κάθε ρόλου. Τα δεδομένα τα φέρνει το lib/dashboard/data (server).
 */

export type WidgetSize = "s" | "m" | "l";
export type WidgetCategory = "Λειτουργία" | "Εγκρίσεις" | "Πωλήσεις" | "Προσφορές" | "Κατάλογος" | "Περιεχόμενο" | "Πελάτες" | "Σύστημα";

export interface WidgetDef {
  id: string;
  title: string;
  /** μία πρόταση: τι δείχνει και γιατί */
  help: string;
  /** εικονίδιο lucide (όνομα, αντιστοιχίζεται στο UI) */
  icon: string;
  category: WidgetCategory;
  /** αρκεί ΕΝΑ από αυτά τα δικαιώματα· κενό = όλοι */
  perms: string[];
  superOnly?: boolean;
  size: WidgetSize;
}

export const WIDGETS: WidgetDef[] = [
  // ---- Χρειάζονται εσένα
  { id: "approvals", title: "Εγκρίσεις", help: "Ό,τι περιμένει την έγκρισή σου: αλλαγές σε προσφορές, αρχική και σελίδες μαρκών.", icon: "stamp", category: "Εγκρίσεις", perms: ["catalog.promos.approve", "cms.zones.publish", "cms.publish", "cms.zones.write", "cms.brandstores.write"], size: "s" },
  { id: "orders-queue", title: "Παραγγελίες προς εκτέλεση", help: "Νέες, πληρωμένες και σε επεξεργασία — οι παλαιότερες πρώτα.", icon: "shopping-cart", category: "Λειτουργία", perms: ["orders.read"], size: "m" },
  { id: "shipments", title: "Αποστολές", help: "Παραγγελίες χωρίς voucher, vouchers για κλείσιμο ημέρας και αποστολές με πρόβλημα.", icon: "truck", category: "Λειτουργία", perms: ["orders.read"], size: "s" },
  { id: "pickups", title: "Παραλαβές από κατάστημα", help: "Παραγγελίες «παραλαβή από κατάστημα» που ετοιμάζονται ή περιμένουν τον πελάτη.", icon: "store", category: "Λειτουργία", perms: ["orders.read"], size: "s" },
  { id: "service", title: "Service & ραντεβού", help: "Ανοιχτά αιτήματα service, εγκαταστάσεις και ραντεβού της ημέρας.", icon: "wrench", category: "Λειτουργία", perms: ["service.tickets.read"], size: "m" },
  { id: "gdpr", title: "Αιτήματα GDPR", help: "Ανοιχτά αιτήματα δεδομένων και προθεσμίες 30 ημερών.", icon: "shield", category: "Πελάτες", perms: ["customers.read"], size: "s" },
  { id: "payments", title: "Πληρωμές & ERP", help: "Πληρωμές που απέτυχαν ή κρέμονται και παραγγελίες που δεν πέρασαν στο SoftOne.", icon: "credit-card", category: "Λειτουργία", perms: ["orders.read"], size: "s" },
  // ---- Σήμερα
  { id: "sales", title: "Πωλήσεις", help: "Τζίρος και παραγγελίες σήμερα και 7 ημερών, με σύγκριση με την προηγούμενη περίοδο.", icon: "trending-up", category: "Πωλήσεις", perms: ["orders.read", "reports.read"], size: "s" },
  { id: "orders-trend", title: "Παραγγελίες 14 ημερών", help: "Πλήθος παραγγελιών ανά ημέρα — για να φαίνεται αμέσως μια πτώση.", icon: "bar-chart", category: "Πωλήσεις", perms: ["orders.read", "reports.read"], size: "m" },
  { id: "promos", title: "Προσφορές τώρα", help: "Ενεργές προσφορές, όσες λήγουν σε 48 ώρες, όσες ξεκινούν και τα budget που τελειώνουν.", icon: "percent", category: "Προσφορές", perms: ["catalog.promos.write", "catalog.promos.approve"], size: "s" },
  { id: "ads", title: "Διαφημιστικές θέσεις", help: "Ενεργά banners με εμφανίσεις, κλικ και CTR.", icon: "megaphone", category: "Προσφορές", perms: ["catalog.promos.write"], size: "s" },
  { id: "customers", title: "Πελάτες & newsletter", help: "Νέοι λογαριασμοί, εγγραφές και επιβεβαιώσεις newsletter.", icon: "users", category: "Πελάτες", perms: ["customers.read", "marketing.newsletter.write"], size: "s" },
  { id: "warranty", title: "Επεκτάσεις εγγύησης", help: "Πληρωμένες επεκτάσεις του μήνα, εκκρεμότητες και συσκευές που λήγουν σύντομα.", icon: "badge-check", category: "Πωλήσεις", perms: ["catalog.products.read", "customers.read"], size: "s" },
  // ---- Παρακολούθηση
  { id: "catalog-health", title: "Ποιότητα καταλόγου", help: "Ενεργά προϊόντα χωρίς εικόνα, τιμή ή απόθεμα, χωρίς ενεργειακή ετικέτα ή με λάθος διαστάσεις.", icon: "package-search", category: "Κατάλογος", perms: ["catalog.products.read"], size: "m" },
  { id: "cms", title: "Περιεχόμενο σε εκκρεμότητα", help: "Πρόχειρα που δεν έχουν δημοσιευτεί και προγραμματισμένες δημοσιεύσεις.", icon: "file-pen", category: "Περιεχόμενο", perms: ["cms.zones.read", "cms.brandstores.write", "cms.slides.write", "cms.pages.write"], size: "s" },
  { id: "hero", title: "Hero slides", help: "Πόσα slides παίζουν, ποια έρχονται και ποια έληξαν.", icon: "gallery", category: "Περιεχόμενο", perms: ["cms.slides.write"], size: "s" },
  { id: "ar", title: "AR μοντέλα", help: "Προϊόντα με AR και μετατροπές που απέτυχαν ή περιμένουν.", icon: "box", category: "Κατάλογος", perms: ["catalog.products.read"], size: "s" },
  { id: "wishlist", title: "Ειδοποιήσεις τιμής", help: "Πόσοι περιμένουν πτώση τιμής ή επαναφορά αποθέματος.", icon: "heart", category: "Πελάτες", perms: ["reports.read"], size: "s" },
  { id: "ermis", title: "Ερμής & Snap", help: "Συνομιλίες του συμβούλου σήμερα και σαρώσεις Snap της εβδομάδας.", icon: "sparkles", category: "Πελάτες", perms: ["marketing.radar.read", "reports.read"], size: "s" },
  // ---- Σύστημα
  { id: "erp", title: "SoftOne", help: "Τελευταίοι συγχρονισμοί καταλόγου, αποτυχίες και πελάτες σε σύγκρουση.", icon: "refresh", category: "Σύστημα", perms: ["settings.integrations.write"], size: "s" },
  { id: "emails", title: "Emails", help: "Αποστολές του τελευταίου 24ώρου και όσα απέτυχαν.", icon: "mail", category: "Σύστημα", perms: ["marketing.emails.write"], size: "s" },
  { id: "ai", title: "Κόστος AI", help: "Χρέωση AI σήμερα και τον μήνα, ανά λειτουργία.", icon: "cpu", category: "Σύστημα", perms: ["reports.read"], size: "s" },
  { id: "backups", title: "Αντίγραφα ασφαλείας", help: "Πότε έγινε το τελευταίο backup και αν πέτυχε.", icon: "database", category: "Σύστημα", perms: [], superOnly: true, size: "s" },
  { id: "activity", title: "Τελευταίες ενέργειες", help: "Ποιος έκανε τι στη διαχείριση (audit), σε πραγματικό χρόνο.", icon: "history", category: "Σύστημα", perms: ["audit.read"], size: "m" },
  { id: "staff", title: "Προσωπικό", help: "Ποιοι συνδέθηκαν σήμερα και πόσοι λογαριασμοί είναι ενεργοί.", icon: "user-cog", category: "Σύστημα", perms: ["staff.read"], size: "s" },
  { id: "quick", title: "Γρήγορη πρόσβαση", help: "Οι σελίδες της διαχείρισης που μπορείς να ανοίξεις.", icon: "zap", category: "Σύστημα", perms: [], size: "m" },
];
export const widgetDef = (id: string) => WIDGETS.find((w) => w.id === id);

/* ---------------- καρτέλες ---------------- */
export type TabId = "overview" | "ops" | "sales" | "catalog" | "customers" | "system";
export const TABS: { id: TabId; title: string; help: string }[] = [
  { id: "overview", title: "Επισκόπηση", help: "Ό,τι καρφίτσωσες — σύρε εδώ μια κάρτα από άλλη καρτέλα για να την καρφιτσώσεις." },
  { id: "ops", title: "Λειτουργία", help: "Παραγγελίες, αποστολές, παραλαβές, service, εγκρίσεις." },
  { id: "sales", title: "Πωλήσεις & Προσφορές", help: "Τζίρος, τάσεις, προσφορές, διαφημίσεις, εγγυήσεις." },
  { id: "catalog", title: "Κατάλογος & Περιεχόμενο", help: "Ποιότητα καταλόγου, AR, πρόχειρα, hero." },
  { id: "customers", title: "Πελάτες", help: "Λογαριασμοί, newsletter, GDPR, ειδοποιήσεις, Ερμής." },
  { id: "system", title: "Σύστημα", help: "SoftOne, emails, κόστος AI, backups, ενέργειες προσωπικού." },
];
/** η «σπιτική» καρτέλα κάθε component (όπου μπαίνει αν δεν το έχει μετακινήσει ο χρήστης) */
export const HOME_TAB: Record<string, Exclude<TabId, "overview">> = {
  approvals: "ops", "orders-queue": "ops", shipments: "ops", pickups: "ops", service: "ops", payments: "ops",
  sales: "sales", "orders-trend": "sales", promos: "sales", ads: "sales", warranty: "sales",
  "catalog-health": "catalog", ar: "catalog", cms: "catalog", hero: "catalog",
  customers: "customers", gdpr: "customers", wishlist: "customers", ermis: "customers",
  erp: "system", emails: "system", ai: "system", backups: "system", activity: "system", staff: "system", quick: "system",
};

export type DashItem = { id: string; size?: WidgetSize };
export type DashTab = { id: Exclude<TabId, "overview">; items: DashItem[] };
/** pinned = η Επισκόπηση (σειρά + μέγεθος) · tabs = όλα τα υπόλοιπα · hidden = όσα αφαίρεσε ο χρήστης */
export type DashLayout = { pinned: DashItem[]; tabs: DashTab[]; hidden: string[] };

/** Τι καρφιτσώνει κάθε ρόλος στην Επισκόπηση (οι καρτέλες έχουν πάντα ό,τι επιτρέπουν τα δικαιώματα). */
export const ROLE_PINS: Record<string, string[]> = {
  "super-admin": ["approvals", "orders-queue", "sales", "orders-trend", "shipments", "payments", "promos", "catalog-health", "erp", "backups"],
  admin: ["approvals", "orders-queue", "sales", "orders-trend", "shipments", "payments", "promos", "catalog-health", "erp"],
  manager: ["orders-queue", "shipments", "pickups", "service", "sales", "orders-trend", "payments", "warranty", "gdpr"],
  marketer: ["approvals", "promos", "ads", "sales", "orders-trend", "customers", "cms", "ermis"],
  editor: ["approvals", "cms", "hero", "catalog-health", "ar"],
  employee: ["pickups", "orders-queue", "service", "warranty"],
};
export const ROLE_DEFAULTS = ROLE_PINS;
const ROLE_ORDER = ["super-admin", "admin", "manager", "marketer", "editor", "employee"];
export const primaryRole = (roles: string[]) => ROLE_ORDER.find((r) => roles.includes(r)) ?? roles[0] ?? "employee";
export const codeDefault = (role: string): DashLayout => ({ pinned: (ROLE_PINS[role] ?? ["approvals", "orders-queue", "sales"]).map((id) => ({ id })), tabs: [], hidden: [] });

/**
 * Καθαρή διάταξη: γνωστά/επιτρεπτά components, χωρίς διπλά ανά καρτέλα· όσα επιτρέπονται και δεν τα έχει κρύψει ο
 * χρήστης μπαίνουν στη «σπιτική» τους καρτέλα (έτσι τα νέα components εμφανίζονται μόνα τους).
 */
export function normalizeLayout(raw: unknown, allowed?: (id: string) => boolean): DashLayout {
  const o = (raw ?? {}) as Partial<DashLayout>;
  const ok = (id: unknown): id is string => typeof id === "string" && !!widgetDef(id) && (!allowed || allowed(id));
  const clean = (list: unknown, seen: Set<string>): DashItem[] => (Array.isArray(list) ? list : [])
    .filter((it: DashItem) => it && ok(it.id) && !seen.has(it.id))
    .map((it: DashItem) => { seen.add(it.id); return it.size && it.size !== widgetDef(it.id)!.size ? { id: it.id, size: it.size } : { id: it.id }; });
  const hidden = [...new Set((Array.isArray(o.hidden) ? o.hidden : []).filter(ok))];
  const pinned = clean(o.pinned, new Set());
  const placed = new Set<string>();
  const tabs: DashTab[] = TABS.filter((t) => t.id !== "overview").map((t) => ({ id: t.id as DashTab["id"], items: clean((Array.isArray(o.tabs) ? o.tabs : []).find((x) => x?.id === t.id)?.items, placed) }));
  for (const w of WIDGETS) if (ok(w.id) && !placed.has(w.id) && !hidden.includes(w.id)) tabs.find((t) => t.id === HOME_TAB[w.id])!.items.push({ id: w.id });
  return { pinned, tabs, hidden: hidden.filter((id) => !placed.has(id)) };
}

/* ---------------- δεδομένα ενός component (ίδιο σχήμα για όλα → ένας κοινός τρόπος απόδοσης) ---------------- */
export type Tone = "ok" | "warn" | "bad" | "info" | "muted";
export interface WidgetData {
  /** ο κύριος αριθμός (π.χ. τζίρος σήμερα) */
  headline?: { value: string; label: string; delta?: { text: string; dir: "up" | "down" | "flat"; good: boolean } };
  /** μικροί μετρητές, ο καθένας με σύνδεσμο· `of` = σύνολο → μικρή μπάρα αναλογίας */
  stats?: { label: string; value: string; tone?: Tone; href?: string; n?: number; of?: number }[];
  /** μικρή καμπύλη τάσης (π.χ. 14 ημέρες) */
  series?: { label: string; value: number; display: string }[];
  /** κατανομή σε μία ράβδο (π.χ. αποστολές ανά κατάσταση) */
  parts?: { label: string; value: number; tone: Tone }[];
  /** ουρά / λίστα */
  rows?: { title: string; sub?: string; meta?: string; tone?: Tone; href?: string }[];
  /** μικρό ραβδόγραμμα (χρονοσειρά) */
  bars?: { label: string; value: number; display: string }[];
  /** μήνυμα όταν δεν υπάρχει τίποτα (θετικό: «όλα εντάξει») */
  empty?: string;
  /** πόσα υπάρχουν συνολικά στην ουρά (όταν δείχνονται λιγότερα) */
  total?: number;
  href?: string; hrefLabel?: string;
  note?: string;
  /** σήμα στον τίτλο: πόσα θέλουν ενέργεια */
  badge?: { n: number; tone: Tone };
  error?: string;
}
