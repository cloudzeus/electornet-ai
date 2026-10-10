/**
 * Βοήθεια & wiki της διαχείρισης. Δύο πηγές:
 *  - **γραμμένοι οδηγοί** (lib/help/content): τι κάνει η σελίδα, «Πώς κάνω…» βήματα, τα σημεία της σελίδας (components)
 *  - **παραγόμενα** (lib/help/generated.json, `npm run help:gen`): κάθε σελίδα της διαχείρισης με τίτλο, περιγραφή από
 *    τον κώδικα, δικαίωμα, θέση στο μενού, τα σημεία βοήθειας (data-help) που υπάρχουν, ιστορικό αλλαγών (git), screenshots.
 * Σελίδα χωρίς γραμμένο οδηγό εμφανίζεται κανονικά με τα παραγόμενα στοιχεία.
 */

/** Ένα σημείο της σελίδας (component) — ίδιο κλειδί με το `data-help="…"` στο UI, για «Δείξε μου». */
export interface HelpPart { key: string; title: string; text: string }
/** Μια εργασία βήμα-βήμα («Πώς προσθέτω…»). */
export interface HelpTask { title: string; steps: string[]; link?: { label: string; href: string } }

export interface HelpPage {
  /** η διαδρομή της σελίδας, όπως στο app (π.χ. "/admin/cms/home", "/admin/catalog/[id]") */
  route: string;
  title: string;
  summary: string;
  tasks?: HelpTask[];
  parts?: HelpPart[];
  tips?: string[];
  related?: { label: string; href: string }[];
  keywords?: string[];
  /** επιπλέον αρχεία που «ανήκουν» στη σελίδα (για το ιστορικό αλλαγών), π.χ. "components/admin/cms/HomeEditor.tsx" */
  files?: string[];
}

/** Ένα γενικό άρθρο του wiki (π.χ. «Πρόχειρο & δημοσίευση»). */
export type HelpBlock =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { tip: string }
  | { h: string }
  | { links: { label: string; href: string }[] };
export interface HelpTopic { slug: string; title: string; summary: string; icon: string; body: HelpBlock[]; keywords?: string[] }

/* ---------------- παραγόμενα ---------------- */
export interface GenChange { hash: string; date: string; text: string }
export interface GenRoute {
  route: string; slug: string; file: string;
  title: string; doc: string;
  /** "*" = κάθε συνδεδεμένος · "super-admin" · αλλιώς κλειδί δικαιώματος */
  perm: string;
  nav: { group: string; label: string } | null;
  dynamic: boolean;
  helpKeys: string[];
  changes: GenChange[];
  updatedAt: string | null;
  shots: { desktop?: string; mobile?: string };
}
export interface Generated { generatedAt: string; routes: GenRoute[]; recent: (GenChange & { routes: string[] })[]; helpKeys: Record<string, string[]> }

export const routeSlug = (route: string) => route.replace(/^\/admin\/?/, "").replace(/\[([^\]]+)\]/g, "$1").replace(/\//g, ".") || "dashboard";
