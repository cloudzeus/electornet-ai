import "server-only";
import type { Category, Guide, HeroSlide, Product, Service, Store } from "./types";

/**
 * Data layer. Today these are typed fixtures reproduced from the design
 * (real euronics.gr assets and copy). Every function is async and
 * server-only so that swapping in Prisma (see prisma/schema.prisma) or
 * the ERP adapter changes nothing in the components.
 */


import { products } from "./fixtures/products";
import { geoFromRequest, storesNear } from "@/lib/geo/ip";
import { stores } from "./fixtures/stores";

const categories: Category[] = [
  { id: "tv", no: "01", slug: "eikona-ixos/tileoraseis", title: "Τηλεοράσεις & Ήχος", titleBreak: ["Τηλεοράσεις", "& Ήχος"], count: 214, meta: "7 μάρκες", children: [] },
  { id: "clima", no: "02", slug: "klimatismos/air-condition", title: "Κλιματισμός & Θέρμανση", titleBreak: ["Κλιματισμός", "& Θέρμανση"], count: 186, meta: "εποχική αιχμή", featured: true, children: [] },
  { id: "wash", no: "03", slug: "leykes-syskeyes/plyntiria", title: "Πλυντήρια & Στεγνωτήρια", titleBreak: ["Πλυντήρια", "& Στεγνωτήρια"], count: 240, meta: "με εγκατάσταση", children: [] },
  { id: "fridge", no: "04", slug: "leykes-syskeyes/psygeia", title: "Ψυγεία & Καταψύκτες", titleBreak: ["Ψυγεία", "& Καταψύκτες"], count: 198, meta: "A έως G", children: [] },
  { id: "mobile", no: "05", slug: "tilefonia/smartphones", title: "Κινητά & Wearables", titleBreak: ["Κινητά", "& Wearables"], count: 312, children: [] },
  { id: "computing", no: "06", slug: "computing/laptops", title: "Laptops & Computing", titleBreak: ["Laptops", "& Computing"], count: 154, children: [] },
  { id: "coffee", no: "07", slug: "oikiakos-exoplismos/kafes-rofimata", title: "Καφές & Μαγειρική", titleBreak: ["Καφές", "& Μαγειρική"], count: 176, children: [] },
  { id: "vacuum", no: "08", slug: "oikiakos-exoplismos/skoypes", title: "Σκούπες & Καθαριότητα", titleBreak: ["Σκούπες", "& Καθαριότητα"], count: 142, children: [] },
  { id: "care", no: "09", slug: "frontida", title: "Προσωπική Φροντίδα", titleBreak: ["Προσωπική", "Φροντίδα"], count: 208, children: [] },
];

const services: Service[] = [
  { no: "01", slug: "epektasi-eggyisis", title: "Επέκταση εγγύησης", blurb: "Έως 5 έτη, από 19 € · καλύπτει και βλάβη από υγρά", priceFrom: 19 },
  { no: "02", slug: "paradosi-egkatastasi", title: "Παράδοση & εγκατάσταση", blurb: "Με ραντεβού, από τεχνικό του καταστήματος" },
  { no: "03", slug: "paralavi-2-ores", title: "Παραλαβή σε 2 ώρες", blurb: "Σε 350 σημεία · χωρίς κόστος" },
  { no: "04", slug: "anakyklosi-aiie", title: "Ανακύκλωση ΑΗΗΕ", blurb: "Δωρεάν παραλαβή της παλιάς συσκευής" },
  { no: "05", slug: "dorean-fylaxi", title: "Φύλαξη συσκευών", blurb: "Μέχρι να ετοιμαστεί ο χώρος σου" },
  { no: "06", slug: "syntirisi-episkeyi", title: "Δικό μας service", blurb: "Συντήρηση & επισκευή, με ανταλλακτικά αντιπροσωπείας" },
  { no: "07", slug: "e-support", title: "E-Support", blurb: "Απομακρυσμένη υποστήριξη συσκευών υψηλής τεχνολογίας" },
  { no: "08", slug: "eggyisi-xamiloteris-timis", title: "Εγγύηση χαμηλότερης τιμής", blurb: "Διαφορά τιμής πίσω, με απλή απόδειξη" },
  { no: "09", slug: "eggyisi-allagis", title: "Εγγύηση αλλαγής", blurb: "Αλλαγή προϊόντος εντός 14 ημερών" },
  { no: "10", slug: "xrimatodotisi", title: "Χρηματοδότηση", blurb: "Δόσεις με ή χωρίς κάρτα, έως 24 μήνες" },
  { no: "11", slug: "symvouleytiki", title: "Συμβουλευτική από ειδικούς", blurb: "Στο κατάστημα, τηλεφωνικά ή με video" },
  { no: "12", slug: "kartes-dorou", title: "Κάρτες δώρου", blurb: "Ψηφιακές ή φυσικές, εξαργύρωση παντού" },
];



