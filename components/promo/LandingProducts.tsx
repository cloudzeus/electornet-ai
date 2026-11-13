"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { ProductGrid } from "@/components/catalog/ProductGrid";

type Sort = "discount" | "price-asc" | "price-desc";
const SORTS: { key: Sort; label: string }[] = [
  { key: "discount", label: "Μεγαλύτερη έκπτωση" },
  { key: "price-asc", label: "Φθηνότερα πρώτα" },
  { key: "price-desc", label: "Ακριβότερα πρώτα" },
];
const pct = (p: Product) => (p.wasPrice && p.wasPrice > p.price ? (p.wasPrice - p.price) / p.wasPrice : 0);

/**
 * Τα προϊόντα μιας landing page προσφοράς με φίλτρο κατηγορίας και ταξινόμηση — όλα στη σελίδα, χωρίς νέα φόρτωση.
 * Τα πλήκτρα κατηγορίας βγαίνουν από τα ίδια τα προϊόντα (με πλήθος) και εμφανίζονται μόνο όταν υπάρχουν τουλάχιστον δύο κατηγορίες.
 */
export function LandingProducts({ title, products, cats }: { title?: string; products: Product[]; /** slug υποκατηγορίας → όνομα */ cats: Record<string, string> }) {
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("discount");
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.subcategory, (m.get(p.subcategory) ?? 0) + 1);
    return [...m].filter(([id]) => cats[id]).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: cats[id], count }));
  }, [products, cats]);
  const shown = useMemo(() => {
    const list = cat ? products.filter((p) => p.subcategory === cat) : [...products];
    return list.sort((a, b) => (sort === "price-asc" ? a.price - b.price : sort === "price-desc" ? b.price - a.price : pct(b) - pct(a) || a.price - b.price));
  }, [products, cat, sort]);
  const saved = shown.reduce((n, p) => n + (p.wasPrice && p.wasPrice > p.price ? p.wasPrice - p.price : 0), 0);
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full border-2 px-4 min-h-11 font-bold text-[length:var(--fs-14)] whitespace-nowrap transition-colors ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink-2 hover:border-eu-navy hover:text-eu-navy"}`;
  return (
    <section id="proionta" className="eu-canvas eu-gutter grid gap-4 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid gap-0.5">
          {title && <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{title}</h2>}
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)]" aria-live="polite">
            <b className="text-eu-ink">{shown.length}</b> {shown.length === 1 ? "προϊόν" : "προϊόντα"}
            {saved > 0 && <> · κερδίζεις έως <b className="text-eu-green">{Math.round(saved).toLocaleString("el-GR")}{" "}€</b> συνολικά</>}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 font-bold text-eu-ink-2 text-[length:var(--fs-14)]">
          <ArrowDownWideNarrow className="size-4 text-eu-muted" aria-hidden /><span className="sr-only">Ταξινόμηση</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-full border-2 border-eu-line bg-white px-4 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>
      {groups.length > 1 && (
        // σε κινητό τα πλήκτρα κυλούν οριζόντια μέσα στη γραμμή τους (όχι η σελίδα)
        <div role="group" aria-label="Κατηγορία" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]">
          <button type="button" aria-pressed={!cat} onClick={() => setCat(null)} className={chip(!cat)}>Όλα <span className="tabular-nums opacity-70">{products.length}</span></button>
          {groups.map((g) => <button key={g.id} type="button" aria-pressed={cat === g.id} onClick={() => setCat(cat === g.id ? null : g.id)} className={chip(cat === g.id)}>{g.label} <span className="tabular-nums opacity-70">{g.count}</span></button>)}
        </div>
      )}
      {/* key: νέα λίστα → τα προϊόντα ξαναμπαίνουν με την κίνησή τους */}
      <ProductGrid key={`${cat}-${sort}`} products={shown} />
    </section>
  );
}
