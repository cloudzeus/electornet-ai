import { NextResponse } from "next/server";
import { vivaConfig, vivaWebhookKey } from "@/lib/payments/viva";
import { settleViva } from "@/lib/payments/order-payment";

/**
 * Webhook της Viva (Transaction Payment Created 1796 / Transaction Failed 1798).
 * GET: η Viva ζητά το κλειδί επαλήθευσης όταν ορίζεται το URL. POST: το περιεχόμενο ΔΕΝ το εμπιστευόμαστε —
 * παίρνουμε μόνο το TransactionId και επιβεβαιώνουμε από το API της Viva (κωδικός παραγγελίας + ποσό).
 */
export async function GET() {
  const c = await vivaConfig();
  if (!c) return NextResponse.json({ error: "not configured" }, { status: 404 });
  try { return NextResponse.json({ Key: await vivaWebhookKey(c) }); } catch { return NextResponse.json({ error: "key" }, { status: 502 }); }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { EventTypeId?: number; EventData?: { TransactionId?: string } } | null;
  const id = b?.EventData?.TransactionId;
  if (id && (b?.EventTypeId === 1796 || b?.EventTypeId === 1798)) await settleViva(id).catch(() => null);
  return NextResponse.json({ ok: true });
}
