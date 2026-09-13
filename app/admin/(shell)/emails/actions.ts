"use server";

import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { sendMail } from "@/lib/email/send";
import { renderTemplate, templateByKey } from "@/lib/email/templates";

/** Send the sample of a template to the signed-in staff member (goes through the configured transport, logged in EmailLog). */
export async function sendTestEmail(key: string, to?: string) {
  const user = await requirePermission("marketing.emails.write");
  const tpl = templateByKey(key);
  if (!tpl) return { ok: false as const, error: "Άγνωστο template." };
  const addr = (to ?? user.email ?? "").trim();
  if (!addr) return { ok: false as const, error: "Δεν υπάρχει email παραλήπτη." };
  const m = await renderTemplate(key, tpl.sample(), { unsubscribeUrl: "#" }); // real base URL from settings, like production sends
  const r = await sendMail({ to: addr, template: `test:${key}`, meta: { by: user.id }, subject: `[TEST] ${m.subject}`, html: m.html, text: m.text });
  await audit(user.id, "email.test", "EmailTemplate", key, null, { to: addr, ok: r.ok });
  return r.ok ? { ok: true as const, message: `Στάλθηκε στο ${addr}.` } : { ok: false as const, error: "skipped" in r && r.skipped ? "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS). Το μήνυμα καταγράφηκε ως skipped." : (r as { error?: string }).error ?? "Αποτυχία αποστολής." };
}
