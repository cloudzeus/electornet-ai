"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronRight, Check, Plus, FolderTree, Tag, Package, Search, Loader2 } from "lucide-react";
import { browseBrandsAction, browseCategoriesAction, browseProductsAction } from "@/app/admin/(shell)/prosfores/actions";

export type BrowseCat = { id: string; name: string };
export type BrowseProduct = { id: string; title: string; sku: string; brand: string; price: number | null; image: string | null };
type Child = { id: string; name: string; count: number; hasChildren: boolean };
type Brand = { id: string; name: string; count: number };

/** χωρίς τόνους, πεζά: «Ψυγεία» ταιριάζει με «ψυγεια» */
const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
const eur = (v: number | null) => (v == null ? "χωρίς τιμή" : `${v.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const filterInput = "w-full min-w-0 rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";

function Filter({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
      <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={filterInput} />
    </div>
  );
}

/**
 * Επιλογή από τον κατάλογο σε τρία βήματα, όπως σκέφτεται ο χρήστης:
 *  1. κατηγορία → υποκατηγορία (πλοήγηση στο δέντρο)
 *  2. οι μάρκες που υπάρχουν εκεί (με πλήθος)
 *  3. τα προϊόντα, σε λίστα που στενεύει όσο πληκτρολογείς
 * «targets»: μπορείς να προσθέσεις ολόκληρη κατηγορία, μάρκα-μέσα-στην-κατηγορία ή προϊόντα.
 * «products»: μόνο προϊόντα (πακέτο, ειδικές τιμές, δώρο). Οι στήλες στοιβάζονται σε στενή οθόνη — καμία οριζόντια κύλιση.
 */
export function ProductBrowser({ mode, selected, onCategory, onBrandInCategory, onProduct, single = false, addLabel = "Προσθήκη" }: {
  mode: "targets" | "products";
  selected: Set<string>;
  onCategory?: (c: BrowseCat & { count: number }) => void;
  onBrandInCategory?: (b: BrowseCat, c: BrowseCat) => void;
  onProduct: (p: BrowseProduct) => void;
  single?: boolean;
  addLabel?: string;
}) {
  const [path, setPath] = useState<BrowseCat[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [cat, setCat] = useState<(BrowseCat & { count: number }) | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [items, setItems] = useState<BrowseProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [fCat, setFCat] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [fProd, setFProd] = useState("");
  const [loading, start] = useTransition();
  /** σε στενή οθόνη φαίνεται ένα πάνελ τη φορά */
  const [pane, setPane] = useState<"cat" | "brand" | "prod">("cat");
  const seq = useRef(0);

  useEffect(() => { void browseCategoriesAction(null).then((r) => { setPath(r.path); setChildren(r.children); }); }, []);

  const loadProducts = (c: BrowseCat | null, b: Brand | null, q = "") => {
    const my = ++seq.current;
    start(async () => {
      const r = await browseProductsAction({ categoryId: c?.id ?? null, brandId: b?.id ?? null, q });
      if (my === seq.current) { setItems(r.items); setTotal(r.total); }
    });
  };
  const openCategory = (c: Child | null) => {
    setFCat(""); setFBrand(""); setFProd(""); setBrand(null);
    start(async () => {
      const r = await browseCategoriesAction(c?.id ?? null);
      setPath(r.path);
      // φύλλο: μένουν τα αδέλφια του στη λίστα, απλώς επιλέγεται
      if (!c || c.hasChildren) setChildren(r.children);
      setCat(c ? { id: c.id, name: c.name, count: c.count } : null);
      setBrands(c ? await browseBrandsAction(c.id) : []);
      if (c) loadProducts(c, null); else { setItems([]); setTotal(0); }
    });
  };
  const goPath = (i: number) => {
    const target = i < 0 ? null : path[i];
    setFCat("");
    start(async () => {
      const r = await browseCategoriesAction(target?.id ?? null);
      setPath(r.path); setChildren(r.children); setBrand(null); setFBrand(""); setFProd("");
      if (target) { const n = r.children.reduce((a, x) => a + x.count, 0); setCat({ ...target, count: n }); setBrands(await browseBrandsAction(target.id)); loadProducts(target, null); }
      else { setCat(null); setBrands([]); setItems([]); setTotal(0); }
    });
  };
  const pickBrand = (b: Brand | null) => { setBrand(b); setFProd(""); loadProducts(cat, b); setPane("prod"); };

  // τα προϊόντα στενεύουν όσο πληκτρολογείς· αν είναι περισσότερα από όσα φορτώθηκαν, ρωτά και τον server
  const shown = useMemo(() => { const q = norm(fProd.trim()); return q ? items.filter((p) => norm(`${p.title} ${p.sku} ${p.brand}`).includes(q)) : items; }, [items, fProd]);
  useEffect(() => {
    const q = fProd.trim();
    if (total <= items.length && (cat || brand)) return; // όλα είναι ήδη εδώ — φιλτράρει ο browser
    if (q.length < 2 && !cat) return;
    const t = setTimeout(() => loadProducts(cat, brand, q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fProd]);

  const kids = useMemo(() => { const q = norm(fCat.trim()); return q ? children.filter((c) => norm(c.name).includes(q)) : children; }, [children, fCat]);
  const brandList = useMemo(() => { const q = norm(fBrand.trim()); return q ? brands.filter((b) => norm(b.name).includes(q)) : brands; }, [brands, fBrand]);
  const panel = "rounded-2xl border border-eu-line bg-white p-3 gap-2 content-start min-w-0 grid-cols-[minmax(0,1fr)]";
  const vis = (k: typeof pane) => (pane === k ? "grid" : "hidden @4xl:grid");
  const scroll = "@4xl:max-h-80 @4xl:overflow-y-auto";
  const head = "flex items-center gap-2 font-extrabold text-eu-navy text-[length:var(--fs-15)]";
  const sub = "m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug";
  const row = "w-full text-left flex items-center gap-2 rounded-xl px-3 min-h-11 text-[length:var(--fs-14)]";

  return (
    <div className="grid gap-3 min-w-0">
    {/* στενή οθόνη: τα τρία βήματα ως κουμπιά — ένα πάνελ τη φορά, χωρίς κύλιση μέσα στη σελίδα */}
    <div className="@4xl:hidden grid grid-cols-3 gap-1.5" role="tablist" aria-label="Βήματα επιλογής">
      {([["cat", "1", "Κατηγορία", cat?.name], ["brand", "2", "Μάρκες", brand?.name ?? (cat ? `${brands.length}` : undefined)], ["prod", "3", "Προϊόντα", cat || brand || fProd ? `${total.toLocaleString("el-GR")}` : undefined]] as const).map(([k, n, t, sub]) => (
        <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)} className={`rounded-xl border-2 px-2 py-1.5 min-h-12 text-left min-w-0 ${pane === k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink"}`}>
          <span className="block font-extrabold text-[length:var(--fs-14)] truncate">{n}. {t}</span>
          {sub && <span className={`block text-[length:var(--fs-13)] truncate ${pane === k ? "text-white/80" : "text-eu-muted"}`}>{sub}</span>}
        </button>
      ))}
    </div>
    <div className="grid grid-cols-1 @4xl:grid-cols-2 @6xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-3 items-start">
      {/* 1. κατηγορία */}
      <section className={`${panel} ${vis("cat")}`} aria-label="Κατηγορία">
        <div className={head}><span className="size-6 rounded-full bg-eu-navy text-white grid place-items-center text-[length:var(--fs-13)]">1</span><FolderTree className="size-4" aria-hidden /> Κατηγορία</div>
        <p className={sub}>Πάτησε μια κατηγορία για να δεις τις υποκατηγορίες, τις μάρκες και τα προϊόντα της.</p>
        <nav aria-label="Διαδρομή" className="flex flex-wrap items-center gap-1 text-[length:var(--fs-13)]">
          <button type="button" onClick={() => goPath(-1)} className="font-bold text-eu-blue hover:underline min-h-9 px-1">Όλες</button>
          {path.map((p, i) => <span key={p.id} className="inline-flex items-center gap-1"><ChevronRight className="size-3.5 text-eu-muted" aria-hidden /><button type="button" onClick={() => goPath(i)} className={`min-h-9 px-1 ${i === path.length - 1 ? "font-extrabold text-eu-ink" : "font-bold text-eu-blue hover:underline"}`}>{p.name}</button></span>)}
        </nav>
        {children.length > 8 && <Filter value={fCat} onChange={setFCat} placeholder="Φίλτρο κατηγοριών…" label="Φίλτρο κατηγοριών" />}
        <ul className={`m-0 p-0 list-none grid gap-0.5 ${scroll}`}>
          {kids.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => openCategory(c)} aria-current={cat?.id === c.id ? "true" : undefined} className={`${row} ${cat?.id === c.id ? "bg-eu-navy text-white" : "hover:bg-eu-chip text-eu-ink"}`}>
                <span className="flex-1 min-w-0 font-semibold">{c.name}</span>
                <span className={`tabular-nums text-[length:var(--fs-13)] ${cat?.id === c.id ? "text-white/80" : "text-eu-muted"}`}>{c.count.toLocaleString("el-GR")}</span>
                {c.hasChildren && <ChevronRight className="size-4 shrink-0" aria-hidden />}
              </button>
            </li>
          ))}
          {!kids.length && <li className={sub}>{children.length ? "Καμία με αυτό το φίλτρο." : "Δεν έχει υποκατηγορίες."}</li>}
        </ul>
        {cat && (
          <div className="@4xl:hidden grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPane("brand")} className="rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-11 font-bold text-[length:var(--fs-14)]">Μάρκες ({brands.length}) →</button>
            <button type="button" onClick={() => setPane("prod")} className="rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-11 font-bold text-[length:var(--fs-14)]">Προϊόντα ({total.toLocaleString("el-GR")}) →</button>
          </div>
        )}
        {mode === "targets" && cat && onCategory && (
          <div className="rounded-xl bg-eu-chip p-3 grid gap-1.5">
            <button type="button" onClick={() => onCategory(cat)} disabled={selected.has(cat.id)} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:bg-eu-green">
              {selected.has(cat.id) ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {selected.has(cat.id) ? "Προστέθηκε" : "Όλη η κατηγορία"} «{cat.name}»
            </button>
            <p className={sub}>Ισχύει σε όλα τα προϊόντα της κατηγορίας — και σε όσα μπουν αργότερα.</p>
          </div>
        )}
      </section>

      {/* 2. μάρκες */}
      <section className={`${panel} ${vis("brand")}`} aria-label="Μάρκες">
        <div className={head}><span className="size-6 rounded-full bg-eu-navy text-white grid place-items-center text-[length:var(--fs-13)]">2</span><Tag className="size-4" aria-hidden /> Μάρκες{cat ? <span className="font-semibold text-eu-ink-2 truncate">στα {cat.name}</span> : null}</div>
        {!cat ? <p className={sub}>Διάλεξε πρώτα κατηγορία: εδώ εμφανίζονται οι μάρκες που έχει.</p> : (
          <>
            <p className={sub}>{mode === "targets" ? "Πάτησε μια μάρκα για να δεις τα προϊόντα της, ή «+» για όλη τη μάρκα μέσα σε αυτή την κατηγορία." : "Πάτησε μια μάρκα για να δεις μόνο τα προϊόντα της."}</p>
            {brands.length > 8 && <Filter value={fBrand} onChange={setFBrand} placeholder="Φίλτρο μαρκών…" label="Φίλτρο μαρκών" />}
            <ul className={`m-0 p-0 list-none grid gap-0.5 ${scroll}`}>
              <li><button type="button" onClick={() => pickBrand(null)} className={`${row} ${!brand ? "bg-eu-navy text-white" : "hover:bg-eu-chip"}`}><span className="flex-1 font-semibold">Όλες οι μάρκες</span><span className="tabular-nums text-[length:var(--fs-13)]">{brands.reduce((a, b) => a + b.count, 0).toLocaleString("el-GR")}</span></button></li>
              {brandList.map((b) => { const key = `${b.id}|${cat.id}`; const on = brand?.id === b.id; return (
                <li key={b.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => pickBrand(b)} aria-current={on ? "true" : undefined} className={`${row} flex-1 min-w-0 ${on ? "bg-eu-navy text-white" : "hover:bg-eu-chip"}`}><span className="flex-1 min-w-0 font-semibold truncate">{b.name}</span><span className={`tabular-nums text-[length:var(--fs-13)] ${on ? "text-white/80" : "text-eu-muted"}`}>{b.count.toLocaleString("el-GR")}</span></button>
                  {mode === "targets" && onBrandInCategory && <button type="button" title={`Όλα τα ${b.name} στα ${cat.name}`} aria-label={`Προσθήκη: όλα τα ${b.name} στα ${cat.name}`} disabled={selected.has(key)} onClick={() => onBrandInCategory(b, cat)} className="size-11 shrink-0 grid place-items-center rounded-full border border-eu-line hover:border-eu-navy disabled:bg-eu-green disabled:text-white disabled:border-eu-green">{selected.has(key) ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}</button>}
                </li>
              ); })}
            </ul>
          </>
        )}
      </section>

      {/* 3. προϊόντα */}
      <section className={`${panel} ${vis("prod")} @4xl:col-span-2 @6xl:col-span-1`} aria-label="Προϊόντα">
        <div className={head}><span className="size-6 rounded-full bg-eu-navy text-white grid place-items-center text-[length:var(--fs-13)]">3</span><Package className="size-4" aria-hidden /> Προϊόντα {loading && <Loader2 className="size-4 animate-spin text-eu-muted" aria-label="Φόρτωση" />}</div>
        <p className={sub}>{cat || brand ? "Πληκτρολόγησε για να περιορίσεις τη λίστα (τίτλος, κωδικός, μάρκα)." : "Διάλεξε κατηγορία — ή γράψε τίτλο, κωδικό ή EAN για αναζήτηση σε όλο τον κατάλογο."}</p>
        <Filter value={fProd} onChange={setFProd} placeholder={cat ? `Περιορισμός στα ${cat.name}${brand ? ` · ${brand.name}` : ""}…` : "Αναζήτηση σε όλο τον κατάλογο…"} label="Περιορισμός προϊόντων" />
        {(items.length > 0 || fProd) && <p className={sub} role="status">Εμφανίζονται {shown.length.toLocaleString("el-GR")}{total > items.length ? ` από ${total.toLocaleString("el-GR")} — γράψε για να βρεις τα υπόλοιπα` : ` από ${items.length.toLocaleString("el-GR")}`}</p>}
        <ul className="m-0 p-0 list-none grid gap-1 @4xl:max-h-[28rem] @4xl:overflow-y-auto">
          {shown.map((p) => { const on = selected.has(p.id); return (
            <li key={p.id} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${on ? "border-eu-green bg-eu-green/5" : "border-eu-line"}`}>
              {p.image ? <span className="size-10 shrink-0 rounded-lg bg-white bg-center bg-contain bg-no-repeat border border-eu-line-2" style={{ backgroundImage: `url("${p.image}")` }} aria-hidden /> : <span className="size-10 shrink-0 rounded-lg bg-eu-surface" aria-hidden />}
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-eu-ink text-[length:var(--fs-14)] leading-snug line-clamp-2">{p.title}</span>
                <span className="block text-[length:var(--fs-13)]"><strong className="text-eu-ink">{eur(p.price)}</strong> <span className="text-eu-muted">· {p.brand}</span></span>
                <span className="block text-eu-muted text-[length:var(--fs-13)] truncate font-mono">{p.sku}</span>
              </span>
              <button type="button" onClick={() => onProduct(p)} aria-pressed={on} className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-14)] border-2 ${on ? "border-eu-green bg-eu-green text-white" : "border-eu-navy text-eu-navy hover:bg-eu-chip"}`}>
                {on ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}<span className="hidden @xl:inline">{on ? (single ? "Επιλεγμένο" : "Μέσα") : addLabel}</span>
              </button>
            </li>
          ); })}
          {!shown.length && (cat || brand || fProd.trim().length >= 2) && !loading && <li className={sub}>Κανένα προϊόν με αυτό το φίλτρο.</li>}
        </ul>
      </section>
    </div>
    </div>
  );
}
