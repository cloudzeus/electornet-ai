import type { HeroSlide } from "@/lib/data/types";

/**
 * Hero slides της αρχικής (CmsDocument «hero.slides»/«home»): ο τύπος του εγγράφου, τα αρχικά slides και οι καθαρές
 * συναρτήσεις επιλογής/ελέγχου — χωρίς βάση, ώστε να τρέχουν και στον επεξεργαστή (browser) και στα tests.
 * Ημερομηνίες: ημέρες ώρας Ελλάδας «YYYY-MM-DD», και τα δύο άκρα μετρούν.
 * «Μόνιμα»: εφεδρικά — βγαίνουν μόνο όταν δεν υπάρχει άλλο ενεργό slide, ώστε ο hero να μη μείνει ποτέ άδειος.
 */
export interface HeroLink { label: string; href: string }
export interface HeroSlideDoc {
  id: string;
  active: boolean;
  from: string | null;
  to: string | null;
  permanent: boolean;
  kicker: string;
  title: string[];
  body: string;
  primary: HeroLink;
  secondary: HeroLink | null;
  bullets: string[];
  image: { url: string; alt: string };
  imageMobile: { url: string } | null;
  video: { url: string } | null;
  productId: string | null;
  /** μόνο τα αρχικά slides: έτοιμο cutout / σύνδεσμος χωρίς προϊόν της βάσης */
  cutout?: string | null;
  productHref?: string | null;
}
/** Προσφορά ημέρας: προϊόν ανά ημέρα (ώρα Ελλάδας) */
export interface HeroDeal { day: string; productId: string }
export interface HeroDoc {
  slides: HeroSlideDoc[];
  /** επιλογές «Προσφορά ημέρας»· χωρίς επιλογή για σήμερα → αυτόματα η μεγαλύτερη πραγματική έκπτωση */
  deals?: HeroDeal[];
  /** slugs των υπηρεσιών του πλακιδίου, με τη σειρά τους· κενό = οι πρώτες 4 */
  services?: string[];
}
export interface SlideIssue { field: "title" | "image" | "primary" | "secondary" | "dates"; message: string }
/** Ό,τι χρειάζεται ο hero από ένα προϊόν του καταλόγου — η τιμή διαβάζεται τη στιγμή της προβολής */
export interface ProductInfo { title: string; slug: string; cutout: string | null; price: number | null }

export const MAX_SLIDES = 12;

const none = { imageMobile: null, video: null, productId: null, from: null, to: null } as const;
export const DEFAULT_HERO_DOC: HeroDoc = {
  slides: [
    {
      ...none, id: "summer-clima", active: true, permanent: false, to: "2026-09-30",
      kicker: "Καλοκαίρι 2026 · κλιματισμός", title: ["Δροσιά", "που δεν καίει", "ρεύμα"],
      body: "Inverter έως A+++, τοποθέτηση από πιστοποιημένο τεχνικό του καταστήματος της γειτονιάς σου, δόσεις χωρίς κάρτα.",
      primary: { label: "Δες τα 186 μοντέλα", href: "/k/klimatismos/air-condition" }, secondary: { label: "Υπολόγισε BTU", href: "/odigoi/epilogi-klimatistikou" },
      bullets: ["Δωρεάν μεταφορά", "Εγκατάσταση", "Εγγύηση έως 5 έτη"],
      image: { url: "/img/hero-clima.jpg", alt: "Δροσερό σαλόνι με κλιματιστικό inverter" }, video: { url: "/video/hero-clima.mp4" },
      cutout: "/img/cutouts/r-152092-0.webp", productHref: "/proion/inventor-veri-vero-18wfi-klimatistiko",
    },
    {
      ...none, id: "back-to-school", active: true, permanent: false, to: "2026-09-30",
      kicker: "Σεπτέμβριος · computing", title: ["Laptop", "για κάθε", "σχολή"],
      body: "Από 399 €, με δωρεάν τσάντα και εγκατάσταση Office από το κατάστημα.",
      primary: { label: "Δες τα 154 μοντέλα", href: "/k/computing/laptops" }, secondary: { label: "Οδηγός επιλογής", href: "/odigoi" },
      bullets: ["Δωρεάν μεταφορά", "Δόσεις χωρίς κάρτα", "Επίσημη εγγύηση"],
      image: { url: "/img/hero-laptop.jpg", alt: "Φοιτήτρια με laptop στο γραφείο της" },
      cutout: "/img/cutouts/r-157206-0.webp", productHref: "/proion/apple-mdhe4gr-a-midnight",
    },
    {
      ...none, id: "renew", active: true, permanent: true,
      kicker: "Euronics Renew", title: ["Refurbished", "με 2 χρόνια", "εγγύηση"],
      body: "Έλεγχος 60 σημείων, μπαταρία ≥85%, Grade A/B με σαφή περιγραφή.",
      primary: { label: "Δες τα Renew", href: "/renew" }, secondary: { label: "Τι είναι το Renew", href: "/renew" },
      bullets: ["2 έτη εγγύηση", "Επιστροφή σε 14 ημέρες", "Δόσεις"],
      image: { url: "/img/hero-renew.jpg", alt: "Refurbished smartphone στο χέρι" },
      cutout: "/img/cutouts/r-146037-0.webp", productHref: "/renew",
    },
  ],
};

