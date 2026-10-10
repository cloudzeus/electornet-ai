import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isVivaPay } from "@/lib/payments/viva-core";
import { startVivaPayment, validPaymentKey } from "@/lib/payments/order-payment";

/** «Δοκίμασε ξανά»: νέο payment order στη Viva για την εκκρεμή παραγγελία (με τον ασφαλή σύνδεσμο της σελίδας πληρωμής). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { no?: string; k?: string; pay?: string } | null;
  if (!b?.no || !validPaymentKey(b.no, b.k) || !isVivaPay(b.pay)) return NextResponse.json({ ok: false, error: "Μη έγκυρο αίτημα." }, { status: 400 });
  const o = await db.order.findUnique({ where: { number: b.no }, select: { id: true } });
  if (!o) return NextResponse.json({ ok: false, error: "Η παραγγελία δεν βρέθηκε." }, { status: 404 });
  try { return NextResponse.json({ ok: true, redirect: await startVivaPayment(o.id, b.pay) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Δεν ξεκίνησε η πληρωμή." }, { status: 409 }); }
}
