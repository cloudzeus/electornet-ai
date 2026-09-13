import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { recordSnapAction } from "@/lib/snap/identify";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

/** POST: service request from the account / Snap & Find (prefilled brand, model, serial). Sends «service-received». */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; description?: string; deviceId?: string; mode?: string; scanId?: string; device?: string };
  if (!b.description?.trim()) return NextResponse.json({ ok: false, error: "Περιέγραψε το πρόβλημα." }, { status: 400 });
  const n = await db.serviceTicket.count();
  const t = await db.serviceTicket.create({ data: { number: `SRV-${10001 + n}`, customerId: me.id, deviceId: b.deviceId || null, kind: b.kind || "repair", mode: b.mode || "visit", description: b.description.trim(), timeline: [{ at: new Date().toISOString(), status: "new", note: b.scanId ? "Αίτημα από Snap & Find" : "Αίτημα από τον λογαριασμό" }] } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "ticket", meta: { by: "customer", number: t.number, kind: t.kind } } }).catch(() => null);
  if (b.scanId) await recordSnapAction(b.scanId, "service");
  const m = await renderTemplate("service-received", { firstName: me.firstName, number: t.number, device: b.device ?? "—", description: t.description, mode: b.mode === "pickup" ? "Παραλαβή από το σπίτι" : b.mode === "store" ? "Στο κατάστημα" : "Επίσκεψη τεχνικού" });
  await sendMail({ to: me.email, template: "service-received", meta: { ticketId: t.id }, ...m });
  return NextResponse.json({ ok: true, number: t.number });
}
