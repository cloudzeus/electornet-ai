import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";

/** POST { current, next }: αλλαγή κωδικού. Λογαριασμός μόνο με Google/Microsoft κ.λπ. (χωρίς κωδικό): ορίζει πρώτο κωδικό. */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  const next = b.next ?? "";
  if (next.length < 8) return NextResponse.json({ ok: false, error: "Ο νέος κωδικός θέλει τουλάχιστον 8 χαρακτήρες." }, { status: 400 });
  const c = await db.customer.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (c?.passwordHash && !(await bcrypt.compare(b.current ?? "", c.passwordHash))) return NextResponse.json({ ok: false, error: "Ο τρέχων κωδικός δεν είναι σωστός." }, { status: 400 });
  await db.customer.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await db.customerEvent.create({ data: { customerId: me.id, kind: "profile", meta: { by: "customer", action: c?.passwordHash ? "password-changed" : "password-set" } } }).catch(() => null);
  return NextResponse.json({ ok: true, first: !c?.passwordHash });
}
