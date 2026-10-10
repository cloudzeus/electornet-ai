import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { extendDevice } from "@/lib/warranty/server";

/** POST: δωρεάν επέκταση εγγύησης +2 έτη για συσκευή του πελάτη (οι όροι ελέγχονται στον server — βλ. canExtend). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const r = await extendDevice(me.id, (await params).id);
  return NextResponse.json(r.ok ? { ok: true, extendedUntil: r.extendedUntil.toISOString().slice(0, 10) } : r, { status: r.ok ? 200 : 409 });
}
