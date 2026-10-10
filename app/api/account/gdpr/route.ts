import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";

/** POST { type: "access" | "erasure" }: αίτημα GDPR από τον λογαριασμό (ταυτοποίηση = σύνδεση). Το χειρίζεται ο DPO από τη διαχείριση. */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { type?: string };
  if (b.type !== "access" && b.type !== "erasure") return NextResponse.json({ ok: false, error: "Μη έγκυρο αίτημα." }, { status: 400 });
  const open = await db.gdprRequest.findFirst({ where: { customerId: me.id, type: b.type, status: { in: ["open", "verifying", "in-progress"] } }, select: { number: true } });
  if (open) return NextResponse.json({ ok: true, number: open.number, existing: true });
  const count = await db.gdprRequest.count();
  const number = `GDPR-${String(count + 1).padStart(5, "0")}`;
  await db.gdprRequest.create({ data: { number, customerId: me.id, email: me.email ?? "", type: b.type, channel: "account", identityVerifiedAt: new Date(), identityMethod: "login", requestedAt: new Date(), dueAt: new Date(Date.now() + 30 * 86400000), timeline: [{ at: new Date().toISOString(), status: "open", by: "πελάτης (λογαριασμός)" }], description: b.type === "access" ? "Λήψη των δεδομένων μου (άρθρα 15 & 20)" : "Διαγραφή λογαριασμού (άρθρο 17)" } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "gdpr-request", meta: { by: "customer", type: b.type, number } } }).catch(() => null);
  return NextResponse.json({ ok: true, number });
}
