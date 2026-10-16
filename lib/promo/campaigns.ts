import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { bulkPromotions, draftOf, refreshStorefront, savePromotion } from "./admin";
import { budgetUse, campaignDay, liveState, nextCampaignCode, validateCampaign, type CampaignDraft, type CampaignGoal, type CampaignStatus } from "./campaign-core";

/**
 * Καμπάνιες: ο φάκελος των προσφορών, landing pages και banners. Η δημοσίευση / παύση / λήξη εφαρμόζεται και στις
 * προσφορές της καμπάνιας μέσω της υπάρχουσας λογικής των προσφορών (lib/promo/admin.ts), ώστε να ισχύουν οι ίδιοι
 * έλεγχοι και η ίδια έγκριση. Η αρχειοθέτηση καμπάνιας ΔΕΝ αρχειοθετεί / σβήνει προσφορές.
 */
const LIVE_PROMO = ["active", "scheduled", "paused"];
const n = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));

export type CampaignRow = {
  id: string; code: string; title: string; goal: CampaignGoal; status: CampaignStatus; startsAt: Date; endsAt: Date;
  budgetEur: number | null; spent: number; budget: ReturnType<typeof budgetUse>;
  counts: { promos: number; pending: number; landings: number; ads: number; coupons: number };
};

/** Η κατάσταση που βλέπει ο χρήστης: οι δημοσιευμένες από τις ημερομηνίες. */
function shownStatus(c: { status: string; startsAt: Date; endsAt: Date }, now = new Date()): CampaignStatus {
  return ["scheduled", "live", "ended"].includes(c.status) ? liveState(c.startsAt, c.endsAt, now) : (c.status as CampaignStatus);
}

async function spentBy(campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, number>();
  const rows = await db.$queryRaw<{ campaignId: string; spent: Prisma.Decimal | null }[]>`
    SELECT p."campaignId", SUM(u.amount) AS spent FROM "PromotionUsage" u JOIN "Promotion" p ON p.id = u."promotionId"
    WHERE p."campaignId" IN (${Prisma.join(campaignIds)}) GROUP BY p."campaignId"`;
  return new Map(rows.map((r) => [r.campaignId, Number(r.spent ?? 0)]));
}

const FILTER: Record<string, CampaignStatus[]> = { live: ["live"], scheduled: ["scheduled"], draft: ["draft", "review", "approved", "rejected"], paused: ["paused"], ended: ["ended"], all: [] };

export async function listCampaigns(f: { status?: string; q?: string } = {}): Promise<{ rows: CampaignRow[]; counts: Record<string, number> }> {
  const q = f.q?.trim();
  const all = await db.campaign.findMany({
    where: { code: { not: null }, status: { not: "archived" }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ startsAt: "desc" }],
    select: { id: true, code: true, title: true, goal: true, status: true, startsAt: true, endsAt: true, budgetEur: true, promotions: { select: { status: true, _count: { select: { coupons: true } } } }, _count: { select: { landings: true, ads: true } } },
  });
  const spent = await spentBy(all.map((c) => c.id));
  const rows: CampaignRow[] = all.map((c) => {
    const s = spent.get(c.id) ?? 0, b = n(c.budgetEur);
    return {
      id: c.id, code: c.code!, title: c.title, goal: c.goal as CampaignGoal, status: shownStatus(c), startsAt: c.startsAt, endsAt: c.endsAt, budgetEur: b, spent: s, budget: budgetUse(s, b),
      counts: { promos: c.promotions.length, pending: c.promotions.filter((p) => p.status === "pending").length, landings: c._count.landings, ads: c._count.ads, coupons: c.promotions.reduce((a, p) => a + p._count.coupons, 0) },
    };
  });
  const counts: Record<string, number> = Object.fromEntries(Object.entries(FILTER).map(([k, v]) => [k, v.length ? rows.filter((r) => v.includes(r.status)).length : rows.length]));
  const want = FILTER[f.status ?? "all"] ?? [];
  return { rows: want.length ? rows.filter((r) => want.includes(r.status)) : rows, counts };
}

export async function getCampaign(id: string) {
  const c = await db.campaign.findUnique({
    where: { id },
    include: {
      promotions: { orderBy: { createdAt: "asc" }, select: { id: true, code: true, name: true, status: true, mechanism: true, startsAt: true, endsAt: true, usedCount: true, coupons: { select: { code: true, kind: true } } } },
      landings: { orderBy: { createdAt: "asc" }, select: { id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true } },
      ads: { orderBy: { createdAt: "asc" }, select: { id: true, slot: true, title: true, status: true, startsAt: true, endsAt: true, impressions: true, clicks: true } },
    },
  });
  if (!c?.code) return null;
  const [spent, promos, landings, ads] = await Promise.all([
    spentBy([c.id]).then((m) => m.get(c.id) ?? 0),
    db.promotion.findMany({ where: { status: { notIn: ["archived", "ended"] }, NOT: { campaignId: c.id } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, code: true, name: true, status: true, mechanism: true, campaign: { select: { code: true } } } }),
    db.landingPage.findMany({ where: { status: { not: "archived" }, NOT: { campaignId: c.id } }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, slug: true, title: true, status: true, campaign: { select: { code: true } } } }),
    db.adPlacement.findMany({ where: { status: { not: "archived" }, NOT: { campaignId: c.id } }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, slot: true, title: true, status: true, campaign: { select: { code: true } } } }),
  ]);
  const b = n(c.budgetEur);
  return {
    ...c, code: c.code, status: shownStatus(c), budgetEur: b, spent, budget: budgetUse(spent, b),
    available: {
      promotions: promos.map(({ campaign, ...p }) => ({ ...p, campaignCode: campaign?.code ?? null })),
      landings: landings.map(({ campaign, ...p }) => ({ ...p, campaignCode: campaign?.code ?? null })),
      ads: ads.map(({ campaign, ...p }) => ({ ...p, campaignCode: campaign?.code ?? null })),
    },
  };
}

