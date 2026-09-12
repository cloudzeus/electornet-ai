/**
 * @dynamic Site-wide settings the CMS will own. Four records, all plain
 * JSON: `site` (facts, contact, commerce thresholds), `motion` (every
 * duration/easing/stagger/autoplay and on-off switch used by the motion
 * primitives), `advisor` (Άρης: name, avatar, copy, suggested questions per
 * context, exit-intent, cart tips), `stickers` (labels/thresholds).
 * Server components read `getSettings()`; client components read the same
 * object through `useSettings()` (SettingsProvider in the shop layout).
 * No component keeps its own copy of these values.
 */

export interface SiteSettings {
  brand: { name: string; legalName: string; storesCount: number };
  contact: { phone: string; phoneDisplay: string; phoneLabel: string; email: string; address: string };
  commerce: {
    freeShippingFrom: number;
    returnDays: number;
    warrantyYears: number;
    maxInstalments: number;
    noCardInstalments: { min: number; max: number; months: number };
    codMax: number;
    codFee: number;
    clickCollectHours: number;
    kwhPrice: number;
  };
  announcement: { left: string[]; right: string[]; accent: { label: string; href: string } };
  facts: { value: number; suffix: string; label: string }[];
  social: { label: string; href: string }[];
}

export interface MotionSettings {
  enabled: boolean;
  reveal: { duration: number; y: number; stagger: number; threshold: number };
  tilt: { enabled: boolean; max: number; scale: number };
  countUp: { duration: number };
  hero: { intervalMs: number; wordStagger: number; ambient: boolean; rays: boolean; spotlight: boolean; video: boolean };
  campaigns: { autoplaySeconds: number; hoverIntentMs: number };
  servicesTile: { intervalMs: number };
  flyToCart: boolean;
  viewTransitions: boolean;
  easing: { out: string; inOut: string };
}

export interface AdvisorSettings {
  enabled: boolean;
  name: string;
  avatar: string;
  avatarHead: string;
  orb: { tooltip: string; tooltipProduct: string };
  greeting: { enabled: boolean; delayMs: number; hideAfterMs: number; title: string; titleReturning: string; body: string };
  panel: { title: string; titleProduct: string; subtitle: string; placeholder: string; demoFallback: string };
  suggestions: { home: string[]; byCategory: Record<string, string[]>; product: string[]; search: string[] };
  exitIntent: { enabled: boolean; delayMs: number; title: string; reasons: { label: string; reply: string }[]; emailNote: string };
  cartTips: { install: string; freeShipping: string; warranty: string; ok: string };
  handoff: { title: string; callLabel: string; chatLabel: string; done: string };
  thankYou: string;
  notFound: { title: string; body: string };
}

export interface StickerSettings {
  lastUnitsAt: number;
  endsWithinDays: number;
  labels: { discount: string; gift: string; bundle: string; pick: string; contest: string; bogo: string; cashback: string; new: string; renew: string };
}

export interface Settings {
  site: SiteSettings;
  motion: MotionSettings;
  advisor: AdvisorSettings;
  stickers: StickerSettings;
}

