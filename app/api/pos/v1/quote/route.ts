import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-key";
import { posQuote, type PosBody } from "@/lib/pos/quote";

/**
 * POS API · υπολογισμός καλαθιού στο ταμείο καταστήματος με την ίδια μηχανή προσφορών του e-shop.
 * POST /api/pos/v1/quote · Authorization: Bearer <API key με scope «pos»>
 * { store, lines: [{ code, qty, price? }], coupon?, email?, payment? }
 *  - store: κωδικός υποκαταστήματος ERP (erpBranch), id ή slug του καταστήματος
 *  - code: κωδικός είδους (sku), EAN ή MTRL · price: τιμή ραφιού του καταστήματος με ΦΠΑ (αλλιώς η τιμή του e-shop)
 * Απαντά ανά γραμμή με τα πεδία του παραστατικού (PRICE, DISC1VAL/2/3, COMMENTS). ΜΟΝΟ υπολογισμός: δεν γράφει
 * παραγγελία, δεν μετρά χρήσεις, δεν μιλά με το SoftOne. Τεκμηρίωση: docs/pos-api.md
 */
export async function POST(req: Request) {
  const key = await verifyApiKey(req, "pos");
  if (!key) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const r = await posQuote((await req.json().catch(() => null)) as PosBody | null);
  return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": "no-store" } });
}
