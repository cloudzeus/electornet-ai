import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/account/session";
import { recordConsent } from "@/lib/gdpr/consent";

const TOPICS = new Set(["orders", "offers", "price-drop", "back-in-stock", "newsletter", "service"]);
const CHANNELS = new Set(["email", "sms", "push", "viber"]);

/** POST { topic, channel, granted }: μία νέα εγγραφή στο μητρώο συναινέσεων (με αποδεικτικά), από τον λογαριασμό. */
export async function POST(req: Request) {
  const me = await getCustomerSession();
  if (!me) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { topic?: string; channel?: string; granted?: boolean };
  if (!b.topic || !TOPICS.has(b.topic) || !b.channel || !CHANNELS.has(b.channel) || typeof b.granted !== "boolean") return NextResponse.json({ ok: false, error: "Μη έγκυρη επιλογή." }, { status: 400 });
  await recordConsent({ customerId: me.id, email: me.email, topic: b.topic, channel: b.channel, granted: b.granted, method: "account-toggle", source: "account", url: req.headers.get("referer") });
  return NextResponse.json({ ok: true, at: new Date().toISOString().slice(0, 10) });
}
