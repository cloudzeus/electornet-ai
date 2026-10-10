"use client";

import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { ChevronLeft, Images, Loader2, Package, Search, Tag, X, Check } from "lucide-react";
import { brandProductsAction, imageTagsAction, imagesByTagAction, productImagesAction, type PickImage, type PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { MediaPickerDialog } from "@/components/admin/media/MediaPicker";

/** Η μάρκα της σελίδας που επεξεργαζόμαστε — για την καρτέλα «Από προϊόν». */
export const PickerBrand = createContext<{ brandId: string | null; brandName: string } | null>(null);

const norm = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
type Tab = "product" | "tags" | "library";

function Grid({ items, current, onPick, empty }: { items: PickImage[]; current: string; onPick: (u: string) => void; empty: string }) {
  if (!items.length) return <p className="m-0 p-6 text-center text-eu-muted">{empty}</p>;
  return (
    <ul className="m-0 p-0 list-none grid grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5 gap-2">
      {items.map((m) => {
        const on = m.url === current;
        return (
          <li key={m.url}>
            <button type="button" onClick={() => onPick(m.url)} aria-pressed={on} className={`group relative w-full rounded-xl border-2 overflow-hidden bg-white text-left ${on ? "border-eu-navy" : "border-eu-line hover:border-eu-blue"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία */}
              <img src={m.thumb ?? m.url} alt="" loading="lazy" className="block w-full aspect-square object-contain bg-eu-surface" />
              <span className="block px-2 py-1.5 text-[length:var(--fs-13)] text-eu-ink-2 truncate">{m.label}{m.w ? ` · ${m.w}×${m.h}` : ""}</span>
              {on && <span className="absolute top-2 right-2 size-7 rounded-full bg-eu-navy text-white grid place-items-center"><Check className="size-4" aria-hidden /></span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Επιλογή εικόνας (ή βίντεο) με τρεις τρόπους:
 *  · Από προϊόν — προϊόν της μάρκας → οι φωτογραφίες του
 *  · Από tags — tags της βιβλιοθήκης media ή tags προϊόντων
 *  · Βιβλιοθήκη media — όλη η βιβλιοθήκη (φάκελοι, αναζήτηση, ανέβασμα)
 */
export function ImagePickerDialog({ kind = "image", current, onPick, onClose }: { kind?: "image" | "video"; current: string; onPick: (url: string) => void; onClose: () => void }) {
  const brand = useContext(PickerBrand);
  const [tab, setTab] = useState<Tab>(brand ? "product" : "library");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<PickProduct[]>([]);
  const [product, setProduct] = useState<PickProduct | null>(null);
  const [images, setImages] = useState<PickImage[]>([]);
  const [tags, setTags] = useState<{ media: { tag: string; count: number }[]; product: { id: string; name: string; count: number }[] } | null>(null);
  const [tag, setTag] = useState<{ source: "media" | "product"; id: string; name: string } | null>(null);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (tab !== "product" || !brand || products.length) return;
    start(async () => setProducts((await brandProductsAction({ brandId: brand.brandId })).items));
  }, [tab, brand, products.length]);
  useEffect(() => {
    if (tab !== "tags" || tags) return;
    start(async () => setTags(await imageTagsAction(kind)));
  }, [tab, tags, kind]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const pick = (u: string) => { onPick(u); onClose(); };
  const openProduct = (p: PickProduct) => { setProduct(p); setImages([]); start(async () => setImages(await productImagesAction(p.id, kind))); };
  const openTag = (t: { source: "media" | "product"; id: string; name: string }) => { setTag(t); setImages([]); start(async () => setImages(await imagesByTagAction({ source: t.source, tag: t.id, kind }))); };

  if (tab === "library") return <MediaPickerDialog accept={[kind]} canWrite={false} onClose={() => (brand ? setTab("product") : onClose())} onSelect={(a) => { if (a[0]) pick(a[0].url); }} />;

  const shownProducts = q ? products.filter((p) => norm(`${p.title} ${p.sku}`).includes(norm(q))) : products;
  // portal στο body: αλλιώς ένας sticky πρόγονος (π.χ. στήλη ρυθμίσεων) το κλείνει κάτω από άλλες στήλες
  if (typeof document === "undefined" || !document.body) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] @container" role="dialog" aria-modal="true" aria-label={kind === "video" ? "Επιλογή βίντεο" : "Επιλογή εικόνας"}>
      <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" />
      <div className="absolute inset-0 @3xl:inset-6 @6xl:inset-x-[8%] @3xl:rounded-2xl bg-white flex flex-col overflow-hidden shadow-[var(--shadow-overlay)]">
        <div className="flex items-center gap-2 px-4 min-h-14 border-b border-eu-line">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)] flex-1 min-w-0 truncate">{kind === "video" ? "Διάλεξε βίντεο" : "Διάλεξε εικόνα"}</h2>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="px-3 pt-3 grid grid-cols-3 gap-1" role="tablist" aria-label="Από πού">
          {([["product", "Από προϊόν", Package], ["tags", "Από tags", Tag], ["library", "Βιβλιοθήκη", Images]] as const).map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} disabled={k === "product" && !brand} onClick={() => setTab(k)} className={`inline-flex items-center justify-center gap-1.5 rounded-xl min-h-12 px-2 font-bold text-[length:var(--fs-14)] border-2 ${tab === k ? "border-eu-navy bg-eu-chip text-eu-navy" : "border-eu-line text-eu-ink-2 hover:border-eu-blue"} disabled:opacity-40`}><I className="size-4 shrink-0" aria-hidden /><span className="truncate">{l}</span></button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 grid gap-3 content-start">
          {tab === "product" && brand && (product ? (
            <>
              <button type="button" onClick={() => setProduct(null)} className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλα τα προϊόντα</button>
              <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{product.title}</div>
              {loading ? <Loader2 className="size-5 animate-spin text-eu-blue" aria-label="Φόρτωση" /> : <Grid items={images} current={current} onPick={pick} empty={kind === "video" ? "Το προϊόν δεν έχει βίντεο." : "Το προϊόν δεν έχει φωτογραφίες."} />}
            </>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Φίλτρο προϊόντων</span>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Προϊόν ${brand.brandName} — γράψε για να στενέψει…`} className="w-full rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
              </label>
              {loading && !products.length ? <Loader2 className="size-5 animate-spin text-eu-blue" aria-label="Φόρτωση" /> : (
                <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-1">
                  {shownProducts.slice(0, 120).map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => openProduct(p)} className="w-full flex items-center gap-3 rounded-xl px-2 py-1.5 min-h-14 text-left hover:bg-eu-surface">
                        {/* eslint-disable-next-line @next/next/no-img-element -- μικρογραφία */}
                        <span className="size-12 shrink-0 rounded-lg bg-white border border-eu-line overflow-hidden grid place-items-center">{p.image ? <img src={p.image} alt="" loading="lazy" className="max-w-full max-h-full object-contain" /> : <Package className="size-5 text-eu-muted" aria-hidden />}</span>
                        <span className="grid min-w-0"><span className="font-semibold text-eu-ink text-[length:var(--fs-14)] line-clamp-2">{p.title}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{p.sku}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ))}

          {tab === "tags" && (tag ? (
            <>
              <button type="button" onClick={() => setTag(null)} className="justify-self-start inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] min-h-11 hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλα τα tags</button>
              <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{tag.source === "media" ? "Βιβλιοθήκη" : "Προϊόντα"} · #{tag.name}</div>
              {loading ? <Loader2 className="size-5 animate-spin text-eu-blue" aria-label="Φόρτωση" /> : <Grid items={images} current={current} onPick={pick} empty="Καμία εικόνα με αυτό το tag." />}
            </>
          ) : !tags ? <Loader2 className="size-5 animate-spin text-eu-blue" aria-label="Φόρτωση" /> : (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Tags βιβλιοθήκης media</span>
                {tags.media.length ? <div className="flex flex-wrap gap-2">{tags.media.map((t) => <button key={t.tag} type="button" onClick={() => openTag({ source: "media", id: t.tag, name: t.tag })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">#{t.tag}<span className="text-eu-muted font-normal">{t.count}</span></button>)}</div> : <span className="text-eu-muted text-[length:var(--fs-13)]">Δεν υπάρχουν tags ακόμη — βάλε tags στα αρχεία από το Media.</span>}
              </div>
              <div className="grid gap-2">
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Tags προϊόντων</span>
                {tags.product.length ? <div className="flex flex-wrap gap-2">{tags.product.map((t) => <button key={t.id} type="button" onClick={() => openTag({ source: "product", id: t.id, name: t.name })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy">#{t.name}<span className="text-eu-muted font-normal">{t.count}</span></button>)}</div> : <span className="text-eu-muted text-[length:var(--fs-13)]">Κανένα tag προϊόντων.</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  , document.body);
}
