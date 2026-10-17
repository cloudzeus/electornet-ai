import { applyMailgunEvent } from "@/lib/newsletter/events";
import { verifyMailgun } from "@/lib/newsletter/core";
import { getSetting } from "@/lib/settings/store";

/**
 * Webhook Mailgun (JSON). Το Mailgun υπογράφει timestamp + token (όχι το σώμα), γι' αυτό το σώμα διαβάζεται κανονικά.
 * Κλειδί: secret `mailgunWebhookKey` των ρυθμίσεων email· εκτός production και το env `MAILGUN_WEBHOOK_TEST_KEY`.
 * Χωρίς κλειδί → 503 (ποτέ αποδοχή χωρίς υπογραφή)· άκυρη υπογραφή ή ώρα > 900″ → 401.
 */
const out = (status: number, result: string) => Response.json({ result }, { status, headers: { "Cache-Control": "no-store" } });

async function signingKey(): Promise<string | null> {
  const key = (await getSetting("email").catch(() => null))?.secrets.mailgunWebhookKey;
  if (key) return key;
  return process.env.NODE_ENV !== "production" ? process.env.MAILGUN_WEBHOOK_TEST_KEY || null : null;
}

type Payload = {
  signature?: { timestamp?: unknown; token?: unknown; signature?: unknown };
  "event-data"?: { id?: unknown; event?: unknown; recipient?: unknown; severity?: unknown; url?: unknown; timestamp?: unknown; "user-variables"?: { newsletter?: unknown } };
};
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export async function POST(req: Request) {
  const key = await signingKey();
  if (!key) return out(503, "not-configured");
  let p: Payload;
  try { p = (await req.json()) as Payload; } catch { return out(400, "bad-json"); }
  const s = p?.signature;
  if (!s || !verifyMailgun({ timestamp: str(s.timestamp), token: str(s.token), signature: str(s.signature) }, key, Math.floor(Date.now() / 1000))) return out(401, "bad-signature");
  const d = p["event-data"];
  if (!d) return out(400, "no-event");
  const result = await applyMailgunEvent({
    id: str(d.id),
    event: str(d.event),
    recipient: str(d.recipient),
    newsletterId: str(d["user-variables"]?.newsletter) || undefined,
    url: str(d.url) || undefined,
    severity: str(d.severity) || undefined,
    timestamp: Number(d.timestamp),
  });
  return out(200, result);
}
