import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderKanban, ListChecks } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { transportReady } from "@/lib/email/send";
import { contentHash, startCheck, type Block } from "@/lib/newsletter/core";
import { productCards } from "@/lib/newsletter/draft";
import { renderForWeb } from "@/lib/newsletter/dispatch";
import { canResume, maskEmails, NEWSLETTER_STATUS, toForm } from "@/lib/newsletter/edit";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { Badge } from "@/components/admin/orders/ui";
import { NewsletterControls, NewsletterEditor, NewsletterPreview, type ProductInfo } from "@/components/admin/promos/NewsletterEditor";
import { NewsletterStats, type NewsletterStatsData } from "@/components/admin/promos/NewsletterStats";

export const metadata = { title: "Newsletter" };
export const dynamic = "force-dynamic";

const withBase = (html: string) => html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');

/** Σύνδεσμος κλικ → ετικέτα: προϊόν (τίτλος) ή διαδρομή χωρίς UTM· το utm_content λέει από ποιο σημείο του email. */
function clickLabel(raw: string, titles: Map<string, string>) {
  try {
    const u = new URL(raw);
    const block = u.searchParams.get("utm_content");
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    const path = `${u.pathname}${u.search}`;
    const slug = u.pathname.match(/^\/proion\/([^/]+)/)?.[1];
    const label = (slug && titles.get(decodeURIComponent(slug))) || path;
    const where = block ? ({ hero: "κεφαλίδα", products: "προϊόντα", cta: "κουμπί", text: "κείμενο" } as Record<string, string>)[block] ?? block : null;
    return { key: `${u.origin}${path}`, label, sub: [path !== label ? path : null, where ? `από: ${where}` : null].filter(Boolean).join(" · "), href: `${u.origin}${path}` };
  } catch {
    return { key: raw, label: raw, sub: "", href: raw };
  }
}

async function stats(id: string, n: { recipientCount: number; delivered: number; opened: number; clicked: number; unsubscribed: number; bounced: number; complained: number; log: unknown }): Promise<NewsletterStatsData> {
  const [groups, clicks] = await Promise.all([
    db.newsletterRecipient.groupBy({ by: ["status"], where: { newsletterId: id }, _count: { _all: true } }),
    db.$queryRaw<{ url: string; clicks: number; people: number }[]>`
      SELECT e.url, COUNT(*)::int AS clicks, COUNT(DISTINCT e."recipientId")::int AS people
      FROM "NewsletterEvent" e JOIN "NewsletterRecipient" r ON r.id = e."recipientId"
      WHERE r."newsletterId" = ${id} AND e.type = 'clicked' AND e.url IS NOT NULL
      GROUP BY e.url ORDER BY clicks DESC LIMIT 60`,
  ]);
  const c = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number>;
  const slugs = [...new Set(clicks.map((x) => { try { return new URL(x.url).pathname.match(/^\/proion\/([^/]+)/)?.[1]; } catch { return undefined; } }).filter((x): x is string => !!x).map((s) => decodeURIComponent(s)))];
  const titles = new Map(slugs.length ? (await db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, title: true } })).map((p) => [p.slug, p.title]) : []);
  // ίδιος σύνδεσμος με διαφορετικά UTM (π.χ. κεφαλίδα και κουμπί) → μία γραμμή
  const merged = new Map<string, NewsletterStatsData["clicks"][number]>();
  for (const x of clicks) {
    const l = clickLabel(x.url, titles);
    const prev = merged.get(l.key);
    if (prev) { prev.clicks += x.clicks; prev.people += x.people; if (l.sub && !prev.sub.includes(l.sub)) prev.sub = [prev.sub, l.sub].filter(Boolean).join(" · "); }
    else merged.set(l.key, { label: l.label, sub: l.sub, href: l.href, clicks: x.clicks, people: x.people });
  }
  const log = (Array.isArray(n.log) ? n.log : []) as { at?: string; text?: string; by?: string }[];
  const byIds = [...new Set(log.map((l) => l.by).filter((x): x is string => !!x))];
  const who = new Map(byIds.length ? (await db.staff.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]) : []);
  return {
    recipientCount: n.recipientCount,
    rows: { queued: c.queued ?? 0, sending: c.sending ?? 0, sent: c.sent ?? 0, failed: c.failed ?? 0, skipped: c.skipped ?? 0 },
    delivered: n.delivered, opened: n.opened, clicked: n.clicked, unsubscribed: n.unsubscribed, bounced: n.bounced, complained: n.complained,
    clicks: [...merged.values()].sort((a, b) => b.clicks - a.clicks).slice(0, 30),
    log: log.filter((l) => l.at && l.text).reverse().map((l) => ({ at: l.at!, text: maskEmails(l.text!), by: l.by ? who.get(l.by) ?? null : null })),
  };
}

/**
 * Newsletter προσφοράς: σε πρόχειρο ο editor (πεδία με μετρητές, προϊόντα, κεφαλίδα, κουμπί, κοινό, ζωντανή προεπισκόπηση,
 * δοκιμαστική αποστολή, αποστολή τώρα / προγραμματισμός)· μετά την αποστολή η κατάσταση, τα αποτελέσματα και το ιστορικό.
 */