export const defaultSettings: Settings = {
  site: {
    brand: { name: "Euronics", legalName: "MEGA ELECTRICS ΑΕΒΕ", storesCount: 350 },
    contact: { phone: "+302104835143", phoneDisplay: "210 483 5143", phoneLabel: "Τηλ. παραγγελίες", email: "info@euronics.gr", address: "Δαμάσκου 2 Σταμάτη 12, 135 71 Αχαρνές" },
    commerce: { freeShippingFrom: 100, returnDays: 14, warrantyYears: 2, maxInstalments: 24, noCardInstalments: { min: 200, max: 2000, months: 24 }, codMax: 500, codFee: 2, clickCollectHours: 2, kwhPrice: 0.19 },
    announcement: { left: ["350 καταστήματα", "Δωρεάν μεταφορά εντός περιφέρειας", "Δόσεις με ή χωρίς κάρτα"], right: ["Επιστροφή μέσα σε 14 ημέρες"], accent: { label: "Παρακολούθηση παραγγελίας", href: "/entopismos" } },
    facts: [
      { value: 350, suffix: "", label: "καταστήματα σε όλη την Ελλάδα" },
      { value: 13, suffix: "", label: "υπηρεσίες με τιμή, πριν και μετά" },
      { value: 2, suffix: " ώρες", label: "παραλαβή από το κοντινό κατάστημα" },
      { value: 24, suffix: " δόσεις", label: "χωρίς κάρτα, με έγκριση online" },
    ],
    social: [
      { label: "Facebook", href: "https://www.facebook.com/euronicsgreece" },
      { label: "Instagram", href: "https://www.instagram.com/euronics_greece" },
      { label: "YouTube", href: "https://www.youtube.com/@euronicsgreece" },
    ],
  },
  motion: {
    enabled: true,
    reveal: { duration: 0.6, y: 18, stagger: 0.06, threshold: 0.12 },
    tilt: { enabled: true, max: 4, scale: 1.015 },
    countUp: { duration: 1.4 },
    hero: { intervalMs: 7000, wordStagger: 0.05, ambient: true, rays: true, spotlight: true, video: true },
    campaigns: { autoplaySeconds: 7, hoverIntentMs: 90 },
    servicesTile: { intervalMs: 3200 },
    flyToCart: true,
    viewTransitions: true,
    easing: { out: "power3.out", inOut: "expo.inOut" },
  },
  advisor: {
    enabled: true,
    name: "Άρης",
    avatar: "/img/advisor/mascot.webp",
    avatarHead: "/img/advisor/mascot-head.webp",
    orb: { tooltip: "Ρώτα τον Άρη", tooltipProduct: "Ρώτα τον Άρη για αυτό το προϊόν" },
    greeting: { enabled: true, delayMs: 2000, hideAfterMs: 10000, title: "Γεια! Είμαι ο Άρης.", titleReturning: "Καλώς ήρθες πάλι, {name}!", body: "Αν ψάχνεις κάτι, γράψ᾽ το μου με απλά λόγια ή πάτα με." },
    panel: { title: "Γεια, είμαι ο Άρης. Τι ψάχνεις;", titleProduct: "{brand} {title}", subtitle: "Απαντώ σε 2 δευτ. από τον κατάλογο. Άνθρωπος σε ένα κλικ.", placeholder: "Γράψε ό,τι θα ρωτούσες τον πωλητή…", demoFallback: "Στο demo απαντώ στις έτοιμες ερωτήσεις. Στην πλήρη έκδοση ο σύμβουλος απαντά σε οτιδήποτε από τον κατάλογο, τα χαρακτηριστικά και το απόθεμα." },
    suggestions: {
      home: ["Αθόρυβο πλυντήριο για διαμέρισμα", "Ποια τηλεόραση για φωτεινό σαλόνι;", "Θέλω να μιλήσω με το κατάστημα"],
      byCategory: {
        plyntiria: ["Αθόρυβο πλυντήριο για διαμέρισμα", "Χωράει στον χώρο μου;", "Πόσο ρεύμα καίει;"],
        psygeia: ["Ψυγείο που καίει λίγο ρεύμα", "Χωράει στην εσοχή μου;", "No frost ή όχι;"],
        tileoraseis: ["Τηλεόραση για φωτεινό σαλόνι", "55 ή 65 ίντσες για 3 μέτρα;", "OLED ή QLED;"],
        "air-condition": ["Κλιματιστικό για 20 τ.μ.", "Πόσα BTU χρειάζομαι;", "Πόσο ρεύμα καίει;"],
        laptops: ["Laptop για φοιτητή κάτω από 700 €", "Windows ή MacBook;", "Πόση μνήμη χρειάζομαι;"],
        smartphones: ["Κινητό με καλή κάμερα κάτω από 500 €", "Τι διαφορά έχει από το επόμενο μοντέλο;"],
      },
      product: ["Χωράει στον χώρο μου;", "Πόσο ρεύμα καίει;", "Τι διαφορά έχει από το επόμενο μοντέλο;"],
      search: ["αθόρυβο πλυντήριο για διαμέρισμα, πόρτα 62 εκ.", "τηλεόραση 55 ιντσών κάτω από 600 €", "ψυγείο που καίει λίγο ρεύμα"],
    },
    exitIntent: {
      enabled: true,
      delayMs: 8000,
      title: "Πριν φύγεις… τι σε κράτησε;",
      reasons: [
        { label: "Η τιμή", reply: "Το καταλαβαίνω. Έχεις έως 24 άτοκες δόσεις ή δόσεις χωρίς κάρτα, και αν βρεις φθηνότερα σε 14 ημέρες, το επιστρέφεις." },
        { label: "Θέλω να το σκεφτώ", reply: "Κανένα πρόβλημα. Σου κρατάω το καλάθι σε ένα email για όταν είσαι έτοιμος." },
        { label: "Δεν βρήκα αυτό που ήθελα", reply: "Πες μου τι ψάχνεις στην αναζήτηση με απλά λόγια, ή ζήτα να σε πάρει το κατάστημα." },
        { label: "Τα μεταφορικά / παράδοση", reply: "Δωρεάν μεταφορά εντός περιφέρειας και παραλαβή σε 2 ώρες από 350 καταστήματα." },
        { label: "Απλώς κοιτούσα", reply: "Κανένα πρόβλημα. Σου κρατάω το καλάθι σε ένα email για όταν είσαι έτοιμος." },
      ],
      emailNote: "Ένα email με το καλάθι σου, τίποτα άλλο. Χωρίς εγγραφή σε newsletter.",
    },
    cartTips: {
      install: "Το {product} θέλει σύνδεση και αλφάδιασμα. Ο τεχνικός του καταστήματος το τοποθετεί την ημέρα παράδοσης και παίρνει και την παλιά συσκευή.",
      freeShipping: "Σου λείπουν {gap} για δωρεάν μεταφορικά. Ένα μικρό αξεσουάρ το καλύπτει.",
      warranty: "Για το {product} η επέκταση εγγύησης σε 5 έτη κοστίζει από 19 € και καλύπτει και βλάβη από υγρά.",
      ok: "Όλα καλά με το καλάθι σου. Αν θες, ελέγχω αν χωρούν στον χώρο σου πριν την παραγγελία.",
    },
    handoff: { title: "Το κατάστημά σου", callLabel: "Να με πάρουν", chatLabel: "Chat", done: "Ο {seller} θα σε πάρει σε λίγα λεπτά" },
    thankYou: "Ευχαριστώ{name}! Θα σου γράψω μόλις φύγει η παραγγελία και αν χρειαστείς κάτι για την τοποθέτηση, είμαι εδώ.",
    notFound: { title: "Ο Άρης δεν βρήκε αυτή τη σελίδα", body: "Ίσως το προϊόν αποσύρθηκε ή ο σύνδεσμος άλλαξε. Γράψε τι ψάχνεις με απλά λόγια ή ξεκίνα από εδώ:" },
  },
  stickers: {
    lastUnitsAt: 5,
    endsWithinDays: 3,
    labels: { discount: "κερδίζεις", gift: "Δώρο", bundle: "Δώρο μαζί", pick: "Επιλογή καταστήματος", contest: "Διαγωνισμός", bogo: "1+1", cashback: "επιστροφή", new: "Νέο", renew: "Renew" },
  },
};

/** Fill a `{key}` template from values. */
export function tpl(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** @dynamic Server read (CMS «Settings» singletons, ISR 300s). */
export async function getSettings(): Promise<Settings> {
  return defaultSettings;
}
