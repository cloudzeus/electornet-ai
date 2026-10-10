import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordConsent } from "@/lib/gdpr/consent";
import { verifyDeviceToken } from "@/lib/warranty/link";
import { extendDevice } from "@/lib/warranty/server";
import { startPaidExtension } from "@/lib/warranty/paid";

/**
 * Ενέργειες από τον προσωπικό σύνδεσμο της συσκευής (SMS / email), χωρίς σύνδεση:
 * free = δωρεάν επέκταση · pay = πληρωμή επέκτασης στη Viva · optout = τέλος στις υπενθυμίσεις service & εγγύησης.
 * Όλοι οι όροι ελέγχονται εδώ.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = verifyDeviceToken((await params).token);
  if (!id) return NextResponse.json({ ok: false, error: "Ο σύνδεσμος δεν είναι έγκυρος." }, { status: 404 });
  const d = await db.customerDevice.findUnique({ where: { id }, select: { id: true, customerId: true, customer: { select: { email: true, status: true } } } });
  if (!d || d.customer.status !== "active") return NextResponse.json({ ok: false, error: "Η συσκευή δεν βρέθηκε." }, { status: 404 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "free") {
    const r = await extendDevice(d.customerId, d.id);
    return NextResponse.json(r.ok ? { ok: true, extendedUntil: r.extendedUntil.toISOString().slice(0, 10) } : r, { status: r.ok ? 200 : 409 });
  }
  if (action === "pay") {
    const r = await startPaidExtension(d.customerId, d.id);
    return NextResponse.json(r, { status: r.ok ? 200 : 409 });
  }
  if (action === "optout") {
    for (const channel of ["sms", "email"]) await recordConsent({ customerId: d.customerId, email: d.customer.email, topic: "service", channel, granted: false, method: "reminder-link", source: "warranty-link", url: req.headers.get("referer") });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "Άγνωστη ενέργεια." }, { status: 400 });
}