export async function saveCampaign(d: CampaignDraft, staffId: string): Promise<{ ok: true; id: string; code: string } | { ok: false; errors: string[] }> {
  const prev = d.id ? await db.campaign.findUnique({ where: { id: d.id }, include: { promotions: { select: { id: true, name: true, startsAt: true, endsAt: true } } } }) : null;
  if (d.id && !prev) return { ok: false, errors: ["Η καμπάνια δεν βρέθηκε."] };
  if (prev?.status === "archived") return { ok: false, errors: ["Η καμπάνια είναι στο αρχείο."] };
  const v = validateCampaign(d, prev?.promotions ?? [], { publish: false, now: new Date() });
  if (v.errors.length) return { ok: false, errors: v.errors };
  const data = {
    title: d.title.trim().slice(0, 160), goal: d.goal, brief: d.brief?.trim() || null,
    startsAt: campaignDay(d.startsAt, "start")!, endsAt: campaignDay(d.endsAt, "end")!,
    budgetEur: d.budgetEur != null && d.budgetEur > 0 ? new Prisma.Decimal(d.budgetEur) : null, ownerId: d.ownerId ?? prev?.ownerId ?? staffId,
  };
  if (prev) {
    const row = await db.campaign.update({ where: { id: prev.id }, data });
    await audit(staffId, "campaign.update", "Campaign", prev.id, { title: prev.title, startsAt: prev.startsAt, endsAt: prev.endsAt, budgetEur: n(prev.budgetEur) }, { title: row.title, startsAt: row.startsAt, endsAt: row.endsAt, budgetEur: n(row.budgetEur) });
    if (prev.startsAt.getTime() !== row.startsAt.getTime() || prev.endsAt.getTime() !== row.endsAt.getTime()) await syncCampaignDates(prev.id, { startsAt: prev.startsAt, endsAt: prev.endsAt });
    return { ok: true, id: row.id, code: row.code! };
  }
  const year = new Date().getFullYear();
  const codes = (await db.campaign.findMany({ where: { code: { startsWith: `KAM-${year}-` } }, select: { code: true } })).map((x) => x.code!);
  const code = nextCampaignCode(codes, year);
  const row = await db.campaign.create({ data: { ...data, code, slug: code.toLowerCase(), status: "draft", createdById: staffId } });
  await audit(staffId, "campaign.create", "Campaign", row.id, null, { code, title: row.title });
  return { ok: true, id: row.id, code };
}

type Kind = "promotion" | "landing" | "ad";
/** Προσθήκη / αφαίρεση περιεχομένων. Επιστρέφει τους κωδικούς των καμπανιών από τις οποίες μετακινήθηκαν. */
export async function setMembership(campaignId: string, kind: Kind, ids: string[], attach: boolean, staffId?: string): Promise<{ moved: string[] }> {
  const list = ids.slice(0, 300);
  if (!list.length) return { moved: [] };
  const where = { id: { in: list } };
  const prevCodes = attach
    ? (kind === "promotion" ? await db.promotion.findMany({ where: { ...where, campaignId: { not: null }, NOT: { campaignId } }, select: { campaign: { select: { code: true } } } })
      : kind === "landing" ? await db.landingPage.findMany({ where: { ...where, campaignId: { not: null }, NOT: { campaignId } }, select: { campaign: { select: { code: true } } } })
      : await db.adPlacement.findMany({ where: { ...where, campaignId: { not: null }, NOT: { campaignId } }, select: { campaign: { select: { code: true } } } })).map((r) => r.campaign?.code).filter((x): x is string => !!x)
    : [];
  const data = { campaignId: attach ? campaignId : null };
  const scope = attach ? where : { ...where, campaignId };
  if (kind === "promotion") await db.promotion.updateMany({ where: scope, data });
  else if (kind === "landing") await db.landingPage.updateMany({ where: scope, data });
  else await db.adPlacement.updateMany({ where: scope, data });
  if (staffId) await audit(staffId, attach ? "campaign.attach" : "campaign.detach", "Campaign", campaignId, null, { kind, ids: list });
  return { moved: [...new Set(prevCodes)] };
}

