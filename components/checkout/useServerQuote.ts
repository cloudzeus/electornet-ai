"use client";

import { useEffect, useRef, useState } from "react";
import type { Quote } from "@/lib/cart/server";
import type { CartLine } from "@/components/commerce/CartProvider";

/** Ό,τι στέλνει ο server στον browser (/api/checkout/quote) — ποσά σε λεπτά. */
export type ServerQuote = Omit<Quote, "engine" | "trace"> & { trace: { name: string; applied: boolean; amount: number; reason: string }[] };

export interface QuoteParams { coupon?: string | null; payment?: string | null; delivery?: string | null; zip?: string | null; email?: string | null }

/**
 * Ο υπολογισμός είναι πάντα του server (τιμές, προσφορές, κουπόνι, μεταφορικά): ο browser καθρεφτίζει το καλάθι του
 * (PUT /api/cart) και ζητά το αποτέλεσμα. Μόνο η τελευταία απάντηση κρατιέται.
 */
export function useServerQuote(lines: CartLine[], hydrated: boolean, params: QuoteParams) {
  const [quote, setQuote] = useState<ServerQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const { coupon = null, payment = null, delivery = null, zip = null, email = null } = params;
  useEffect(() => {
    if (!hydrated) return;
    if (!lines.length) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        await fetch("/api/cart", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: lines.filter((l) => l.product.fromDb).map((l) => ({ productId: l.product.id, qty: l.qty, addons: l.addons.map((a) => ({ slug: a.slug })) })) }) });
        const r = await fetch("/api/checkout/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ coupon, payment, delivery, zip, email }) });
        const q = (await r.json()) as ServerQuote;
        if (my === seq.current) setQuote(q);
      } catch { /* μένει ο προηγούμενος υπολογισμός */ } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [hydrated, lines, coupon, payment, delivery, zip, email]);
  return { quote: lines.length ? quote : null, setQuote, loading };
}

/** Η γραμμή του server για ένα προϊόν του καλαθιού (ίδιο productId). */
export const quoteLineOf = (q: ServerQuote | null, productId: string) => q?.lines.find((l) => l.productId === productId) ?? null;

/** Ο κωδικός κουπονιού ακολουθεί τον πελάτη από το καλάθι στο checkout (μόνο σε αυτή την καρτέλα). */
const COUPON_KEY = "eu.coupon";
export function savedCoupon(): string | null {
  try { return typeof window === "undefined" ? null : sessionStorage.getItem(COUPON_KEY); } catch { return null; }
}
export function saveCoupon(code: string | null) {
  try { if (code) sessionStorage.setItem(COUPON_KEY, code); else sessionStorage.removeItem(COUPON_KEY); } catch { /* ιδιωτική περιήγηση */ }
}
