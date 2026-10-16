import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isVivaPay } from "@/lib/payments/viva-core";
import { startVivaPayment, validPaymentKey } from "@/lib/payments/order-payment";
import { klarnaConfig } from "@/lib/payments/klarna";
import { startKlarnaPayment } from "@/lib/payments/klarna-order";
import { publicOrigin } from "@/lib/account/oauth-flow";

/** «Δοκίμασε ξανά»: νέα σελίδα πληρωμής (Viva ή Klarna απευθείας) για την εκκρεμή παραγγελία, με τον ασφαλή σύνδεσμο. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { no?: string; k?: string; pay?: string } | null;
  const klarna = b?.pay === "klarna" ? await klarnaConfig() : null;
  if (!b?.no || !validPaymentKey(b.no, b.k) || (!klarna && !isVivaPay(b.pay))) return NextResponse.json({ ok: false, error: "Μη έγκυρο αίτημα." }, { status: 400 });
  const o = await db.order.findUnique({ where: { number: b.no }, select: { id: true } });
  if (!o) return NextResponse.json({ ok: false, error: "Η παραγγελία δεν βρέθηκε." }, { status: 404 });
  try {
    const redirect = klarna ? await startKlarnaPayment(o.id, await publicOrigin(req)) : await startVivaPayment(o.id, b.pay as Parameters<typeof startVivaPayment>[1]);
    return NextResponse.json({ ok: true, redirect });
  } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Δεν ξεκίνησε η πληρωμή." }, { status: 409 }); }
}
