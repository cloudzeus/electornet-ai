import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { isVivaPay } from "@/lib/payments/viva-core";
import { startPaidExtension } from "@/lib/warranty/paid";

/** POST: επέκταση εγγύησης επί πληρωμή → διεύθυνση πληρωμής στη Viva. Όροι και τιμή υπολογίζονται εδώ, στον server. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { pay?: string };
  const r = await startPaidExtension(me.id, (await params).id, isVivaPay(b.pay) ? b.pay : "card");
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}
