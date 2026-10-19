"use server";

import { requirePermission } from "@/lib/rbac/guard";
import { isEmail } from "@/lib/newsletter/core";
import { audit } from "@/lib/rbac/audit";
import { sendMail } from "@/lib/email/send";
import { renderTemplate, templateByKey } from "@/lib/email/templates";

/** Send the sample of a template to the signed-in staff member (goes through the configured transport, logged in EmailLog). */
export async function sendTestEmail(key: string, to?: string) {
  const user = await requirePermission("marketing.emails.write");
  const tpl = templateByKey(key);
  if (!tpl) return { ok: false as const, error: "Άγνωστο template." };
  // ένας ή περισσότεροι παραλήπτες, χωρισμένοι με κόμμα / ερωτηματικό / κενό (έως 5)
  const list = [...new Set((to?.trim() || user.email || "").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
  if (!list.length) return { ok: false as const, error: "Δεν υπάρχει email παραλήπτη." };
  const bad = list.filter((x) => !isEmail(x));
  if (bad.length) return { ok: false as const, error: `Μη έγκυρο email: ${bad.join(", ")}` };
  if (list.length > 5) return { ok: false as const, error: "Έως 5 παραλήπτες σε δοκιμαστική αποστολή." };
  const m = await renderTemplate(key, tpl.sample(), { unsubscribeUrl: "#" }); // real base URL from settings, like production sends
  const sent: string[] = [];
  let r: Awaited<ReturnType<typeof sendMail>> | null = null;
  for (const addr of list) {
    r = await sendMail({ to: addr, template: `test:${key}`, meta: { by: user.id }, subject: `[TEST] ${m.subject}`, html: m.html, text: m.text });
    if (!r.ok) break;
    sent.push(addr);
  }
  await audit(user.id, "email.test", "EmailTemplate", key, null, { to: list, sent, ok: sent.length === list.length });
  if (sent.length === list.length) return { ok: true as const, message: `Στάλθηκε σε ${sent.join(", ")}.` };
  const why = r && "skipped" in r && r.skipped ? "Δεν έχει ρυθμιστεί αποστολή email (Ρυθμίσεις → Email & SMS). Το μήνυμα καταγράφηκε ως skipped." : (r as { error?: string } | null)?.error ?? "Αποτυχία αποστολής.";
  return { ok: false as const, error: sent.length ? `Στάλθηκε σε ${sent.join(", ")}· όχι στους υπόλοιπους: ${why}` : why };
}
