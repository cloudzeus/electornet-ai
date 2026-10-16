import { NextResponse } from "next/server";
import { validPaymentKey } from "@/lib/payments/order-payment";
import { settleKlarna } from "@/lib/payments/klarna-order";

/** status_update της Klarna HPP: ειδοποίηση ότι άλλαξε η session — ξαναδιαβάζουμε την κατάσταση από το API της Klarna. */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const no = u.searchParams.get("no") ?? "";
  if (!no || !validPaymentKey(no, u.searchParams.get("k"))) return NextResponse.json({ ok: false }, { status: 400 });
  await settleKlarna(no).catch(() => null);
  return NextResponse.json({ ok: true });
}
