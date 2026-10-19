import "server-only";
import { getSetting } from "@/lib/settings/store";
import { ASAP_API, asapSign, geoQuery, shipmentBody, stateFromReason, type AsapAddress, type AsapShipmentInput, type AsapState } from "./api";

/**
 * Client του LastMily (ASAP Couriers). Στοιχεία από Ρυθμίσεις → Αποστολές & courier → ASAP Couriers (LastMily):
 * Client ID, Client secret, ID της ASAP στο LastMily, ταχύτητα παράδοσης, (προαιρετικά) διεύθυνση API.
 * Κάθε αίτημα υπογράφεται (lib/couriers/asap/api.ts). Αποστολέας = η εταιρεία / αποθήκη του λογαριασμού LastMily.
 */
export interface AsapConfig { clientId: string; secret: string; courierId: number; delivery: 1 | 2 | 3; base: string }

export class AsapError extends Error { constructor(message: string, public status: number | null = null) { super(message); } }

export async function asapConfig(): Promise<AsapConfig | null> {
  const { data, secrets } = await getSetting("shipping").catch(() => ({ data: {} as Record<string, unknown>, secrets: {} as Record<string, string> }));
  const str = (v: unknown) => String(v ?? "").trim();
  const d = Number(data.asapDelivery);
  const c: AsapConfig = {
    clientId: str(data.asapClientId), secret: str(secrets.asapClientSecret), courierId: Number(str(data.asapCourierId)) || 0,
    delivery: d === 2 || d === 3 ? d : 1, base: (str(data.asapApiUrl) || ASAP_API).replace(/\/$/, ""),
  };
  return c.clientId && c.secret && c.courierId ? c : null;
}

/** Υπογεγραμμένο αίτημα· το σώμα στέλνεται ακριβώς όπως υπογράφηκε. Σφάλμα → AsapError με το μήνυμα του API. */
async function call<T>(c: AsapConfig, method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const body = opts.body === undefined ? null : JSON.stringify(opts.body);
  const time = String(Math.floor(Date.now() / 1000));
  const url = `${c.base}${path}${opts.query ? `?${new URLSearchParams(opts.query)}` : ""}`;
  const r = await fetch(url, {
    method, cache: "no-store", signal: AbortSignal.timeout(45000),
    headers: { "content-type": "application/json", accept: opts.raw ? "application/pdf, application/json" : "application/json", authorization: `Bearer ${c.clientId}`, "x-time": time, "x-sign": asapSign({ clientId: c.clientId, secret: c.secret, time, body }), "accept-language": "el-GR" },
    ...(body ? { body } : {}),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string; error?: string; errors?: unknown } | null;
    const why = j?.message ?? j?.error ?? (j?.errors ? JSON.stringify(j.errors).slice(0, 300) : `HTTP ${r.status}`);
    throw new AsapError(r.status === 401 ? "ASAP (LastMily): λάθος Client ID / Client secret." : `ASAP (LastMily) ${path}: ${why}`, r.status);
  }
  return (opts.raw ? Buffer.from(await r.arrayBuffer()) : await r.json()) as T;
}

/** Δοκιμή σύνδεσης: λίστα αποθηκών του λογαριασμού. */
export async function asapPing(c: AsapConfig) { await call(c, "GET", "/depots"); return true; }

/** Συντεταγμένες μιας διεύθυνσης (υποχρεωτικές για τον παραλήπτη) από την υπηρεσία του LastMily. */
export async function asapGeocode(c: AsapConfig, a: AsapAddress): Promise<{ lat: number; lon: number } | null> {
  const j = await call<{ items?: { position?: [number, number] | { lat: number; lng: number } }[] }>(c, "GET", "/external/v1/address-lookup", { query: { searchAddress: geoQuery(a), countryCode: "GRC" } });
  const p = j.items?.[0]?.position;
  if (!p) return null;
  return Array.isArray(p) ? { lat: Number(p[0]), lon: Number(p[1]) } : { lat: Number(p.lat), lon: Number(p.lng) };
}

export async function asapCreateShipment(c: AsapConfig, i: Omit<AsapShipmentInput, "courierId" | "delivery" | "recipient"> & { recipient: Omit<AsapShipmentInput["recipient"], "lat" | "lon"> }) {
  const geo = await asapGeocode(c, i.recipient);
  if (!geo) throw new AsapError(`ASAP: δεν βρέθηκε η διεύθυνση «${geoQuery(i.recipient)}» — διόρθωσέ τη στην παραγγελία.`);
  const r = await call<{ shipment_id?: number; shipment_barcode?: string; parcels_barcodes?: string[]; calculated_total_price?: number }>(c, "POST", "/shipper/shipment", { body: shipmentBody({ ...i, courierId: c.courierId, delivery: c.delivery, recipient: { ...i.recipient, ...geo } }) });
  if (!r.shipment_id || !r.shipment_barcode) throw new AsapError("ASAP: δεν επέστρεψε αριθμό αποστολής.");
  return { shipmentId: String(r.shipment_id), voucher: r.shipment_barcode, parcels: r.parcels_barcodes ?? [], price: r.calculated_total_price ?? null };
}

/** Ετικέτες (PDF) για πολλές αποστολές μαζί. */
export async function asapLabels(c: AsapConfig, shipmentIds: string[]): Promise<Buffer> {
  const out = await call<Buffer>(c, "POST", "/shipper/voucher-print", { body: { shipment_ids: shipmentIds.map(Number), returnPdf: true }, raw: true });
  if (out.subarray(0, 4).toString("latin1") === "%PDF") return out;
  // κάποιες εκδόσεις επιστρέφουν JSON με base64
  const j = JSON.parse(out.toString("utf8")) as { items?: (string | { pdf?: string; base64?: string })[] };
  const b64 = (j.items ?? []).map((x) => (typeof x === "string" ? x : x.pdf ?? x.base64 ?? "")).find(Boolean);
  if (!b64) throw new AsapError("ASAP: δεν επέστρεψε ετικέτες.");
  return Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64");
}

export interface AsapTrack { state: AsapState | null; deliveredAt: string | null; checkpoints: { code: string; text: string; at: string | null; shop: string | null }[] }
export async function asapTrack(c: AsapConfig, barcode: string): Promise<AsapTrack> {
  const j = await call<{ items?: { reason?: number; description?: string; fulfillment_datetime?: string; partner_status_message?: string }[] }>(c, "GET", "/fulfillment-events", { query: { barcode } });
  const items = [...(j.items ?? [])].sort((a, b) => String(a.fulfillment_datetime ?? "").localeCompare(String(b.fulfillment_datetime ?? "")));
  const checkpoints = items.map((x) => ({ code: String(x.reason ?? ""), text: x.partner_status_message || x.description || String(x.reason ?? ""), at: x.fulfillment_datetime ?? null, shop: null }));
  const last = items.at(-1);
  const state = stateFromReason(last?.reason);
  return { state, deliveredAt: state === "delivered" ? last?.fulfillment_datetime ?? null : null, checkpoints };
}
