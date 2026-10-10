import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";

const REASONS = new Set(["changed-mind", "defective", "wrong-item", "damaged", "not-as-described", "other"]);

/** POST { orderNumber, lines: [{ title, qty }], reason, method, notes }: αίτημα επιστροφής για παραγγελία e-shop του πελάτη. */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { orderNumber?: string; lines?: { title?: string; qty?: number }[]; reason?: string; method?: string; notes?: string };
  const o = await db.order.findFirst({ where: { number: b.orderNumber ?? "", customerId: me.id }, select: { id: true, status: true, lines: { select: { title: true, qty: true } } } });
  if (!o) return NextResponse.json({ ok: false, error: "Η παραγγελία δεν βρέθηκε στον λογαριασμό σου." }, { status: 404 });
  if (["pending", "cancelled", "returned"].includes(o.status)) return NextResponse.json({ ok: false, error: "Αυτή η παραγγελία δεν μπορεί να επιστραφεί." }, { status: 409 });
  const lines = (b.lines ?? []).flatMap((l) => { const ol = o.lines.find((x) => x.title === l.title); const qty = Math.min(ol?.qty ?? 0, Math.max(1, Math.floor(Number(l.qty) || 1))); return ol ? [{ title: ol.title, qty }] : []; });
  if (!lines.length) return NextResponse.json({ ok: false, error: "Διάλεξε τουλάχιστον ένα προϊόν." }, { status: 400 });
  const reason = REASONS.has(b.reason ?? "") ? b.reason! : "other";
  const r = await db.return.create({ data: { orderId: o.id, reason: [reason, b.method, (b.notes ?? "").trim().slice(0, 500)].filter(Boolean).join(" · "), lines } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "order", meta: { by: "customer", action: "return-requested", order: b.orderNumber, returnId: r.id } } }).catch(() => null);
  return NextResponse.json({ ok: true, rma: `RMA-${r.id.slice(-6).toUpperCase()}` });
}
