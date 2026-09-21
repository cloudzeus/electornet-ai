import type { StickerParams } from "@/lib/stickers/model";
/** Domain types — mirror prisma/schema.prisma. Fixtures live in lib/data/fixtures/. */

export type EnergyClass = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "A+" | "A++" | "A+++";

export type Availability =
  | { kind: "in-stock"; deliveryDate: string; label?: string }
  | { kind: "days"; min: number; max: number; deliveryDate: string }
  | { kind: "order"; label?: string };

export interface Spec {
  group: string;
  key: string;
  value: string;
}

export interface VariantAxis {
  name: string; // "Χρώμα" | "Χωρητικότητα"
  options: { label: string; slug?: string; price?: number; swatch?: string }[];
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string;
  verified: boolean;
}

export interface Question {
  id: string;
  body: string;
  answer?: string;
  date: string;
}

export interface Product {
  id: string;
  sku: string;
  ean?: string;
  slug: string;
  brand: string;
  brandSlug: string;
  title: string;
  /** L1 category id and L2 subcategory slug */
  category: string;
  subcategory: string;
  image: string | null;
  images?: string[];
  price: number;
  /** Προϊόν της βάσης χωρίς τιμή ακόμη (η τιμή του site δεν ζει στην καρτέλα του ERP): «Τιμή στο κατάστημα», χωρίς κουμπιά αγοράς. */
  noPrice?: boolean;
  /** Προϊόν του πραγματικού καταλόγου (βάση / SoftOne), όχι demo. Άλλο πράγμα από το «δεν έχει τιμή». */
  fromDb?: boolean;
  /** Τρίτο επίπεδο (τύπος προϊόντος του SoftOne) και ολόκληρη η διαδρομή κατηγορίας, για breadcrumbs και «παρόμοια». */
  /** Τα χαρακτηριστικά του ΤΥΠΟΥ προϊόντος (τα φίλτρα που ορίζει το ERP) με τις τιμές αυτού του προϊόντος — αυτά συγκρίνονται. */
  attrs?: { key: string; value: string; group: string }[];
  typeSlug?: string;
  path?: { slug: string; name: string }[];
  wasPrice?: number;
  /** Omnibus: lowest price of the previous 30 days, required with any discount. */
  lowest30?: number;
  /** kwh/eprel: από την καταχώριση EPREL όταν το προϊόν είναι δεμένο (ετήσια kWh, αριθμός καταχώρισης) */
  energy?: { cls: EnergyClass; fiche: string; kwh?: number; eprel?: string };
  /** εξωτερικές διαστάσεις σε cm όταν είναι γνωστές (EPREL/ERP) — αλλιώς τις βγάζει το dimsFor από specs ή κατηγορία */
  dims?: { w: number; h: number; d: number; source: "eprel" | "specs" | "category" };
  gift?: string;
  rating?: { value: number; count: number };
  availability: Availability;
  storeStock?: number;
  tradeIn?: boolean;
  installation?: boolean;
  badge?: { kind: "discount" } | { kind: "gift"; label: string } | { kind: "new" } | { kind: "renew"; grade: "A" | "B" };
  /** units left in the web warehouse when low (sticker «Τελευταία N») — ERP MTRSTORE */
  stockLeft?: number;
  /** a member store recommends it (sticker «Επιλογή καταστήματος») — CMS/store portal */
  storePick?: string;
  /** marketing promotion (CMS campaign rules): 1+1, gift with another product, contest, cashback */
  promo?: { kind: "bogo"; label?: string } | { kind: "bundle"; with: string; label?: string } | { kind: "contest"; label: string; until?: string } | { kind: "cashback"; amount: number; by: string } | { kind: "sticker"; params: StickerParams };
  description?: string;
  /** Γραφικά χαρακτηριστικών του κατασκευαστή, για μέσα στην περιγραφή (όχι στη γκαλερί). */
  banners?: { url: string; width: number | null; height: number | null; alt: string | null; blur?: string | null }[];
  highlights?: string[];
  specs?: Spec[];
  variants?: VariantAxis[];
  reviews?: Review[];
  questions?: Question[];
  tags?: string[];
  isRenew?: boolean;
  /** Source URL on the current euronics.gr (dummy content provenance). */
  sourceUrl?: string;
}

export interface Subcategory {
  slug: string;
  name: string;
  count: number;
  image?: string;
}

export interface Category {
  id: string;
  no: string;
  slug: string;
  title: string;
  titleBreak?: [string, string];
  count: number;
  meta?: string;
  featured?: boolean;
  description?: string;
  children: Subcategory[];
  /** Facet definitions for listings of this category. */
  facets?: FacetDef[];
}

export interface FacetDef {
  param: string;
  label: string;
  kind: "checkbox" | "range";
  /** specs key the facet reads from */
  specKey?: string;
  options?: string[];
}

export interface Brand {
  slug: string;
  name: string;
  count: number;
  logo?: string;
  blurb?: string;
}

