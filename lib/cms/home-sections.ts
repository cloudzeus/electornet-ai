import type { BrandBlock, Device, Schedule } from "./brand-store";
import type { WidgetInstance } from "./zones";

/**
 * Η αρχική σελίδα στη διαχείριση (Περιεχόμενο → Ζώνες αρχικής): οι ΕΝΟΤΗΤΕΣ του σχεδίου (slides, ticker, κατηγορίες,
 * προσφορές, καμπάνιες…) με σειρά, απόκρυψη, ημερομηνίες, συσκευές, κοινό και κείμενα, και ανάμεσά τους COMPONENTS
 * της κοινής συλλογής (ίδια με σελίδες μαρκών / ζώνες σελίδων). Κάθε component έχει ζώνη «top» (στην κορυφή) ή
 * «after:<ενότητα>» — έτσι ακολουθεί την ενότητα όταν αλλάζει η σειρά. Καθαρές συναρτήσεις (editor + βιτρίνα).
 */
export type HomeSectionId = "hero" | "ticker" | "categories" | "deals" | "campaigns" | "services" | "stores" | "guides" | "news" | "ad-strip" | "newsletter";
export type HomeAudience = "all" | "guest" | "customer";

export interface HomeSection {
  id: HomeSectionId;
  enabled?: boolean;
  hideOn?: Device[];
  audience?: HomeAudience;
  schedule?: Schedule;
  /** αλλαγές του διαχειριστή πάνω στις προεπιλογές της ενότητας (κείμενα, πλήθος, καμπάνιες) */
  props?: Record<string, unknown>;
}
export interface HomeDoc { sections: HomeSection[]; blocks: BrandBlock[] }

export type SectionField =
  | { key: string; kind: "text"; label: string; help?: string; max?: number }
  | { key: string; kind: "number"; label: string; help?: string; min: number; max: number; unit?: string }
  | { key: string; kind: "lines"; label: string; help?: string; max?: number }
  | { key: string; kind: "link"; label: string; help?: string }
  | { key: string; kind: "campaigns"; label: string; help?: string }
  | { key: string; kind: "category-cells"; label: string; help?: string };

export interface SectionDef {
  id: HomeSectionId; label: string; help: string;
  /** το widget της αρχικής (lib/cms/render.tsx) με τις προεπιλεγμένες ρυθμίσεις — "ad-strip" αποδίδεται χωριστά */
  widget: Omit<WidgetInstance, "id"> | null;
  /** επιπλέον widgets της ίδιας ενότητας (π.χ. οδηγοί: έξυπνοι + λίστα) */
  extra?: Omit<WidgetInstance, "id">[];
  fields: SectionField[];
  /** πού ρυθμίζεται το περιεχόμενο, όταν δεν ρυθμίζεται εδώ */
  managedAt?: { label: string; href: string };
}

