import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { greekMobile, gsmLength } from "./gsm";

/**
 * SMS μέσω του παρόχου των Ρυθμίσεων → «Email & SMS». Υλοποιημένος: Yuboto (OMNI API, POST /omni/v1/Send,
 * Authorization: Basic <API key σε Base64>). Κάθε προσπάθεια καταγράφεται στο EmailLog (provider «sms:…», subject =
 * το κείμενο). Χωρίς πάροχο: «skipped», τίποτα δεν φεύγει.
 */
export async function smsReady(): Promise<boolean> {
  const { data, secrets } = await getSetting("email");
  return data.smsProvider === "yuboto" && !!secrets.smsApiKey && !!String(data.smsSender ?? "").trim();
}

/** Το κλειδί όπως το δίνει το Octapush: είτε το ίδιο (μορφή GUID, με «-») είτε ήδη κωδικοποιημένο σε Base64. */
const basic = (key: string) => (/^[A-Za-z0-9+/]+=*$/.test(key) && key.length % 4 === 0 && !key.includes("-") ? key : Buffer.from(key).toString("base64"));

export async function sendSms(input: { to: string; text: string; template: string; meta?: unknown }) {
  const { data, secrets } = await getSetting("email");
  const provider = String(data.smsProvider || "");
  const to = greekMobile(input.to);
  const log = await db.emailLog.create({ data: { to: to ?? input.to, subject: input.text.slice(0, 300), template: `sms:${input.template}`, provider: `sms:${provider || "none"}`, meta: (input.meta ?? undefined) as object | undefined } });
  const done = (status: "sent" | "failed" | "skipped", extra: { error?: string; messageId?: string | null } = {}) =>
    db.emailLog.update({ where: { id: log.id }, data: { status, error: extra.error ?? null, messageId: extra.messageId ?? null } }).then(() => ({ ok: status === "sent", skipped: status === "skipped", error: extra.error ?? null }));
  if (!to) return done("failed", { error: "Μη έγκυρο ελληνικό κινητό." });
  if (provider !== "yuboto" || !secrets.smsApiKey || !String(data.smsSender ?? "").trim()) {
    console.info(`[sms skipped — no provider] to=${to}\n${input.text}`);
    return done("skipped", { error: "Δεν έχει ρυθμιστεί πάροχος SMS (Ρυθμίσεις → Email & SMS)." });
  }
  const len = gsmLength(input.text);
  try {
    const r = await fetch("https://services.yuboto.com/omni/v1/Send", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
      headers: { authorization: `Basic ${basic(secrets.smsApiKey)}`, "content-type": "application/json; charset=utf-8", accept: "application/json" },
      body: JSON.stringify({ dlr: false, contacts: [{ phonenumber: to }], sms: { sender: String(data.smsSender).trim(), text: input.text, validity: 1440, typesms: len == null ? "unicode" : "sms", longsms: len == null ? input.text.length > 70 : len > 160, priority: 0 } }),
    });
    const j = (await r.json().catch(() => null)) as { ErrorCode?: number; ErrorMessage?: string | null; Message?: { id?: string; errorCode?: number; status?: string }[] } | null;
    const m = j?.Message?.[0];
    if (!r.ok || !j || j.ErrorCode !== 0 || (m && m.errorCode !== 0)) return done("failed", { error: `Yuboto ${r.status}: ${j?.ErrorMessage || m?.status || "σφάλμα"}`.slice(0, 300) });
    return done("sent", { messageId: m?.id ?? null });
  } catch (e) {
    return done("failed", { error: e instanceof Error ? e.message : "send failed" });
  }
}
