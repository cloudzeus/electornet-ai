import { timingSafeEqual } from "node:crypto";
import { stateFromReason, type AsapState } from "./api";

/**
 * Webhooks του LastMily (ASAP). Καθαρές συναρτήσεις: έλεγχος κλειδιού και ανάγνωση των δύο ειδών μηνυμάτων.
 *
 *   Αλλαγή κατάστασης (fulfillment-url):  { reason, date_time, fulfillment_event_description, barcode, voucher_barcode, … }
 *   Ενημέρωση διαδρομής (route-info-url): { items: { routes: [{ route_items: [{ barcode, client_portal_url,
 *                                          is_live_tracking_available, estimated_arrival_time, … }] }] } }
 * Το σχήμα του περιτυλίγματος δεν είναι σταθερό στα docs (αντικείμενο, πίνακας ή μέσα σε «items»): δεχόμαστε όλα.
 */

/** Κλειδί από «Authorization: Bearer …» ή ?key=, σύγκριση σταθερού χρόνου. Χωρίς ρυθμισμένο κλειδί → τίποτα. */
export function webhookKeyOk(expected: string | null | undefined, got: string | null | undefined): boolean {
  const e = (expected ?? "").trim(), g = (got ?? "").trim();
  if (!e || !g) return false;
  const a = Buffer.from(e), b = Buffer.from(g);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface AsapStatusEvent { kind: "status"; barcodes: string[]; state: AsapState | null; checkpoint: { code: string; text: string; at: string | null; shop: null } }
export interface AsapRouteItem { kind: "route"; barcodes: string[]; liveUrl: string | null; eta: Date | null }
export type AsapWebhookItem = AsapStatusEvent | AsapRouteItem;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

/** Όλοι οι κωδικοί με τους οποίους μπορεί να ταιριάξει η αποστολή μας (voucher ή barcode τεμαχίου). */
function barcodesOf(o: Obj): string[] {
  const keys = ["barcode", "voucher_barcode", "alternative_barcode", "secondary_alternative_barcode", "serial_number", "s_n", "group_shipment_unique_identifier"];
  return [...new Set(keys.map((k) => str(o[k])).filter(Boolean))];
}

/** Μόνο https σύνδεσμοι — ό,τι άλλο αγνοείται (ο σύνδεσμος δείχνεται στον πελάτη). */
function safeUrl(v: unknown): string | null {
  try { const u = new URL(str(v)); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

function parseEta(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function routeItem(o: Obj): AsapRouteItem | null {
  const barcodes = barcodesOf(o);
  if (!barcodes.length) return null;
  const live = o.is_live_tracking_available !== false;
  return { kind: "route", barcodes, liveUrl: live ? safeUrl(o.client_portal_url) : null, eta: parseEta(o.estimated_arrival_time) };
}

function statusEvent(o: Obj): AsapStatusEvent | null {
  const barcodes = barcodesOf(o);
  if (!barcodes.length || o.reason === undefined || o.reason === null) return null;
  const code = str(o.reason);
  return {
    kind: "status", barcodes, state: stateFromReason(Number(code)),
    checkpoint: { code, text: str(o.fulfillment_event_description) || str(o.note) || code, at: str(o.date_time) || null, shop: null },
  };
}

/** Ό,τι χρήσιμο έχει ένα μήνυμα webhook (κατάσταση ή διαδρομή), ανεξάρτητα από το περιτύλιγμα. */
export function parseAsapWebhook(body: unknown): AsapWebhookItem[] {
  const out: AsapWebhookItem[] = [];
  const visit = (v: unknown, depth: number): void => {
    if (depth > 4) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (!isObj(v)) return;
    if (Array.isArray(v.routes)) { for (const r of v.routes) if (isObj(r) && Array.isArray(r.route_items)) for (const it of r.route_items) { const x = isObj(it) ? routeItem(it) : null; if (x) out.push(x); } return; }
    if (Array.isArray(v.route_items)) { for (const it of v.route_items) { const x = isObj(it) ? routeItem(it) : null; if (x) out.push(x); } return; }
    if ("client_portal_url" in v || "estimated_arrival_time" in v) { const x = routeItem(v); if (x) out.push(x); return; }
    if ("reason" in v) { const x = statusEvent(v); if (x) out.push(x); return; }
    if ("items" in v) visit(v.items, depth + 1);
  };
  visit(body, 0);
  return out;
}