const guides: Guide[] = [
  {
    slug: "epilogi-klimatistikou",
    kicker: "Οδηγός",
    minutes: 4,
    title: "Πώς να επιλέξεις το σωστό κλιματιστικό για κάθε χώρο",
    excerpt: "BTU, Inverter, ενεργειακή απόδοση, μόνωση: τι μετράει πραγματικά.",
    cta: "Διάβασε & δες 6 προτάσεις →",
    image: "/img/guide-ac.jpg",
    tone: "blue",
  },
  {
    slug: "mikrosyskeves-foititiko",
    kicker: "Οδηγός",
    minutes: 5,
    title: "Οι βασικές μικροσυσκευές για φοιτητικό σπίτι",
    excerpt: "Λίγος χώρος, απαιτητική καθημερινότητα: οι επιλογές που αξίζουν.",
    cta: "Δες 9 προτάσεις →",
    image: "/img/guide-student.jpg",
    tone: "red",
  },
  {
    slug: "nea-energeiaki-etiketa",
    kicker: "Ενέργεια",
    minutes: 3,
    title: "Τι σημαίνει η νέα ενεργειακή ετικέτα A–G",
    excerpt: "Πόσο ρεύμα γλιτώνεις πραγματικά ανεβαίνοντας μία κλάση.",
    cta: "Διάβασε →",
    image: "/img/guide-energy.jpg",
    tone: "green",
  },
];

const heroSlides: HeroSlide[] = [
  {
    id: "summer-clima",
    kicker: "Καλοκαίρι 2026 · κλιματισμός",
    title: ["Δροσιά", "που δεν καίει", "ρεύμα"],
    body: "Inverter έως A+++, τοποθέτηση από πιστοποιημένο τεχνικό του καταστήματος της γειτονιάς σου, δόσεις χωρίς κάρτα.",
    primary: { label: "Δες τα 186 μοντέλα", href: "/k/klimatismos/air-condition" },
    secondary: { label: "Υπολόγισε BTU", href: "/odigoi/epilogi-klimatistikou" },
    bullets: ["Δωρεάν μεταφορά", "Εγκατάσταση", "Εγγύηση έως 5 έτη"],
    image: "/img/hero-clima.jpg",
    alt: "Δροσερό σαλόνι με κλιματιστικό inverter",
    cutout: "/img/cutouts/r-152092-0.webp",
    productHref: "/proion/inventor-veri-vero-18wfi-klimatistiko",
    video: "/video/hero-clima.mp4",
  },
  {
    id: "back-to-school",
    kicker: "Σεπτέμβριος · computing",
    title: ["Laptop", "για κάθε", "σχολή"],
    body: "Από 399 €, με δωρεάν τσάντα και εγκατάσταση Office από το κατάστημα.",
    primary: { label: "Δες τα 154 μοντέλα", href: "/k/computing/laptops" },
    secondary: { label: "Οδηγός επιλογής", href: "/odigoi" },
    bullets: ["Δωρεάν μεταφορά", "Δόσεις χωρίς κάρτα", "Επίσημη εγγύηση"],
    image: "/img/hero-laptop.jpg",
    alt: "Φοιτήτρια με laptop στο γραφείο της",
    cutout: "/img/cutouts/r-157206-0.webp",
    productHref: "/proion/apple-mdhe4gr-a-midnight",
  },
  {
    id: "renew",
    kicker: "Euronics Renew",
    title: ["Refurbished", "με 2 χρόνια", "εγγύηση"],
    body: "Έλεγχος 60 σημείων, μπαταρία ≥85%, Grade A/B με σαφή περιγραφή.",
    primary: { label: "Δες τα Renew", href: "/renew" },
    secondary: { label: "Τι είναι το Renew", href: "/renew" },
    bullets: ["2 έτη εγγύηση", "Επιστροφή σε 14 ημέρες", "Δόσεις"],
    image: "/img/hero-renew.jpg",
    alt: "Refurbished smartphone στο χέρι",
    cutout: "/img/cutouts/r-146037-0.webp",
    productHref: "/renew",
  },
];

export async function getProducts(): Promise<Product[]> {
  return products;
}
export async function getProduct(id: string): Promise<Product | undefined> {
  return products.find((p) => p.id === id);
}
export async function getCategories(): Promise<Category[]> {
  return categories;
}
export async function getServices(limit?: number): Promise<Service[]> {
  return limit ? services.slice(0, limit) : services;
}
/** @dynamic Nearest store from the request IP (city level); GPS refinement happens client-side. */
export async function getNearestStore(): Promise<Store> {
  const g = await geoFromRequest();
  return (await storesNear(g, 1))[0] ?? stores[0];
}
export async function getNearestStoreWithGeo(): Promise<{ store: Store; city?: string; source: "ip" | "fallback" }> {
  const g = await geoFromRequest();
  return { store: (await storesNear(g, 1))[0] ?? stores[0], city: g.city, source: g.source };
}
export async function getGuides(): Promise<Guide[]> {
  return guides;
}
export async function getHeroSlides(): Promise<HeroSlide[]> {
  return heroSlides;
}
export async function getDealOfDay(): Promise<{ product: Product; endsAt: string }> {
  const end = new Date();
  end.setHours(23, 59, 59, 0);
  const product = products.find((p) => p.id === "p-lg-43nano82") ?? products[0];
  return { product, endsAt: end.toISOString() };
}
export async function getWeeklyDeals(): Promise<{ products: Product[]; endsAt: string; label: string }> {
  // Real expiry: next Sunday 23:59 (Omnibus: no fake countdowns)
  const end = new Date();
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7 || 7));
  end.setHours(23, 59, 0, 0);
  const label = new Intl.DateTimeFormat("el-GR", { weekday: "long", day: "numeric", month: "long" }).format(end);
  const deals = products.filter((p) => p.tags?.includes("weekly-deals") || (p.wasPrice && p.image && p.image.startsWith("http")));
  return { products: deals, endsAt: end.toISOString(), label: `Λήγουν ${label}` };
}
