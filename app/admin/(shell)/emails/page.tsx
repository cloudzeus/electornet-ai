import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { EMAIL_GROUPS, EMAIL_TEMPLATES, renderTemplate } from "@/lib/email/templates";

export const metadata = { title: "Emails πελατών" };
export const dynamic = "force-dynamic";

/** Every customer email, grouped by job, with a live thumbnail rendered from its sample data. */
export default async function EmailsPage() {
  await requirePermission("marketing.emails.write");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3111"}`;
  const [sent, transport] = await Promise.all([db.emailLog.groupBy({ by: ["template"], _count: { _all: true } }), db.setting.findUnique({ where: { section: "email" } })]);
  const count = (k: string) => sent.find((s) => s.template === k)?._count._all ?? 0;
  const previews = await Promise.all(EMAIL_TEMPLATES.map(async (t) => [t.key, (await renderTemplate(t.key, t.sample(), { unsubscribeUrl: "#", baseUrl: origin })).html] as const));
  const html = new Map(previews);
  const configured = !!(transport?.data as Record<string, unknown> | null)?.smtpHost || !!(transport?.data as Record<string, unknown> | null)?.transport;
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Επικοινωνία</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Emails πελατών</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Όλα τα μηνύματα που στέλνει το κατάστημα, ανά εργασία. Κοινό layout με το site (navy κεφαλίδα, κίτρινο κουμπί, Manrope), ασφαλές για Gmail / Outlook / Apple Mail, με έκδοση απλού κειμένου. Άνοιξε ένα για προεπισκόπηση desktop/κινητού και δοκιμαστική αποστολή.</p>
        {!configured && <p className="m-0 mt-2 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2 inline-block">Η αποστολή δεν έχει ρυθμιστεί ακόμη — <Link href="/admin/settings/email" className="underline">Ρυθμίσεις → Email & SMS</Link>.</p>}
      </div>
      {EMAIL_GROUPS.map((g) => { const items = EMAIL_TEMPLATES.filter((t) => t.group === g.key); if (!items.length) return null; return (
        <section key={g.key} className="grid gap-3">
          <div><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{g.label} <span className="text-eu-muted font-normal text-[length:var(--fs-14)]">· {items.length}</span></h3><p className="m-0 text-eu-muted text-[length:var(--fs-14)]">{g.blurb}</p></div>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-3 gap-3">
            {items.map((t) => (
              <li key={t.key}>
                <Link href={`/admin/emails/${t.key}`} className="group grid rounded-2xl bg-white border border-eu-line overflow-hidden hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
                  <div className="relative h-44 bg-eu-surface overflow-hidden pointer-events-none">
                    <iframe title={t.name} srcDoc={html.get(t.key)} sandbox="" tabIndex={-1} className="absolute top-0 left-1/2 -translate-x-1/2 w-[640px] h-[880px] origin-top scale-[0.42] border-0" />
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-eu-surface to-transparent" />
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2"><div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{t.name}</div><ChevronRight className="size-4 text-eu-muted group-hover:text-eu-blue shrink-0 mt-1" aria-hidden /></div>
                    <div className="text-eu-muted text-[length:var(--fs-13)] mt-0.5 line-clamp-2">{t.description}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[length:var(--fs-13)] font-bold"><span className="rounded-full bg-eu-surface px-2 py-0.5 text-eu-ink-2 font-mono">{t.key}</span>{t.marketing && <span className="rounded-full bg-eu-yellow/40 px-2 py-0.5 text-eu-navy">marketing · χρειάζεται συναίνεση</span>}<span className="rounded-full bg-eu-surface px-2 py-0.5 text-eu-muted">{count(t.key)} σταλμένα</span></div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ); })}
    </>
  );
}
