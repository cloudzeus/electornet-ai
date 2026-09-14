import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";

/**
 * Transactional email through Settings → «Email & SMS»: SMTP (nodemailer) or
 * Resend / SendGrid / Mailgun HTTP APIs. Every attempt is logged in EmailLog
 * (proof of dispatch for double opt-in and GDPR deliveries). Without a
 * configured transport the message is logged as «skipped» and the console
 * prints the link so development flows keep working.
 */
export async function sendMail(input: { to: string; subject: string; html: string; text?: string; template: string; meta?: unknown }) {
  const { data, secrets } = await getSetting("email");
  const from = `${String(data.fromName || "Euronics")} <${String(data.fromEmail || "noreply@euronics.gr")}>`;
  const transport = String(data.transport || "smtp");
  const log = await db.emailLog.create({ data: { to: input.to, subject: input.subject, template: input.template, provider: transport, meta: (input.meta ?? undefined) as object | undefined } });
  try {
    let messageId: string | null = null;
    if (transport === "resend" && secrets.apiKey) {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${secrets.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }) });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
      messageId = ((await r.json()) as { id?: string }).id ?? null;
    } else if (transport === "sendgrid" && secrets.apiKey) {
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${secrets.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: input.to }] }], from: { email: String(data.fromEmail || "noreply@euronics.gr"), name: String(data.fromName || "Euronics") }, subject: input.subject, content: [{ type: "text/plain", value: input.text ?? "" }, { type: "text/html", value: input.html }] }) });
      if (!r.ok) throw new Error(`SendGrid ${r.status}: ${(await r.text()).slice(0, 200)}`);
      messageId = r.headers.get("x-message-id");
    } else if (transport === "mailgun" && secrets.apiKey) {
      // Mailgun HTTP API. Το domain είναι το επιβεβαιωμένο sending domain —
      // αν δεν έχει οριστεί, το παίρνουμε από το email του αποστολέα.
      const domain = String(data.mailgunDomain || String(data.fromEmail || "").split("@")[1] || "");
      if (!domain) throw new Error("Mailgun: λείπει το sending domain (Ρυθμίσεις → Email & SMS).");
      const region = String(data.mailgunRegion || (String(data.smtpHost ?? "").includes(".eu.") ? "eu" : "us"));
      const base = region === "us" ? "https://api.mailgun.net" : "https://api.eu.mailgun.net";
      const form = new URLSearchParams({ from, to: input.to, subject: input.subject, html: input.html, ...(input.text ? { text: input.text } : {}) });
      const r = await fetch(`${base}/v3/${encodeURIComponent(domain)}/messages`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`api:${secrets.apiKey}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      if (!r.ok) throw new Error(`Mailgun ${r.status}: ${(await r.text()).slice(0, 200)}`);
      messageId = ((await r.json()) as { id?: string }).id ?? null;
    } else if ((transport === "smtp" || transport === "mailgun") && data.smtpHost) {
      const nodemailer = await import("nodemailer");
      const tr = nodemailer.createTransport({ host: String(data.smtpHost), port: Number(data.smtpPort) || 587, secure: Number(data.smtpPort) === 465, auth: data.smtpUser ? { user: String(data.smtpUser), pass: secrets.smtpPass ?? "" } : undefined });
      const info = await tr.sendMail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text });
      messageId = info.messageId;
    } else {
      console.info(`[email skipped — no transport] to=${input.to} subject=${input.subject}\n${input.text ?? ""}`);
      await db.emailLog.update({ where: { id: log.id }, data: { status: "skipped", error: "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS)." } });
      return { ok: false as const, skipped: true as const, logId: log.id };
    }
    await db.emailLog.update({ where: { id: log.id }, data: { status: "sent", messageId } });
    return { ok: true as const, logId: log.id, messageId };
  } catch (e) {
    const error = e instanceof Error ? e.message : "send failed";
    await db.emailLog.update({ where: { id: log.id }, data: { status: "failed", error } });
    return { ok: false as const, skipped: false as const, error, logId: log.id };
  }
}
