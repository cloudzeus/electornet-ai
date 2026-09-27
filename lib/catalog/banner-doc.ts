/**
 * Το έγγραφο της απόδελτίωσης όπως το διορθώνει ο διαχειριστής στο εργαλείο — κοινό για server και browser (καθαρό module).
 * Κάθε ενότητα γίνεται μία `ProductSection`. Τα πλαίσια είναι κλάσματα 0…1 της αρχικής εικόνας (x, y, πλάτος, ύψος).
 */
export type Box = [number, number, number, number];

/**
 * Διατάξεις ενότητας στη σελίδα προϊόντος. Τις διαλέγει ο σχεδιαστής AI (lib/catalog/banner-design.ts) ανάλογα με το
 * περιεχόμενο — ο διαχειριστής μπορεί να τις αλλάξει στο εργαλείο.
 */
export type SectionLayout = "hero" | "split" | "features" | "stats" | "gallery" | "badges" | "text";
export const LAYOUTS: { key: SectionLayout; label: string; hint: string }[] = [
  { key: "hero", label: "Μεγάλη φωτογραφία", hint: "φωτογραφία σε όλο το πλάτος, τίτλος από κάτω — για το άνοιγμα της σελίδας" },
  { key: "split", label: "Φωτογραφία δίπλα στο κείμενο", hint: "εναλλάξ αριστερά / δεξιά" },
  { key: "features", label: "Πλέγμα χαρακτηριστικών", hint: "εικονίδια με λεζάντες σε κάρτες" },
  { key: "stats", label: "Μεγάλα νούμερα", hint: "τα βασικά νούμερα σε μεγάλα γράμματα" },
  { key: "gallery", label: "Γκαλερί", hint: "πολλές φωτογραφίες με λεζάντες" },
  { key: "badges", label: "Πιστοποιήσεις / λογότυπα", hint: "μικρές εικόνες σε σειρά" },
  { key: "text", label: "Μόνο κείμενο", hint: "στενή στήλη για άνετη ανάγνωση" },
];
export interface Stat { value: string; label: string }

export interface StudioText { id: string; text: string; /** το πρωτότυπο, όταν το `text` είναι μετάφραση */ original?: string; box: Box | null }
export interface StudioFeature { id: string; label: string; original?: string; /** σύντομη περιγραφή κάτω από τον τίτλο (κάρτες λειτουργιών) */ detail?: string; /** banner από το οποίο κόβεται το εικονίδιο, όταν διαφέρει από το banner της ενότητας */ src?: string; box: Box | null; icon: Box | null; include: boolean; includeIcon: boolean }
/** Μέγεθος φωτογραφίας στη σελίδα (επιλογή του διαχειριστή στην προεπισκόπηση) — πάντα έως το πραγματικό της πλάτος. */
export type ImageSize = "s" | "m" | "l" | "full";
export const IMAGE_SIZES: { key: ImageSize; label: string }[] = [{ key: "s", label: "Μικρή" }, { key: "m", label: "Μεσαία" }, { key: "l", label: "Μεγάλη" }, { key: "full", label: "Πλήρες πλάτος" }];
export interface StudioImage { id: string; box: Box; alt: string; kind: string; overlayText: boolean; include: boolean; size?: ImageSize }
export interface StudioSection {
  id: string;
  include: boolean;
  /** διάταξη στη σελίδα (κενό = αυτόματη επιλογή) */
  layout?: SectionLayout;
  /** μεγάλα νούμερα, αυτούσια από το κείμενο */
  stats?: Stat[];
  /** σειρά στη σελίδα (ο σχεδιαστής ταξινομεί τις ενότητες ΟΛΩΝ των banners μαζί) */
  rank?: number;
  /** η διάταξη / σειρά προτάθηκε από τον σχεδιαστή AI (για ένδειξη στο εργαλείο) */
  designedBy?: "ai" | "rules";
  /** γιατί ο σχεδιαστής την έβγαλε εκτός (διπλή, χωρίς πληροφορία) */
  dropReason?: string;
  /** επικεφαλίδα από κλειστό λεξιλόγιο (HEADINGS), όταν το banner δεν είχε τίτλο — π.χ. πλέγμα λειτουργιών */
  heading?: string;
  /** ενότητα που έφτιαξε ο σχεδιαστής ενώνοντας μονές λειτουργίες από ΔΙΑΦΟΡΕΤΙΚΑ banners (ξαναφτιάχνεται σε κάθε σχεδιασμό) */
  crossMerged?: boolean;
  /** η ενότητα μπήκε ως κάρτα στην ενότητα με αυτό το id */
  mergedInto?: string;
  title: StudioText | null;
  subtitle: StudioText | null;
  paragraphs: StudioText[];
  features: StudioFeature[];
  footnote: StudioText | null;
  images: StudioImage[];
}
export interface StudioDoc { sourceUrl: string; width: number; height: number; lang: string; sections: StudioSection[] }

