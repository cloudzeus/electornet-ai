import { createHmac } from "node:crypto";

/**
 * ASAP Couriers μέσω LastMily — External API v1 (https://docs.lastmily.com, έκδοση 1.3.12). Καθαρές συναρτήσεις:
 * υπογραφή αιτημάτων, σώμα αποστολής, τηλέφωνα, καταστάσεις.
 *
 *   Υπογραφή: x-sign = hex(HMAC-SHA256(client_secret, client_id + x-time [+ base64(ακριβές σώμα JSON)]))
 *             headers: Authorization: Bearer <client_id> · x-time (unix sec) · x-sign
 *   POST /shipper/shipment       → shipment_id, shipment_barcode, parcels_barcodes, calculated_total_price
 *   POST /shipper/voucher-print  → ετικέτες (PDF)
 *   GET  /fulfillment-events     → γεγονότα (reason) ανά barcode
 *   GET  /external/v1/address-lookup → συντεταγμένες (υποχρεωτικές για τον παραλήπτη)
 * Ακύρωση αποστολής δεν υπάρχει στο API — γίνεται από την ASAP.
 */
export const ASAP_API = "https://apps.lastmily.com/api/external/v1";

export function asapSign(p: { clientId: string; secret: string; time: string; body?: string | null }): string {
  const b64 = p.body ? Buffer.from(p.body, "utf8").toString("base64") : "";
  return createHmac("sha256", p.secret).update(`${p.clientId}${p.time}${b64}`).digest("hex");
}

/** Πρόθεμα (έως 4 χαρακτήρες) και αριθμός χωρίς πρόθεμα (έως 11 ψηφία). Χωρίς πρόθεμα → Ελλάδα. */
export function phoneParts(raw: string | null | undefined): { prefix: string; phone: string } {
  const d = (raw ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");
  if (d.startsWith("+30")) return { prefix: "+30", phone: d.slice(3).slice(0, 11) };
  if (d.startsWith("+")) { const m = /^\+(\d{1,3})(\d+)$/.exec(d); if (m) return { prefix: `+${m[1]}`.slice(0, 4), phone: m[2].slice(0, 11) }; }
  return { prefix: "+30", phone: d.replace(/^30(?=\d{10}$)/, "").slice(0, 11) };
}

export interface AsapAddress { street: string; number?: string | null; zip: string; city: string; region?: string | null }
export const zipDigits = (z: string | null | undefined) => (z ?? "").replace(/\D/g, "").slice(0, 5);
/** Το κείμενο αναζήτησης για τις συντεταγμένες. */
export const geoQuery = (a: AsapAddress) => `${[a.street, a.number].filter(Boolean).join(" ").trim()}, ${zipDigits(a.zip)} ${a.city}`.trim();

export interface AsapShipmentInput {
  courierId: number;
  /** shipment_delivery_type: 1 EXPRESS · 2 μέσω κέντρου · 3 επόμενη εργάσιμη */
  delivery: 1 | 2 | 3;
  order: string;
  recipient: AsapAddress & { name: string; phone: string; lat: number; lon: number; notes?: string | null };
  pieces: number; weightKg: number;
  /** διαστάσεις ανά τεμάχιο (cm)· χωρίς αυτές 30×30×30 */
  dims?: { l: number; w: number; h: number } | null;
  cod?: number | null;
}

export function shipmentBody(i: AsapShipmentInput) {
  const pieces = Math.max(1, Math.min(100, Math.round(i.pieces || 1)));
  const each = Math.max(0.1, Math.round(((i.weightKg || 1) / pieces) * 100) / 100);
  const d = i.dims ?? { l: 30, w: 30, h: 30 };
  const ph = phoneParts(i.recipient.phone);
  return {
    acting_as: 1,
    shipment_service_type: 1, // πόρτα-πόρτα
    shipment_delivery_type: i.delivery,
    courier_company_ids: [i.courierId],
    recipient: {
      name: i.recipient.name.slice(0, 120), contact_phone_prefix: ph.prefix, contact_phone: ph.phone,
      address: {
        lat: i.recipient.lat, lon: i.recipient.lon, postal_code: zipDigits(i.recipient.zip), country_code: "GRC", country: "Ελλάδα",
        city: i.recipient.city, street: i.recipient.street, house_number: i.recipient.number ?? "", state: i.recipient.region ?? undefined,
        free_text: geoQuery(i.recipient),
      },
    },
    parcels_count: pieces,
    parcels: Array.from({ length: pieces }, () => ({ weight_kg: each, length_cm: d.l, width_cm: d.w, height_cm: d.h })),
    references: { order_code: i.order },
    ...(i.recipient.notes?.trim() ? { delivery_notes: i.recipient.notes.trim().slice(0, 1000) } : {}),
    ...(i.cod && i.cod > 0 ? { cash_on_delivery: { currency: "EUR", requested_payment_type: 1, amount: Math.round(i.cod * 100) / 100 } } : {}),
  };
}

export type AsapState = "out-for-delivery" | "delivered" | "attempted" | "cancelled" | "on-hold";
/**
 * reason του LastMily → κατάσταση αποστολής. 1xx–3xx = δεν έχει ξεκινήσει (null) · 4xx–6xx σε διανομή · 700 / 1700
 * παραδόθηκε · 801–803, 805, 806, 815, 816, 818 αποτυχημένη προσπάθεια (ο πελάτης δεν ήταν, λάθος διεύθυνση, αρνήθηκε
 * αντικαταβολή, νέα ημερομηνία) · υπόλοιπα 8xx / 18xx ακύρωση · 900 σε αναμονή.
 */
export function stateFromReason(reason: number | null | undefined): AsapState | null {
  const r = Number(reason);
  if (!Number.isFinite(r) || r < 400) return null;
  if (r === 700 || r === 1700) return "delivered";
  if (r >= 400 && r < 700) return "out-for-delivery";
  if ([801, 802, 803, 805, 806, 815, 816, 818, 1801].includes(r)) return "attempted";
  if (r === 900) return "on-hold";
  if ((r >= 800 && r < 900) || (r >= 1800 && r < 1900)) return "cancelled";
  return null;
}