export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("marketing.newsletter.write");
  const { id } = await params;
  const n = await db.newsletter.findUnique({ where: { id } });
  if (!n) notFound();
  const [promotion, campaign] = await Promise.all([
    n.promotionId ? db.promotion.findUnique({ where: { id: n.promotionId }, select: { id: true, name: true, code: true, status: true, held: true, endsAt: true } }) : null,
    n.campaignId ? db.campaign.findUnique({ where: { id: n.campaignId }, select: { id: true, title: true, code: true, status: true } }) : null,
  ]);
  const source = campaign ? { kind: "Καμπάνια", label: campaign.title, code: campaign.code, href: `/admin/prosfores/kampanies/${campaign.id}`, Icon: FolderKanban }
    : promotion ? { kind: "Προσφορά", label: promotion.name, code: promotion.code, href: `/admin/prosfores/${promotion.id}`, Icon: ListChecks } : null;
  const st = NEWSLETTER_STATUS[n.status] ?? { label: n.status, tone: "neutral" as const, help: "" };
  const html = withBase(await renderForWeb(n));

  const header = (
    <>
      <PromoTabs active="newsletter" title={n.title} lead={n.subject} actions={
        <Link href="/admin/prosfores/newsletter" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white text-eu-ink-2 font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:border-eu-navy"><ArrowLeft className="size-4" aria-hidden /> Όλα τα newsletter</Link>
      } />
      <div data-help="newsletter.source" className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
        <Badge tone={st.tone} title={st.help}>{st.label}</Badge>
        {source ? (
          <Link href={source.href} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-8 hover:border-eu-navy min-w-0">
            <source.Icon className="size-4 text-eu-blue shrink-0" aria-hidden /> {source.kind}: <span className="font-mono">{source.code}</span> · <span className="font-bold break-words">{source.label}</span>
          </Link>
        ) : <span className="text-eu-muted">Γενικό newsletter (χωρίς προσφορά)</span>}
      </div>
    </>
  );

  if (n.status === "draft") {
    const blocks = (Array.isArray(n.blocks) ? n.blocks : []) as unknown as Block[];
    const form = toForm(n);
    const aud = (n.audience && typeof n.audience === "object" && !Array.isArray(n.audience) ? n.audience : {}) as { emails?: unknown };
    const ids = form.productIds;
    const [{ data, secrets }, segments, me, staff, rows, cards] = await Promise.all([
      getSetting("email"),
      db.segment.findMany({ where: { archived: false }, orderBy: { name: "asc" }, select: { id: true, name: true, members: true } }),
      db.staff.findUnique({ where: { id: user.id }, select: { email: true } }),
      db.staff.findMany({ where: { active: true }, orderBy: { name: "asc" }, take: 300, select: { email: true, name: true } }),
      ids.length ? db.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, brand: { select: { name: true } } } }) : [],
      productCards(ids),
    ]);
    const products: Record<string, ProductInfo> = {};
    for (const r of rows) {
      const c = cards.get(r.id);
      products[r.id] = { title: r.title, brand: r.brand.name, price: c?.price ?? null, image: c?.image ?? null, listed: !!c };
    }
    const hash = contentHash({ subject: n.subject, preheader: n.preheader, blocks });
    return (
      <div className="@container grid gap-4 min-w-0">
        {header}
        <NewsletterEditor d={{
          id: n.id, form, contentHash: hash, testHash: n.testHash, testSentAt: n.testSentAt?.toISOString() ?? null,
          testSentCount: n.testSentTo ? n.testSentTo.split(",").filter((x) => x.trim()).length : 0,
          transport: transportReady(data, secrets),
          sourceProblem: (n.promotionId && !promotion) ? "Η προσφορά δεν υπάρχει πια." : (n.campaignId && !campaign) ? "Η καμπάνια δεν υπάρχει πια." : startCheck({ promotion, campaign }, new Date()),
          restricted: Array.isArray(aud.emails) ? aud.emails.length : null,
          products, segments: segments.map((s) => ({ id: s.id, label: `${s.name} (${s.members.toLocaleString("el-GR")} μέλη)` })),
          me: me?.email ?? "", staff, html,
        }} />
      </div>
    );
  }

  const queued = await db.newsletterRecipient.count({ where: { newsletterId: id, status: "queued" } });
  const started = !!n.startedAt;
  return (
    <div className="@container grid gap-4 min-w-0">
      {header}
      <NewsletterControls data-help="newsletter.controls" id={n.id} status={n.status} scheduledAt={n.scheduledAt?.toISOString() ?? null} reason={n.cancelReason} resumable={canResume({ status: n.status, started, queued })} queued={queued} />
      <div className="grid gap-4 @5xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
        <div className="min-w-0">
          <NewsletterStats d={await stats(id, n)} results={started} />
        </div>
        <div className="min-w-0 @5xl:sticky @5xl:top-4">
          <NewsletterPreview html={html} />
        </div>
      </div>
    </div>
  );
}
