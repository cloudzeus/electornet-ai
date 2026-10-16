import "server-only";
import { getSetting } from "@/lib/settings/store";
import { klarnaHost, type HppStatus, type KlarnaMode, type KlarnaOrder } from "./klarna-core";

/**
 * Klarna με απευθείας σύμβαση (όχι μέσω Viva). Στοιχεία από Ρυθμίσεις → Πληρωμές → Klarna: API username / password
 * από το Klarna Merchant Portal (Settings → Klarna API credentials). «Test» = playground, καμία πραγματική χρέωση.
 */
export interface KlarnaConfig { mode: KlarnaMode; username: string; password: string; capture: "shipment" | "immediate" }

export async function klarnaConfig(): Promise<KlarnaConfig | null> {
  const s = await getSetting("payments").catch(() => null);
  if (!s || s.data.klarna !== true || s.data.klarnaVia !== "direct") return null;
  const c: KlarnaConfig = {
    mode: s.data.klarnaMode === "live" ? "live" : "test",
    username: String(s.data.klarnaUsername ?? "").trim(), password: String(s.secrets.klarnaPassword ?? "").trim(),
    capture: s.data.klarnaCapture === "immediate" ? "immediate" : "shipment",
  };
  return c.username && c.password ? c : null;
}

async function api<T>(c: KlarnaConfig, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${klarnaHost(c.mode)}${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { authorization: `Basic ${Buffer.from(`${c.username}:${c.password}`).toString("base64")}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (r.status === 401) throw new Error("Klarna: λάθος API username / password ή λάθος περιβάλλον (test / live).");
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text) as { error_code?: string; error_messages?: string[] }; msg = [j.error_code, ...(j.error_messages ?? [])].filter(Boolean).join(" — "); } catch { /* όχι JSON */ }
    throw new Error(`Klarna ${path.split("/").slice(0, 3).join("/")}: ${r.status} ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const createKpSession = (c: KlarnaConfig, body: unknown) => api<{ session_id: string }>(c, "/payments/v1/sessions", { method: "POST", body: JSON.stringify(body) });
export const createHpp = (c: KlarnaConfig, body: unknown) => api<{ session_id: string; redirect_url: string }>(c, "/hpp/v1/sessions", { method: "POST", body: JSON.stringify(body) });
export const getHpp = (c: KlarnaConfig, id: string) => api<HppStatus>(c, `/hpp/v1/sessions/${encodeURIComponent(id)}`);
export const getKlarnaOrder = (c: KlarnaConfig, id: string) => api<KlarnaOrder>(c, `/ordermanagement/v1/orders/${encodeURIComponent(id)}`);
/** Χρέωση (μετά την αποστολή). Idempotency: το ίδιο Klarna-Idempotency-Key δεν χρεώνει δεύτερη φορά. */
export const captureKlarna = (c: KlarnaConfig, id: string, cents: number, key: string) =>
  api<unknown>(c, `/ordermanagement/v1/orders/${encodeURIComponent(id)}/captures`, { method: "POST", body: JSON.stringify({ captured_amount: cents }), headers: { "Klarna-Idempotency-Key": key } });
export const cancelKlarna = (c: KlarnaConfig, id: string) => api<unknown>(c, `/ordermanagement/v1/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const refundKlarna = (c: KlarnaConfig, id: string, cents: number, key: string) =>
  api<unknown>(c, `/ordermanagement/v1/orders/${encodeURIComponent(id)}/refunds`, { method: "POST", body: JSON.stringify({ refunded_amount: cents }), headers: { "Klarna-Idempotency-Key": key } });

/** «Δοκιμή σύνδεσης»: δημιουργεί μια δοκιμαστική session 1 € (καμία χρέωση, λήγει μόνη της σε 48 ώρες). */
export async function testKlarna(c: KlarnaConfig): Promise<{ ok: boolean; message: string }> {
  try {
    await createKpSession(c, { purchase_country: "GR", purchase_currency: "EUR", locale: "el-GR", intent: "buy", order_amount: 100, order_tax_amount: 19, order_lines: [{ type: "physical", name: "Δοκιμή σύνδεσης", quantity: 1, unit_price: 100, tax_rate: 2400, total_amount: 100, total_discount_amount: 0, total_tax_amount: 19 }] });
    return { ok: true, message: `Η Klarna (${c.mode === "live" ? "live" : "playground"}) δέχτηκε τα στοιχεία. Δεν έγινε καμία χρέωση.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Η σύνδεση με την Klarna απέτυχε." };
  }
}
