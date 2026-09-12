import "server-only";
import type { Product } from "@/lib/data/types";
import { products } from "@/lib/data/fixtures/products";
import { dimsFor } from "@/lib/data/dims";
import { fitVerdict, type MySpace } from "@/lib/space/fit";

export interface AdvisorAnswer {
  q: string;
  /** what the advisor understood, in words */
  understood: string[];
  /** the recommendation text */
  text: string;
  products: { id: string; slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null; why: string; fit?: "fits" | "tight" | "no" }[];
  href?: { label: string; href: string };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CATS: { re: RegExp; sub: string; label: string; plural: string; href: string }[] = [
  { re: /πλυντηρι|plynt|washer/, sub: "plyntiria", label: "πλυντήριο", plural: "πλυντήρια", href: "/k/leykes-syskeyes/plyntiria" },
  { re: /ψυγει|psyg|fridge/, sub: "psygeia", label: "ψυγείο", plural: "ψυγεία", href: "/k/leykes-syskeyes/psygeia" },
  { re: /τηλεορασ|tv\b|oled|qled|tileoras/, sub: "tileoraseis", label: "τηλεόραση", plural: "τηλεοράσεις", href: "/k/eikona-ixos/tileoraseis" },
  { re: /κλιματιστ|air ?con|btu|klimat/, sub: "air-condition", label: "κλιματιστικό", plural: "κλιματιστικά", href: "/k/klimatismos/air-condition" },
  { re: /laptop|macbook|φορητ|υπολογιστ/, sub: "laptops", label: "laptop", plural: "laptops", href: "/k/computing/laptops" },
  { re: /κινητ|smartphone|iphone|galaxy|τηλεφων/, sub: "smartphones", label: "κινητό", plural: "κινητά", href: "/k/tilefonia/smartphones" },
  { re: /σκουπ|vacuum|skoup/, sub: "skoypes", label: "σκούπα", plural: "σκούπες", href: "/k/mikrosyskeves/skoypes" },
  { re: /καφ|espresso|kafe/, sub: "kafes-rofimata", label: "καφετιέρα", plural: "καφετιέρες", href: "/k/mikrosyskeves/kafes-rofimata" },
];

const specNum = (p: Product, re: RegExp) => {
  const s = (p.specs ?? []).find((x) => re.test(x.key));
  if (!s) return null;
  const v = parseFloat(s.value.replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

/**
 * @dynamic Advisor answer for a natural-language query. Demo: intent rules
 * (category, budget, door width, noise, capacity, "small flat") over the
 * catalogue; production: LLM tool-calling (OpenRouter) + pgvector
 * retrieval + Fit-My-Space / Energy tools, same JSON shape, streamed.
 */
export function advisorAnswer(q: string, space?: MySpace | null): AdvisorAnswer {
  const n = norm(q);
  const understood: string[] = [];
  const cat = CATS.find((c) => c.re.test(n));
  if (cat) understood.push(cat.label);
  const budget = n.match(/(?:κατω|μεχρι|εως|under|<)\s*(?:απο\s*)?(\d{2,5})\s*(?:€|ευρω|eur)?/)?.[1] ?? n.match(/(\d{3,5})\s*(?:€|ευρω)/)?.[1];
  const maxPrice = budget ? Number(budget) : null;
  if (maxPrice) understood.push(`έως ${maxPrice} €`);
  const door = n.match(/πορτα\D{0,12}(\d{2,3})/)?.[1];
  const sp: MySpace | null = door ? { door: Number(door), lift: true } : (space ?? null);
  if (door) understood.push(`πόρτα ${door} εκ.`);
  const quiet = /αθορυβ|ησυχ|quiet|db/.test(n);
  if (quiet) understood.push("αθόρυβο");
  const small = /διαμερισμ|μικρο|στεν|small/.test(n);
  if (small) understood.push("μικρός χώρος");
  const kg = n.match(/(\d{1,2})\s*(?:kg|κιλ)/)?.[1];
  if (kg) understood.push(`${kg} kg`);
  const inch = n.match(/(\d{2})\s*(?:"|ιντσ|inch)/)?.[1];
  if (inch) understood.push(`${inch}"`);
  const energy = /ρευμα|οικονομ|καταναλωσ|κλαση a/.test(n);
  if (energy) understood.push("χαμηλή κατανάλωση");

  let pool = cat ? products.filter((p) => p.subcategory === cat.sub) : products;
  if (maxPrice) pool = pool.filter((p) => p.price <= maxPrice);
  const score = (p: Product) => {
    let s = 0;
    if (p.badge?.kind === "discount") s += 1;
    if (p.rating) s += p.rating.value / 5;
    if (energy && p.energy) s += ["A+++", "A++", "A+", "A"].includes(p.energy.cls) ? 2 : ["B", "C"].includes(p.energy.cls) ? 1 : 0;
    if (kg) {
      const c = specNum(p, /Χωρητικότητα/i);
      if (c !== null) s += Math.max(0, 2 - Math.abs(c - Number(kg)) / 2);
    }
    if (inch) {
      const m = p.title.match(/(\d{2})\s*["″”]/);
      if (m) s += Math.max(0, 2 - Math.abs(Number(m[1]) - Number(inch)) / 10);
    }
    if (quiet) {
      const db = specNum(p, /Θόρυβ/i);
      if (db !== null) s += db <= 72 ? 2 : db <= 76 ? 1 : 0;
      else if (p.energy && ["A", "A+", "A++", "A+++"].includes(p.energy.cls)) s += 0.5;
    }
    if (small) {
      const d = dimsFor(p);
      if (d && d.w <= 60) s += 1;
    }
    if (sp) {
      const d = dimsFor(p);
      if (d) {
        const v = fitVerdict(d, sp);
        s += v.kind === "fits" ? 2 : v.kind === "tight" ? 0.5 : -5;
      }
    }
    return s;
  };
  const ranked = pool
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ p }) => {
      const why: string[] = [];
      const d = dimsFor(p);
      if (sp && d) {
        const v = fitVerdict(d, sp);
        why.push(v.kind === "fits" ? `περνάει από πόρτα ${sp.door} εκ.` : v.kind === "tight" ? "περνάει οριακά" : "δεν περνάει από την πόρτα");
      }
      if (p.energy) why.push(`κλάση ${p.energy.cls}`);
      const db = specNum(p, /Θόρυβ/i);
      if (db) why.push(`${db} dB`);
      const c = (p.specs ?? []).find((x) => /Χωρητικότητα/i.test(x.key));
      if (c) why.push(c.value);
      if (p.badge?.kind === "discount" && p.wasPrice) why.push(`−${Math.round(p.wasPrice - p.price)} € τώρα`);
      const fit = sp && d ? fitVerdict(d, sp).kind : undefined;
      return { id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, image: p.image ?? null, why: why.slice(0, 3).join(" · ") || "καλή σχέση τιμής/χαρακτηριστικών", fit };
    });

  const text = ranked.length
    ? `Κατάλαβα: ${understood.join(", ") || "γενική αναζήτηση"}. ${cat ? `Από ${pool.length} ${cat.plural} που ταιριάζουν` : "Από τον κατάλογο"}, αυτά τα τρία αξίζουν πρώτα. ${sp ? "Έλεγξα και αν περνούν από την πόρτα σου." : "Πες μου το πλάτος της πόρτας σου για να ελέγξω αν χωρούν."}`
    : `Δεν βρήκα κάτι ${cat ? `στα ${cat.label}` : ""}${maxPrice ? ` έως ${maxPrice} €` : ""}. Δοκίμασε λίγο μεγαλύτερο προϋπολογισμό ή ρώτα με αλλιώς.`;

  return { q, understood, text, products: ranked, href: cat ? { label: `Όλα τα ${cat.plural}`, href: cat.href } : undefined };
}
