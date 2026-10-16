import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { PromoTabs } from "@/components/admin/promos/PromoTabs";
import { CampaignWizard, type WizardCampaign } from "@/components/admin/promos/CampaignWizard";
import { getCampaign } from "@/lib/promo/campaigns";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { MECHANISM_LABEL } from "@/lib/promo/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: (await params).id === "new" ? "Νέα καμπάνια" : "Καμπάνια" };
}

/** yyyy-mm-dd σε ώρα Ελλάδας (για τα πεδία ημερομηνίας). */
const ymd = (d: Date | null | undefined) => (d ? d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }) : null);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const slotLabel = (k: string) => SLOTS.find((s) => s.key === k)?.label ?? k;

/** Καρτέλα καμπάνιας: ο οδηγός 5 βημάτων (και για νέα). */
export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  await requirePermission("catalog.promos.write");
  const { id } = await params;
  const step = Math.max(0, Math.min(4, Number((await searchParams).step) || 0));
  let campaign: WizardCampaign | null = null;
  if (id !== "new") {
    const c = await getCampaign(id);
    if (!c) notFound();
    campaign = {
      id: c.id, code: c.code, status: c.status, title: c.title, goal: c.goal as WizardCampaign["goal"], brief: c.brief ?? "", startsAt: ymd(c.startsAt)!, endsAt: ymd(c.endsAt)!,
      budgetEur: c.budgetEur, spent: c.spent, budget: c.budget,
      promotions: c.promotions.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, mechanism: p.mechanism, startsAt: iso(p.startsAt), endsAt: iso(p.endsAt), usedCount: p.usedCount, coupons: p.coupons.map((x) => x.code) })),
      landings: c.landings.map((l) => ({ id: l.id, slug: l.slug, title: l.title, status: l.status, startsAt: iso(l.startsAt), endsAt: iso(l.endsAt) })),
      ads: c.ads.map((a) => ({ id: a.id, title: a.title, slot: slotLabel(a.slot), status: a.status, startsAt: iso(a.startsAt), endsAt: iso(a.endsAt), impressions: a.impressions, clicks: a.clicks })),
      available: {
        promotions: c.available.promotions.map((p) => ({ id: p.id, label: p.name, sub: `${p.code} · ${MECHANISM_LABEL[p.mechanism] ?? p.mechanism}`, status: p.status, campaignCode: p.campaignCode })),
        landings: c.available.landings.map((l) => ({ id: l.id, label: l.title, sub: `/prosfores/${l.slug}`, status: l.status, campaignCode: l.campaignCode })),
        ads: c.available.ads.map((a) => ({ id: a.id, label: a.title, sub: slotLabel(a.slot), status: a.status, campaignCode: a.campaignCode })),
      },
    };
  }
  return (
    <div className="@container grid gap-4 min-w-0">
      <PromoTabs active="campaigns" title={campaign ? campaign.title : "Νέα καμπάνια"} lead={campaign ? `${campaign.code} · φάκελος προσφορών, landing pages και banners` : "Ο οδηγός σε 5 βήματα: στόχος, budget, περιεχόμενα, προβολή, έλεγχος."} />
      <CampaignWizard campaign={campaign} initialStep={campaign ? step : 0} />
    </div>
  );
}