export const HOME_SECTIONS: SectionDef[] = [
  { id: "hero", label: "Κεντρικά slides (hero)", help: "Το μεγάλο bento στην κορυφή: slides, προσφορά ημέρας, κοντινό κατάστημα, υπηρεσίες.", widget: { type: "bento-hero", zoneNo: 4, props: { slides: "all", intervalMs: 6000 } }, fields: [{ key: "intervalMs", kind: "number", label: "Χρόνος ανά slide", min: 3, max: 20, unit: "δευτ.", help: "Πόσο μένει κάθε slide πριν αλλάξει." }], managedAt: { label: "Hero slides", href: "/admin/cms/slides" } },
  { id: "ticker", label: "Κίτρινο ticker", help: "Λωρίδα που κυλά με σύντομα εμπορικά μηνύματα.", widget: { type: "ticker", zoneNo: 5, props: { items: ["Δωρεάν μεταφορά συσκευών εντός περιφέρειας", "Δόσεις χωρίς κάρτα έως 24 μήνες", "Επίσημη εγγύηση αντιπροσωπείας", "Φύλαξη συσκευών μέχρι να ετοιμαστεί ο χώρος σου", "Παραλαβή σε 2 ώρες"] } }, fields: [{ key: "items", kind: "lines", label: "Μηνύματα", help: "Ένα σύντομο μήνυμα ανά γραμμή (3–6 προτείνονται).", max: 10 }] },
  { id: "categories", label: "Πλέγμα κατηγοριών", help: "Τυπογραφικό πλέγμα με τις κύριες κατηγορίες· μία τονίζεται σκούρα.", widget: { type: "category-grid", zoneNo: 6, props: {} }, fields: [{ key: "cells", kind: "category-cells", label: "Κατηγορίες του πλέγματος", help: "Σύρε για σειρά · ★ = τονισμένη (σκούρο κελί) · μάτι = ορατή ή κρυφή. Πλήθος προϊόντων και σύνδεσμος ενημερώνονται μόνα τους από τον κατάλογο." }, { key: "title", kind: "text", label: "Τίτλος ενότητας", max: 80, help: "Κενό = «Ό,τι χρειάζεται το σπίτι σου, σε εννέα κατηγορίες.» με τον αριθμό των ορατών κατηγοριών." }] },
  { id: "deals", label: "Προσφορές της εβδομάδας", help: "Προϊόντα της εβδομαδιαίας προσφοράς με πραγματική αντίστροφη μέτρηση.", widget: { type: "deals-rail", zoneNo: 7, props: { title: "Προσφορές της εβδομάδας" }, query: { kind: "tag", value: "weekly-deals", limit: 4, pin: ["p-inventor-ikura"] } }, fields: [{ key: "title", kind: "text", label: "Τίτλος", max: 60 }, { key: "limit", kind: "number", label: "Πλήθος προϊόντων", min: 2, max: 12 }] },
  { id: "campaigns", label: "Καμπάνιες κατασκευαστών", help: "Κάρτες με key visuals κατασκευαστών (Samsung, Miele…) προς τις αντίστοιχες λίστες.", widget: { type: "campaign-spotlight", zoneNo: 8, props: { kicker: "Τρέχουν τώρα", title: "Καμπάνιες κατασκευαστών", link: { label: "Όλες οι προσφορές", href: "/prosfores" }, campaigns: [
    { id: "samsung-vision-ai", brand: "Samsung", title: "Samsung Vision AI is here", text: "QLED · Neo QLED · Neo QLED 8K · OLED · The Frame.", cta: "Ανακάλυψε τις νέες AI τηλεοράσεις", href: "/k/eikona-ixos/tileoraseis", image: "/img/campaigns/samsung-vision-ai.jpg", alt: "Samsung Vision AI — QLED, Neo QLED, Neo QLED 8K, OLED, The Frame" },
    { id: "samsung-oled-s95f", brand: "Samsung", title: "OLED S95F", text: "Απογείωσε την κινηματογραφική σου εμπειρία, με Glare Free Technology.", cta: "Δες τις OLED S95F", href: "/k/eikona-ixos/tileoraseis", image: "/img/campaigns/samsung-oled-s95f.jpg", alt: "Samsung OLED S95F — Απογείωσε την κινηματογραφική σου εμπειρία" },
    { id: "miele-25y-motor", brand: "Miele", title: "25 χρόνια εγγύηση μοτέρ", text: "Σε πλυντήρια, στεγνωτήρια και πλυντήρια-στεγνωτήρια Miele, από 1 Οκτωβρίου 2025.", cta: "Δες τα πλυντήρια Miele", href: "/k/leykes-syskeyes/plyntiria", image: "/img/campaigns/miele-25y-motor.jpg", alt: "Miele — 25 χρόνια εγγύηση μοτέρ" },
    { id: "dell-monitors", brand: "Dell", title: "Οθόνες κορυφαίων επιδόσεων", text: "S2721HN · S2421HN · E2221HN · E2421HN.", cta: "Δες τις οθόνες Dell", href: "/k/computing/othones", image: "/img/campaigns/dell-monitors.jpg", alt: "Dell Οθόνες Κορυφαίων Επιδόσεων" },
  ] } }, fields: [{ key: "kicker", kind: "text", label: "Μικρός τίτλος", max: 40 }, { key: "title", kind: "text", label: "Τίτλος", max: 60 }, { key: "link", kind: "link", label: "Σύνδεσμος «Όλες»" }, { key: "campaigns", kind: "campaigns", label: "Καμπάνιες", help: "Κάθε κάρτα: εικόνα (key visual), μάρκα, τίτλος, κείμενο, κουμπί και σύνδεσμος." }] },
  { id: "services", label: "Υπηρεσίες", help: "Σκούρη ζώνη με τις υπηρεσίες Euronics (εγκατάσταση, μεταφορά, επέκταση εγγύησης…).", widget: { type: "services-band", zoneNo: 9, props: { limit: 6 } }, fields: [{ key: "limit", kind: "number", label: "Πλήθος υπηρεσιών", min: 3, max: 9 }] },
  { id: "stores", label: "Εντοπισμός καταστήματος", help: "Το πιο κοντινό κατάστημα στον επισκέπτη, με χάρτη και ωράριο.", widget: { type: "store-finder", zoneNo: 10, props: {} }, fields: [] },
  { id: "guides", label: "Οδηγοί αγοράς", help: "Έξυπνοι οδηγοί και οι πιο πρόσφατοι οδηγοί αγοράς.", widget: { type: "smart-guides", zoneNo: 11, props: {} }, extra: [{ type: "guides", zoneNo: 11, props: {}, visibility: { hideOnSaveData: true } }], fields: [] },
  { id: "news", label: "Νέα & ανακοινώσεις", help: "Τα πιο πρόσφατα νέα.", widget: { type: "news-band", zoneNo: 12, props: { limit: 3 } }, fields: [{ key: "limit", kind: "number", label: "Πλήθος νέων", min: 1, max: 6 }] },
  { id: "ad-strip", label: "Διαφημιστική λωρίδα", help: "Η διαφημιστική θέση «home-strip» των Προσφορών: όποιο banner είναι ενεργό εκεί.", widget: null, fields: [], managedAt: { label: "Προσφορές → Διαφημιστικές θέσεις", href: "/admin/prosfores" } },
  { id: "newsletter", label: "Newsletter", help: "Εγγραφή στο newsletter, πριν το footer.", widget: { type: "newsletter", zoneNo: 13, props: {} }, fields: [] },
];
export const sectionDef = (id: string) => HOME_SECTIONS.find((s) => s.id === id);
export const TOP_ZONE = "top";
export const afterZone = (id: HomeSectionId) => `after:${id}`;

