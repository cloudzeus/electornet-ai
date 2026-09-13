import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { EMAIL_GROUPS, templateByKey, renderTemplate } from "@/lib/email/templates";
import { EmailPreview } from "@/components/admin/emails/EmailPreview";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) { const t = templateByKey((await params).key); return { title: t ? `Email: ${t.name}` : "Email" }; }

export default async function EmailPage({ params }: { params: Promise<{ key: string }> }) {
  const user = await requirePermission("marketing.emails.write");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3111"}`;
  const { key } = await params;
  const t = templateByKey(key);
  if (!t) notFound();
  const sample = t.sample();
  const m = await renderTemplate(key, sample, { unsubscribeUrl: "#", baseUrl: origin });
  const log = await db.emailLog.findMany({ where: { template: { in: [key, `test:${key}`] } }, orderBy: { at: "desc" }, take: 15 });
  return (
    <>
      <Link href="/admin/emails" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Emails πελατών</Link>
      <EmailPreview
        tpl={{ key: t.key, name: t.name, description: t.description, trigger: t.trigger, group: EMAIL_GROUPS.find((g) => g.key === t.group)?.label ?? t.group, marketing: !!t.marketing }}
        subject={m.subject} html={m.html} text={m.text} sample={JSON.stringify(sample, null, 2)} staffEmail={user.email ?? ""}
        log={log.map((l) => ({ id: l.id, to: l.to, status: l.status, at: l.at.toISOString(), error: l.error, subject: l.subject }))}
      />
    </>
  );
}