/** Η ημέρα στην Ελλάδα για μια στιγμή (ο server τρέχει σε UTC). */
export const athensDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
const inDates = (s: HeroSlideDoc, day: string) => (!s.from || day >= s.from) && (!s.to || day <= s.to);

/** Τα slides που βλέπει ο επισκέπτης τώρα: ενεργά εντός ημερομηνιών → αλλιώς τα μόνιμα → αλλιώς τα αρχικά. */
export function pickSlides(doc: HeroDoc | null, now: Date): HeroSlideDoc[] {
  const d = doc ?? DEFAULT_HERO_DOC;
  const day = athensDay(now);
  const live = d.slides.filter((s) => s.active && !s.permanent && inDates(s, day));
  if (live.length) return live;
  const fallback = d.slides.filter((s) => s.active && s.permanent);
  if (fallback.length) return fallback;
  return doc ? pickSlides(null, now) : [];
}

/** Το προϊόν που διάλεξε ο διαχειριστής για σήμερα (ή null → αυτόματη επιλογή). */
export function dealFor(doc: HeroDoc | null, now: Date): string | null {
  const day = athensDay(now);
  return doc?.deals?.find((d) => d.day === day)?.productId ?? null;
}

/** 23:59:59 ώρας Ελλάδας της ημέρας, ως ISO (UTC) — η πραγματική λήξη για το countdown. */
export function endOfAthensDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Athens", timeZoneName: "shortOffset" }).formatToParts(guess).find((x) => x.type === "timeZoneName")?.value ?? "GMT+2";
  const hours = Number(off.replace("GMT", "")) || 0;
  return new Date(guess.getTime() - hours * 3600_000).toISOString();
}

const dm = (day: string) => `${+day.slice(8, 10)}/${+day.slice(5, 7)}`;
export type SlideTone = "live" | "soon" | "ended" | "permanent" | "off";
export function slideStatus(s: HeroSlideDoc, now: Date): { tone: SlideTone; label: string } {
  if (!s.active) return { tone: "off", label: "Ανενεργό" };
  if (s.permanent) return { tone: "permanent", label: "Μόνιμο" };
  const day = athensDay(now);
  if (s.from && day < s.from) return { tone: "soon", label: `Από ${dm(s.from)}` };
  if (s.to && day > s.to) return { tone: "ended", label: `Έληξε ${dm(s.to)}` };
  return { tone: "live", label: s.to ? `Ενεργό έως ${dm(s.to)}` : "Ενεργό τώρα" };
}

const HREF = /^(\/(?!\/)|https:\/\/)/;
export function validateSlide(s: HeroSlideDoc): SlideIssue[] {
  const out: SlideIssue[] = [];
  if (!s.title.some((t) => t.trim())) out.push({ field: "title", message: "Γράψε τουλάχιστον μία γραμμή στον μεγάλο τίτλο." });
  if (!s.image.url) out.push({ field: "image", message: "Διάλεξε φωτογραφία από τη βιβλιοθήκη." });
  else if (!s.image.alt.trim()) out.push({ field: "image", message: "Γράψε τι δείχνει η φωτογραφία (για χρήστες με αναγνώστη οθόνης και για τη Google)." });
  if (!s.primary.label.trim() || !s.primary.href.trim()) out.push({ field: "primary", message: "Το κύριο κουμπί θέλει κείμενο και σύνδεσμο." });
  else if (!HREF.test(s.primary.href.trim())) out.push({ field: "primary", message: "Ο σύνδεσμος ξεκινά με / (σελίδα του site) ή https://." });
  if (s.secondary && (!s.secondary.label.trim() || !HREF.test(s.secondary.href.trim()))) out.push({ field: "secondary", message: "Το δεύτερο κουμπί θέλει κείμενο και σύνδεσμο που ξεκινά με / ή https:// — ή άφησε και τα δύο κενά." });
  if (s.from && s.to && s.to < s.from) out.push({ field: "dates", message: "Η τελευταία ημέρα είναι πριν από την πρώτη." });
  return out;
}

