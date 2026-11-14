/**
 * Γεγονότα αγοράς προς τα tags των Ρυθμίσεων → «Analytics & pixels» (GA4/Google Ads μέσω gtag, Meta, TikTok).
 * Στέλνει μόνο σε όσα tags έχουν φορτώσει — άρα μόνο με συγκατάθεση και «Ενεργά στο site» (components/site/Analytics).
 * Τα tags φορτώνουν μετά τη σελίδα, γι' αυτό κάθε γεγονός περιμένει έως 10″ το καθένα και στέλνεται μία φορά.
 */
export type TrackEvent = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";
export interface TrackItem { id: string; name: string; brand?: string; price: number; qty?: number }
export interface TrackData { items: TrackItem[]; value: number; /** αριθμός παραγγελίας (purchase) */ id?: string }

const META: Record<TrackEvent, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" };
const TIKTOK: Record<TrackEvent, string> = { ...META, purchase: "CompletePayment" };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Τα τρία μηνύματα, χωρίς browser — δοκιμάζεται στο track.test.ts. */
export function payloads(ev: TrackEvent, d: TrackData) {
  const value = r2(d.value);
  return {
    google: { currency: "EUR", value, ...(d.id ? { transaction_id: d.id } : {}), items: d.items.map((i) => ({ item_id: i.id, item_name: i.name, ...(i.brand ? { item_brand: i.brand } : {}), price: r2(i.price), quantity: i.qty ?? 1 })) },
    meta: [META[ev], { content_type: "product", content_ids: d.items.map((i) => i.id), contents: d.items.map((i) => ({ id: i.id, quantity: i.qty ?? 1 })), value, currency: "EUR" }] as const,
    tiktok: [TIKTOK[ev], { content_type: "product", contents: d.items.map((i) => ({ content_id: i.id, content_name: i.name, price: r2(i.price), quantity: i.qty ?? 1 })), value, currency: "EUR" }] as const,
  };
}

type W = { dataLayer?: unknown[]; google_tag_manager?: unknown; fbq?: (...a: unknown[]) => void; ttq?: { track?: (...a: unknown[]) => void }; euAdsPurchase?: string };

export function track(ev: TrackEvent, d: TrackData) {
  if (typeof window === "undefined" || !d.items.length) return;
  const w = window as unknown as W;
  const p = payloads(ev, d);
  const left = new Set(["google", "meta", "tiktok"]);
  const tick = (n: number) => {
    try {
      if (left.has("google") && w.google_tag_manager && w.dataLayer) {
        left.delete("google");
        const dl = w.dataLayer;
        // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-unused-vars
        const g = function (..._a: unknown[]) { dl.push(arguments); }; // το gtag διαβάζει μόνο `arguments`, όχι πίνακα
        g("event", ev, p.google);
        // μετατροπή Google Ads: «AW-…/ετικέτα» από τις ρυθμίσεις (το βάζει το Analytics component)
        if (ev === "purchase" && w.euAdsPurchase) g("event", "conversion", { send_to: w.euAdsPurchase, value: p.google.value, currency: "EUR", transaction_id: d.id });
      }
      if (left.has("meta") && w.fbq) { left.delete("meta"); w.fbq("track", p.meta[0], p.meta[1], ...(d.id ? [{ eventID: d.id }] : [])); }
      if (left.has("tiktok") && w.ttq?.track) { left.delete("tiktok"); w.ttq.track(p.tiktok[0], p.tiktok[1]); }
    } catch {}
    if (left.size && n < 20) setTimeout(() => tick(n + 1), 500);
  };
  tick(0);
}
