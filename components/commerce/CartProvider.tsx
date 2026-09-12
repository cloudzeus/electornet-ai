"use client";

import { useSettings } from "@/components/site/SettingsProvider";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/data/types";

export interface CartAddon {
  slug: string;
  title: string;
  price: number;
}

export interface CartLine {
  product: Product;
  qty: number;
  addons: CartAddon[];
  variant?: string;
}

export type Fulfilment = "courier" | "click-collect" | "appointment";

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  addonsTotal: number;
  /** Free shipping threshold in € (dummy rule for the prototype). */
  freeShippingFrom: number;
  add: (p: Product, opts?: { qty?: number; addons?: CartAddon[]; variant?: string; openMiniCart?: boolean }) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  toggleAddon: (productId: string, addon: CartAddon) => void;
  clear: () => void;
  /** Quick buy sheet */
  quickBuy: Product | null;
  openQuickBuy: (p: Product) => void;
  closeQuickBuy: () => void;
  /** Quick view modal (card → product summary without leaving the list) */
  quickView: Product | null;
  openQuickView: (p: Product) => void;
  closeQuickView: () => void;
  /** Mini cart drawer */
  miniOpen: boolean;
  setMiniOpen: (o: boolean) => void;
  lastAdded: Product | null;
  /** Wishlist & compare (ids), persisted */
  wishlist: string[];
  toggleWishlist: (id: string) => void;
  compare: string[];
  toggleCompare: (id: string) => void;
  hydrated: boolean;
}

const CartContext = createContext<CartState | null>(null);
const KEY = "euronics.cart.v1";

interface Persisted {
  lines: CartLine[];
  wishlist: string[];
  compare: string[];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [quickBuy, setQuickBuy] = useState<Product | null>(null);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<Product | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load once after mount (localStorage is per-browser demo state).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw) as Persisted;
          setLines(p.lines ?? []);
          setWishlist(p.wishlist ?? []);
          setCompare(p.compare ?? []);
        }
      } catch {}
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ lines, wishlist, compare } satisfies Persisted));
    } catch {}
  }, [lines, wishlist, compare, hydrated]);

  const add = useCallback<CartState["add"]>((p, opts = {}) => {
    const qty = opts.qty ?? 1;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id && l.variant === opts.variant);
      if (i === -1) return [...ls, { product: p, qty, addons: opts.addons ?? [], variant: opts.variant }];
      const next = [...ls];
      next[i] = { ...next[i], qty: next[i].qty + qty, addons: opts.addons?.length ? opts.addons : next[i].addons };
      return next;
    });
    setLastAdded(p);
    if (opts.openMiniCart !== false) setMiniOpen(true);
  }, []);

  const remove = useCallback((id: string) => setLines((ls) => ls.filter((l) => l.product.id !== id)), []);
  const setQty = useCallback((id: string, qty: number) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, qty: Math.max(1, Math.min(9, qty)) } : l))), []);
  const toggleAddon = useCallback((id: string, addon: CartAddon) => {
    setLines((ls) =>
      ls.map((l) => {
        if (l.product.id !== id) return l;
        const has = l.addons.some((a) => a.slug === addon.slug);
        return { ...l, addons: has ? l.addons.filter((a) => a.slug !== addon.slug) : [...l.addons, addon] };
      }),
    );
  }, []);
  const clear = useCallback(() => setLines([]), []);
  const toggleWishlist = useCallback((id: string) => setWishlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id])), []);
  const toggleCompare = useCallback((id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id])), []);

  const value = useMemo<CartState>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((n, l) => n + l.qty * l.product.price, 0);
    const addonsTotal = lines.reduce((n, l) => n + l.qty * l.addons.reduce((a, x) => a + x.price, 0), 0);
    return {
      lines,
      count,
      subtotal,
      addonsTotal,
      freeShippingFrom: settings.site.commerce.freeShippingFrom,
      add,
      remove,
      setQty,
      toggleAddon,
      clear,
      quickBuy,
      openQuickBuy: setQuickBuy,
      closeQuickBuy: () => setQuickBuy(null),
      quickView,
      openQuickView: setQuickView,
      closeQuickView: () => setQuickView(null),
      miniOpen,
      setMiniOpen,
      lastAdded,
      wishlist,
      toggleWishlist,
      compare,
      toggleCompare,
      hydrated,
    };
  }, [lines, quickBuy, quickView, miniOpen, lastAdded, wishlist, compare, hydrated, add, remove, setQty, toggleAddon, clear, toggleWishlist, toggleCompare]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
