import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings/store";
import { parseAsapWebhook, webhookKeyOk } from "@/lib/couriers/asap/webhook";
import { asapWebhook } from "@/lib/couriers/shipments";

/**
 * Webhooks του LastMily (ASAP): αλλαγή κατάστασης αποστολής και ενημέρωση διαδρομής (ζωντανή παρακολούθηση, άφιξη).
 * Κλειδί από Ρυθμίσεις → ASAP → «Κλειδί webhook», ως ?key= ή «Authorization: Bearer». Χωρίς σωστό κλειδί → 401.
 * Απαντάμε πάντα γρήγορα με 200 όταν το κλειδί είναι σωστό, ώστε το LastMily να μην ξαναστέλνει.
 */
export async function POST(req: Request) {
  const { secrets } = await getSetting("shipping").catch(() => ({ secrets: {} as Record<string, string> }));
  const got = new URL(req.url).searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!webhookKeyOk(secrets.asapWebhookKey, got)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = parseAsapWebhook(await req.json().catch(() => null));
  const r = items.length ? await asapWebhook(items).catch(() => ({ items: items.length, matched: 0 })) : { items: 0, matched: 0 };
  return NextResponse.json({ ok: true, ...r });
}