/** Η σημερινή αρχική: όλες οι ενότητες με τη σειρά του σχεδίου, χωρίς components. */
export const defaultHomeDoc = (): HomeDoc => ({ sections: HOME_SECTIONS.map((s) => ({ id: s.id })), blocks: [] });

/** Καθαρό έγγραφο: κάθε ενότητα μία φορά (όσες προστίθενται στον κώδικα μπαίνουν στο τέλος), components σε υπαρκτή ζώνη. */
export function normalizeHomeDoc(raw: unknown): HomeDoc {
  const o = (raw ?? {}) as { sections?: unknown; blocks?: unknown };
  const seen = new Set<string>();
  const sections: HomeSection[] = [];
  for (const x of Array.isArray(o.sections) ? o.sections : []) {
    const s = x as HomeSection;
    if (!s || !sectionDef(s.id) || seen.has(s.id)) continue;
    seen.add(s.id);
    sections.push(s);
  }
  for (const d of HOME_SECTIONS) if (!seen.has(d.id)) sections.push({ id: d.id });
  const zones = new Set([TOP_ZONE, ...HOME_SECTIONS.map((d) => afterZone(d.id))]);
  const blocks = (Array.isArray(o.blocks) ? o.blocks : []).filter((b): b is BrandBlock => !!b && typeof b === "object" && typeof (b as BrandBlock).type === "string").map((b) => (zones.has(b.zone ?? "") ? b : { ...b, zone: TOP_ZONE }));
  return { sections, blocks };
}

/** Εμφανίζεται τώρα σε αυτό το κοινό; (Οι συσκευές κρύβονται με CSS — βλ. hideClass.) */
export function audienceOk(a: HomeAudience | undefined, viewer: "guest" | "customer") { return !a || a === "all" || a === viewer; }
export function sectionActive(s: HomeSection, now: Date, viewer: "guest" | "customer") {
  if (s.enabled === false) return false;
  if (s.schedule?.from && new Date(s.schedule.from) > now) return false;
  if (s.schedule?.to && new Date(s.schedule.to) < now) return false;
  return audienceOk(s.audience, viewer);
}

/** Το widget της ενότητας με τις αλλαγές του διαχειριστή (κείμενα, πλήθος, καμπάνιες). */
export function sectionWidget(s: HomeSection): WidgetInstance | null {
  const d = sectionDef(s.id);
  if (!d?.widget) return null;
  const p = { ...d.widget.props, ...(s.props ?? {}) } as Record<string, unknown>;
  if (s.id === "hero" && typeof p.intervalMs === "number" && p.intervalMs < 100) p.intervalMs = p.intervalMs * 1000; // δευτερόλεπτα στη φόρμα
  if (s.id === "ticker" && Array.isArray(p.items)) p.items = (p.items as unknown[]).map(String).map((x) => x.trim()).filter(Boolean);
  const query = d.widget.query && s.id === "deals" && typeof p.limit === "number" ? { ...d.widget.query, limit: p.limit } : d.widget.query;
  return { ...d.widget, id: `home-${s.id}`, label: d.label, props: p, query };
}

/** Τα επιπλέον widgets της ενότητας (χωρίς αλλαγές του διαχειριστή). */
export const sectionExtras = (s: HomeSection): WidgetInstance[] => (sectionDef(s.id)?.extra ?? []).map((w, i) => ({ ...w, id: `home-${s.id}-${i + 1}` }));

/** Κλάσεις απόκρυψης ανά συσκευή — ίδιες με τα components (κινητό < 768 · tablet 768–1023 · υπολογιστής ≥ 1024). */
const HIDE: Record<Device, string> = { mobile: "max-md:hidden", tablet: "md:max-lg:hidden", desktop: "lg:hidden" };
export const hideClass = (hideOn?: Device[]) => (hideOn ?? []).map((d) => HIDE[d]).join(" ");