/** Λάθη ανά slide — μόνο για τα ενεργά (τα ανενεργά μπορούν να μείνουν μισοτελειωμένα). */
export function validateDoc(d: HeroDoc): Record<string, SlideIssue[]> {
  const out: Record<string, SlideIssue[]> = {};
  for (const s of d.slides) { if (!s.active) continue; const v = validateSlide(s); if (v.length) out[s.id] = v; }
  return out;
}

export const newSlideId = () => `s-${Math.random().toString(36).slice(2, 10)}`;
export const emptySlide = (): HeroSlideDoc => ({
  id: newSlideId(), active: true, from: null, to: null, permanent: false,
  kicker: "", title: [""], body: "", primary: { label: "", href: "" }, secondary: null, bullets: [],
  image: { url: "", alt: "" }, imageMobile: null, video: null, productId: null,
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const link = (v: unknown): HeroLink | null => { const o = obj(v); const label = str(o.label, 60), href = str(o.href, 300); return label || href ? { label, href } : null; };
const url = (v: unknown) => { const u = str(obj(v).url, 500); return u ? { url: u } : null; };

/** Καθαρισμός εισόδου από τον browser πριν μπει στη βάση: σχήμα, μήκη, όρια. */
export function normalizeDoc(input: unknown): HeroDoc {
  const raw = obj(input).slides;
  const slides = (Array.isArray(raw) ? raw : []).slice(0, MAX_SLIDES).map((x): HeroSlideDoc => {
    const s = obj(x), img = obj(s.image), permanent = s.permanent === true;
    return {
      id: str(s.id, 60) || newSlideId(),
      active: s.active !== false,
      from: permanent ? null : day(s.from),
      to: permanent ? null : day(s.to),
      permanent,
      kicker: str(s.kicker, 60),
      title: (Array.isArray(s.title) ? s.title : []).map((t) => str(t, 40)).filter(Boolean).slice(0, 3),
      body: str(s.body, 300),
      primary: link(s.primary) ?? { label: "", href: "" },
      secondary: link(s.secondary),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map((b) => str(b, 40)).filter(Boolean).slice(0, 3),
      image: { url: str(img.url, 500), alt: str(img.alt, 160) },
      imageMobile: url(s.imageMobile),
      video: url(s.video),
      productId: str(s.productId, 60) || null,
      cutout: str(s.cutout, 500) || null,
      productHref: str(s.productHref, 300) || null,
    };
  });
  const deals = new Map<string, string>();
  for (const x of Array.isArray(obj(input).deals) ? (obj(input).deals as unknown[]) : []) {
    const o = obj(x), dd = day(o.day), pid = str(o.productId, 60);
    if (dd && pid) deals.set(dd, pid); // μία επιλογή ανά ημέρα — η τελευταία κερδίζει
  }
  const rawServices = obj(input).services;
  const services = [...new Set((Array.isArray(rawServices) ? rawServices : []).map((x) => str(x, 80)).filter(Boolean))].slice(0, 13);
  return { slides, deals: [...deals].map(([d, productId]) => ({ day: d, productId })).sort((a, b) => a.day.localeCompare(b.day)).slice(-120), services };
}

/** Έγγραφο → ό,τι ζωγραφίζει ο hero. Με προϊόν του καταλόγου: το cutout, ο σύνδεσμος και η τρέχουσα τιμή του. */
export function toHeroSlide(s: HeroSlideDoc, p: ProductInfo | null): HeroSlide {
  return {
    id: s.id, kicker: s.kicker, title: s.title.filter((t) => t.trim()), body: s.body,
    primary: s.primary, secondary: s.secondary ?? undefined, bullets: s.bullets.filter((b) => b.trim()),
    image: s.image.url, alt: s.image.alt, imageMobile: s.imageMobile?.url, video: s.video?.url,
    cutout: p?.cutout ?? s.cutout ?? undefined, productHref: p ? `/proion/${p.slug}` : s.productHref ?? undefined, price: p?.price ?? undefined,
  };
}