export interface Service {
  no: string;
  slug: string;
  title: string;
  blurb: string;
  body?: string;
  priceFrom?: number;
  steps?: string[];
  faq?: { q: string; a: string }[];
  addonAt?: ("pdp" | "checkout" | "delivery")[];
  /** Live euronics.gr page the copy was taken from. */
  sourceUrl?: string;
}

export interface Store {
  id: string;
  slug: string;
  name: string;
  member?: string;
  address: string;
  zip: string;
  city: string;
  region: string;
  phone?: string;
  email?: string;
  distanceKm: number;
  openUntil: string;
  hours: { day: string; open: string; close: string }[];
  services: string[];
  lat: number;
  lng: number;
}

export interface Guide {
  slug: string;
  kicker: string;
  minutes: number;
  title: string;
  excerpt: string;
  cta: string;
  ctaHref?: string;
  image?: string;
  tone: "blue" | "red" | "green";
  date?: string;
  body?: string[];
  sourceUrl?: string;
}

export interface HeroSlide {
  id: string;
  kicker: string;
  title: string[];
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  bullets: string[];
  image: string;
  alt: string;
  /** transparent product cutout that floats in the cinematic hero (v4) */
  cutout?: string;
  /** product the cutout belongs to (link on the floating product) */
  productHref?: string;
  /** optional ambient video loop (mp4, muted) behind the slide; the photo stays as poster/fallback */
  video?: string;
}

export interface Faq {
  group: string;
  q: string;
  a: string;
}

export interface Address {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  street: string;
  number: string;
  floor?: string;
  city: string;
  zip: string;
  region: string;
  phone: string;
  isDefault?: boolean;
}

export interface OrderLine {
  productId: string;
  title: string;
  brand: string;
  image: string | null;
  qty: number;
  unitPrice: number;
  addons?: { slug: string; title: string; price: number }[];
}

export interface Order {
  number: string;
  date: string;
  status: "pending" | "paid" | "processing" | "shipped" | "ready-for-pickup" | "delivered" | "cancelled" | "returned";
  fulfilment: "courier" | "click-collect" | "appointment";
  pickupStore?: string;
  address?: Address;
  lines: OrderLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
  payment: { method: string; instalments?: number; last4?: string };
  tracking?: { courier: string; code: string; url: string; events: { date: string; text: string }[] };
  invoice?: { vat: string; company: string; doy: string };
}

export interface Policy {
  slug: string;
  title: string;
  intro?: string;
  sections: { title: string; body: string[] }[];
  sourceUrl?: string;
  updated?: string;
  /** Text copied verbatim from the live euronics.gr page (not condensed). */
  verbatim?: boolean;
}

/* ---------------- Dynamic content (CMS) ---------------- */

/** @dynamic Νέα & ανακοινώσεις — source: CMS (headless, π.χ. Strapi/Payload) ή SoftOne «Ανακοινώσεις». One record per item. */
export interface NewsItem {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO date */
  date: string;
  category: "prosfores" | "katastimata" | "etaireia" | "proionta" | "ekdiloseis";
  image?: string;
  body?: string[];
  cta?: { label: string; href: string };
  /** Where the record comes from — drives the byline and the cache TTL. */
  source?: "cms" | "erp" | "social";
  featured?: boolean;
}

/* ---------------- Account (ERP-bound) ---------------- */

/** @dynamic Πελάτης — source: SoftOne CUSTOMER (TRDR) + e-shop auth provider. */
export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday?: string;
  vat?: string;
  memberSince: string;
  loyaltyPoints?: number;
  twoFactor?: boolean;
}

/** @dynamic Αποθηκευμένος τρόπος πληρωμής — source: PSP token vault (ποτέ αριθμοί καρτών στη Euronics). */
export interface PaymentMethod {
  id: string;
  kind: "card" | "iris" | "bank";
  label: string;
  last4?: string;
  brand?: "visa" | "mastercard" | "amex";
  expires?: string;
  isDefault?: boolean;
}

/** @dynamic Πρόγραμμα δόσεων — source: SoftOne FINDOC / Eurobank consumer-credit API. */
export interface InstalmentPlan {
  id: string;
  orderNumber: string;
  title: string;
  provider: "card" | "eurobank";
  months: number;
  paid: number;
  monthly: number;
  nextDate: string;
}

/** @dynamic Ραντεβού υπηρεσίας — source: SoftOne Service module (SRVJOB) ή σύστημα ραντεβού καταστήματος. */
export interface Appointment {
  id: string;
  kind: "installation" | "service" | "delivery" | "pickup";
  title: string;
  productTitle?: string;
  orderNumber?: string;
  store: string;
  technician?: string;
  date: string;
  slot: string;
  status: "scheduled" | "confirmed" | "done" | "cancelled";
  notes?: string;
}

/** @dynamic Συγκατάθεση επικοινωνίας — source: consent ledger (GDPR άρθρο 7) — κάθε αλλαγή καταγράφεται με χρόνο & πηγή. */
export interface ConsentPref {
  topic: "orders" | "offers" | "price-drop" | "back-in-stock" | "newsletter" | "service";
  label: string;
  help: string;
  channels: { email: boolean; sms: boolean; push: boolean; viber: boolean };
  updated: string;
}