/**
 * Επικεφαλίδες που μπορεί να δώσει ο σχεδιαστής σε ενότητα χωρίς τίτλο. Κλειστή λίστα, γιατί ο σχεδιαστής δεν γράφει
 * δικό του κείμενο — ονομάζει μόνο την ομάδα.
 */
export const HEADINGS = ["Βασικά χαρακτηριστικά", "Λειτουργίες", "Έξυπνες λειτουργίες", "Τεχνολογία", "Άνεση", "Εξοικονόμηση ενέργειας", "Καθαρός αέρας", "Υγιεινή", "Εικόνα", "Ήχος", "Gaming", "Συνδεσιμότητα", "Σχεδιασμός", "Εγκατάσταση", "Ασφάλεια", "Φροντίδα ρούχων", "Μαγείρεμα", "Διατήρηση τροφίμων", "Προδιαγραφές", "Πιστοποιήσεις"] as const;

/** Ό,τι γράφεται στη βάση ως ProductSection (και ό,τι αποδίδει η σελίδα προϊόντος). */
export interface SectionImage { url: string; width: number; height: number; alt: string; size?: ImageSize }
export interface SectionFeature { label: string; text?: string; iconUrl?: string; iconW?: number; iconH?: number; /** μόνο στην προεπισκόπηση του εργαλείου: το id της κάρτας για επιλογή */ fid?: string }
export interface PublishedSection { id: string; title: string | null; subtitle: string | null; body: string | null; features: SectionFeature[]; footnote: string | null; images: SectionImage[]; layout?: SectionLayout | null; stats?: Stat[] }

/** Κείμενο μιας ενότητας (για έλεγχο ότι τα νούμερα υπάρχουν αυτούσια). */
export const sectionText = (s: StudioSection) => [s.title?.text, s.subtitle?.text, ...s.paragraphs.map((p) => p.text), ...s.features.flatMap((f) => [f.label, f.detail]), s.footnote?.text].filter(Boolean).join(" \n ");

/**
 * Διάταξη χωρίς AI (εφεδρεία και «αυτόματη» επιλογή όταν δεν έχει οριστεί): από το σχήμα του περιεχομένου.
 * Επίσης ο έλεγχος ότι μια διάταξη ΜΠΟΡΕΙ να αποδοθεί (γκαλερί θέλει ≥ 2 φωτογραφίες κ.λπ.).
 */
export function layoutFits(l: SectionLayout, s: { images: number; features: number; stats: number; textChars: number; ratios?: number[] }): boolean {
  switch (l) {
    case "hero": return s.images >= 1 && (s.ratios?.[0] ?? 2) >= 1.3; // ψηλή/τετράγωνη φωτογραφία σε όλο το πλάτος γεμίζει την οθόνη
    case "split": return s.images >= 1;
    case "gallery": return s.images >= 2;
    // λογότυπα / πιστοποιήσεις: μόνο φαρδιές, χαμηλές εικόνες — ένα διάγραμμα διαστάσεων θα γινόταν δυσανάγνωστο
    case "badges": return s.images >= 1 && (s.ratios ?? []).every((r) => r >= 2.2);
    case "features": return s.features >= 2;
    case "stats": return s.stats >= 2;
    case "text": return s.textChars > 0;
  }
}
export function autoLayout(s: { images: { kind: string; ratio: number; overlayText: boolean }[]; features: number; stats: number; textChars: number }): SectionLayout {
  const n = s.images.length;
  if (n >= 1 && s.images.every((i) => i.kind === "diagram" && i.ratio >= 2.5) && s.textChars < 200) return "badges";
  if (n >= 2 && s.textChars < 160) return "gallery";
  if (s.features >= 3) return "features";
  if (s.stats >= 2) return "stats";
  if (n >= 1 && s.images[0].kind === "lifestyle" && s.images[0].ratio >= 1.4 && s.textChars < 180) return "hero";
  if (n >= 1) return "split";
  return "text";
}

let seq = 0;
export const uid = (p = "x") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Μια ενότητα έχει κάτι να δημοσιεύσει; */
export const sectionHasContent = (s: StudioSection) => !!(s.title?.text.trim() || s.subtitle?.text.trim() || s.paragraphs.some((p) => p.text.trim()) || s.features.some((f) => f.include && f.label.trim()) || s.images.some((i) => i.include));

export const emptySection = (): StudioSection => ({ id: uid("s"), include: true, title: { id: uid("t"), text: "", box: null }, subtitle: null, paragraphs: [], features: [], footnote: null, images: [] });