/**
 * Δημοσίευση: προσφορές / landings / banners χωρίς δικές τους ημερομηνίες παίρνουν της καμπάνιας· κάθε πρόχειρη
 * προσφορά δημοσιεύεται με τη λογική των προσφορών (όσες θέλουν έγκριση μένουν «Για έγκριση»).
 */
export async function publishCampaign(id: string, staff: { id: string; canApprove: boolean }) {
  const c = await db.campaign.findUnique({ where: { id }, include: { promotions: { include: { targets: true, coupons: true } } } });
  if (!c?.code) return { ok: false, errors: ["Η καμπάνια δεν βρέθηκε."], warnings: [], published: 0, pending: 0 };
  const draft: CampaignDraft = { title: c.title, goal: c.goal as CampaignGoal, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), budgetEur: n(c.budgetEur) };
  const v = validateCampaign(draft, c.promotions, { publish: true, now: new Date() });
  if (v.errors.length) return { ok: false, errors: v.errors, warnings: v.warnings, published: 0, pending: 0 };
  await db.promotion.updateMany({ where: { campaignId: id, startsAt: null }, data: { startsAt: c.startsAt } });
  await db.promotion.updateMany({ where: { campaignId: id, endsAt: null }, data: { endsAt: c.endsAt } });
  for (const m of [db.landingPage, db.adPlacement] as const) {
    await (m as typeof db.landingPage).updateMany({ where: { campaignId: id, startsAt: null }, data: { startsAt: c.startsAt } });
    await (m as typeof db.landingPage).updateMany({ where: { campaignId: id, endsAt: null }, data: { endsAt: c.endsAt } });
  }
  let published = 0, pending = 0;
  const errors: string[] = [];
  const fresh = await db.promotion.findMany({ where: { campaignId: id, status: { in: ["draft", "pending"] } }, include: { targets: true, coupons: true } });
  for (const p of fresh) {
    if (p.status === "pending") { pending++; continue; }
    const r = await savePromotion(draftOf(p), staff, "publish");
    if (!r.ok) errors.push(`«${p.name}»: ${(r.errors ?? []).join(" ")}`);
    else if (r.status === "pending") pending++;
    else published++;
  }
  const status = liveState(c.startsAt, c.endsAt, new Date());
  await db.campaign.update({ where: { id }, data: { status } });
  await audit(staff.id, "campaign.publish", "Campaign", id, { status: c.status }, { status, published, pending, errors: errors.length });
  refreshStorefront();
  return { ok: errors.length === 0, errors, warnings: v.warnings, published, pending };
}

/** Παύση / συνέχεια / λήξη εφαρμόζονται και στις ζωντανές προσφορές· η αρχειοθέτηση λήγει ό,τι τρέχει αλλά κρατά τις προσφορές. */
export async function setCampaignState(id: string, action: "pause" | "resume" | "end" | "archive", staffId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await db.campaign.findUnique({ where: { id }, select: { status: true, startsAt: true, endsAt: true, promotions: { select: { id: true, status: true } } } });
  if (!c) return { ok: false, error: "Η καμπάνια δεν βρέθηκε." };
  const shown = shownStatus(c);
  const live = c.promotions.filter((p) => LIVE_PROMO.includes(p.status)).map((p) => p.id);
  let status: string;
  if (action === "pause") { if (!["live", "scheduled"].includes(shown)) return { ok: false, error: "Παύση γίνεται μόνο σε καμπάνια σε εξέλιξη ή προγραμματισμένη." }; await bulkPromotions(live, "pause", staffId); status = "paused"; }
  else if (action === "resume") { if (shown !== "paused") return { ok: false, error: "Η καμπάνια δεν είναι σε παύση." }; await bulkPromotions(live, "resume", staffId); status = liveState(c.startsAt, c.endsAt, new Date()); }
  else if (action === "end") { await bulkPromotions(live, "end", staffId); status = "ended"; if (c.endsAt > new Date()) await db.campaign.update({ where: { id }, data: { endsAt: new Date() } }); }
  else { await bulkPromotions(live, "end", staffId); status = "archived"; }
  await db.campaign.update({ where: { id }, data: { status } });
  await audit(staffId, `campaign.${action}`, "Campaign", id, { status: c.status }, { status });
  refreshStorefront();
  return { ok: true };
}

/** Οι ημερομηνίες της καμπάνιας άλλαξαν: όσες προσφορές / landings / banners είχαν τις παλιές της, παίρνουν τις νέες. */
export async function syncCampaignDates(id: string, old: { startsAt: Date; endsAt: Date }) {
  const c = await db.campaign.findUnique({ where: { id }, select: { startsAt: true, endsAt: true } });
  if (!c) return;
  for (const m of [db.promotion, db.landingPage, db.adPlacement] as const) {
    await (m as typeof db.landingPage).updateMany({ where: { campaignId: id, startsAt: old.startsAt }, data: { startsAt: c.startsAt } });
    await (m as typeof db.landingPage).updateMany({ where: { campaignId: id, endsAt: old.endsAt }, data: { endsAt: c.endsAt } });
  }
  refreshStorefront();
}
