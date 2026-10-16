import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { bulkPromotions, draftOf, refreshStorefront, savePromotion } from "./admin";
import { budgetUse, campaignDay, displayStatus, liveState, nextCampaignCode, takesCampaignDates, validateCampaign, type CampaignDraft, type CampaignGoal, type CampaignStatus } from "./campaign-core";

/**
 * Καμπάνιες: ο φάκελος των προσφορών, landing pages και banners. Η δημοσίευση / παύση / λήξη εφαρμόζεται και στις
 * προσφορές της καμπάνιας μέσω της υπάρχουσας λογικής των προσφορών (lib/promo/admin.ts), ώστε να ισχύουν οι ίδιοι
 * έλεγχοι και η ίδια έγκριση. Η αρχειοθέτηση καμπάνιας ΔΕΝ αρχειοθετεί / σβήνει προσφορές.
 */
const LIVE_PROMO = ["active", "scheduled", "paused"];
/** «όχι σε αυτή την καμπάνια» — μαζί με όσα δεν ανήκουν σε καμία (το SQL NOT x = id αφήνει έξω τα NULL) */
const notIn = (id: string) => [{ campaignId: null }, { campaignId: { not: id } }];
const n = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));

export type CampaignRow = {
  id: string; code: string; title: string; goal: CampaignGoal; status: CampaignStatus; startsAt: Date; endsAt: Date;
  budgetEur: number | null; spent: number; budget: ReturnType<typeof budgetUse>;
  counts: { promos: number; pending: number; landings: number; ads: number; coupons: number };
};

/** Η κατάσταση που βλέπει ο χρήστης: οι δημοσιευμένες από τις ημερομηνίες. */
const shownStatus = (c: { status: string; startsAt: Date; endsAt: Date }, now = new Date()): CampaignStatus => displayStatus(c.status, c.startsAt, c.endsAt, now);
type Staff = { id: string; canApprove: boolean };
/** Η καμπάνια έχει δημοσιευτεί (ό,τι προστίθεται παίρνει τις ημερομηνίες της). */
const PUBLISHED = ["scheduled", "live", "paused"];

/**
 * Νέες ημερομηνίες σε προσφορά της καμπάνιας: τα πρόχειρα αλλάζουν κατευθείαν· οι ζωντανές μέσω της λογικής των
 * προσφορών (νέα έκδοση / στιγμιότυπο, έγκριση όπου χρειάζεται) — ώστε οι παραγγελίες να δείχνουν τους όρους που ίσχυαν.
 */
async function redatePromotion(id: string, dates: { startsAt?: Date; endsAt?: Date }, staff: Staff) {
  const p = await db.promotion.findUnique({ where: { id }, include: { targets: true, coupons: true } });
  if (!p || ["archived", "ended"].includes(p.status)) return;
  if (p.status === "draft") { await db.promotion.update({ where: { id }, data: dates }); return; }
  const d = draftOf(p);
  await savePromotion({ ...d, ...(dates.startsAt ? { startsAt: dates.startsAt.toISOString() } : {}), ...(dates.endsAt ? { endsAt: dates.endsAt.toISOString() } : {}) }, staff, "draft");
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
    db.promotion.findMany({ where: { status: { notIn: ["archived", "ended"] }, OR: notIn(c.id) }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, code: true, name: true, status: true, mechanism: true, campaign: { select: { code: true } } } }),
    db.landingPage.findMany({ where: { status: { not: "archived" }, OR: notIn(c.id) }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, slug: true, title: true, status: true, campaign: { select: { code: true } } } }),
    db.adPlacement.findMany({ where: { status: { not: "archived" }, OR: notIn(c.id) }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, slot: true, title: true, status: true, campaign: { select: { code: true } } } }),
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

export async function saveCampaign(d: CampaignDraft, staffArg: string | Staff): Promise<{ ok: true; id: string; code: string } | { ok: false; errors: string[] }> {
  const staff: Staff = typeof staffArg === "string" ? { id: staffArg, canApprove: false } : staffArg;
  const staffId = staff.id;
  const prev = d.id ? await db.campaign.findUnique({ where: { id: d.id }, include: { promotions: { select: { id: true, name: true, startsAt: true, endsAt: true, status: true } } } }) : null;
  if (d.id && !prev) return { ok: false, errors: ["Η καμπάνια δεν βρέθηκε."] };
  if (prev && ["archived", "ended"].includes(prev.status)) return { ok: false, errors: [prev.status === "archived" ? "Η καμπάνια είναι στο αρχείο." : "Η καμπάνια έχει λήξει — δεν αλλάζει πια."] };
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
    if (prev.startsAt.getTime() !== row.startsAt.getTime() || prev.endsAt.getTime() !== row.endsAt.getTime()) await syncCampaignDates(prev.id, { startsAt: prev.startsAt, endsAt: prev.endsAt }, staff);
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
  if (attach) {
    // σε δημοσιευμένη καμπάνια, ό,τι πρόχειρο προστίθεται χωρίς ημερομηνίες παίρνει τις δικές της (τα ζωντανά δεν αλλάζουν σιωπηλά)
    const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true, startsAt: true, endsAt: true } });
    if (c && PUBLISHED.includes(c.status)) {
      const draft = { id: { in: list }, status: "draft", startsAt: null } as const;
      if (kind === "promotion") await db.promotion.updateMany({ where: draft, data: { startsAt: c.startsAt, endsAt: c.endsAt } });
      else if (kind === "landing") await db.landingPage.updateMany({ where: draft, data: { startsAt: c.startsAt, endsAt: c.endsAt } });
      else await db.adPlacement.updateMany({ where: draft, data: { startsAt: c.startsAt, endsAt: c.endsAt } });
    }
  }
  if (staffId) await audit(staffId, attach ? "campaign.attach" : "campaign.detach", "Campaign", campaignId, null, { kind, ids: list });
  return { moved: [...new Set(prevCodes)] };
}

/**
 * Δημοσίευση (μία φορά, από πρόχειρη): τα πρόχειρα χωρίς δικές τους ημερομηνίες παίρνουν της καμπάνιας — ό,τι τρέχει
 * ήδη δεν αλλάζει σιωπηλά. Κάθε πρόχειρη προσφορά δημοσιεύεται με τη λογική των προσφορών (όσες θέλουν έγκριση μένουν
 * «Για έγκριση»). rejected = τίποτα δεν άλλαξε· errors χωρίς rejected = η καμπάνια δημοσιεύτηκε, κάποιες προσφορές όχι.
 */
export async function publishCampaign(id: string, staff: Staff) {
  const none = { published: 0, pending: 0 };
  const c = await db.campaign.findUnique({ where: { id }, include: { promotions: { include: { targets: true, coupons: true } } } });
  if (!c?.code) return { rejected: true, errors: ["Η καμπάνια δεν βρέθηκε."], warnings: [], ...none };
  const draft: CampaignDraft = { title: c.title, goal: c.goal as CampaignGoal, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), budgetEur: n(c.budgetEur) };
  const v = validateCampaign(draft, c.promotions, { publish: true, now: new Date() });
  if (v.errors.length) return { rejected: true, errors: v.errors, warnings: v.warnings, ...none };
  // ατομική «κράτηση»: δύο ταυτόχρονες δημοσιεύσεις ή δημοσίευση σε ήδη δημοσιευμένη / σε παύση / αρχείο δεν περνούν
  const claimed = await db.campaign.updateMany({ where: { id, status: { in: ["draft", "approved", "rejected"] } }, data: { status: liveState(c.startsAt, c.endsAt, new Date()) } });
  if (claimed.count !== 1) return { rejected: true, errors: ["Η καμπάνια έχει ήδη δημοσιευτεί."], warnings: v.warnings, ...none };
  const fill = { startsAt: c.startsAt, endsAt: c.endsAt };
  await db.landingPage.updateMany({ where: { campaignId: id, status: "draft", startsAt: null }, data: fill });
  await db.adPlacement.updateMany({ where: { campaignId: id, status: "draft", startsAt: null }, data: fill });
  let published = 0, pending = 0;
  const errors: string[] = [];
  for (const p of c.promotions) {
    if (p.status === "pending") { pending++; continue; }
    if (p.status !== "draft") continue;
    const d = draftOf(p);
    const r = await savePromotion(takesCampaignDates(p) ? { ...d, startsAt: c.startsAt.toISOString(), endsAt: d.endsAt ?? c.endsAt.toISOString() } : d, staff, "publish");
    if (!r.ok) errors.push(`«${p.name}»: ${(r.errors ?? []).join(" ")}`);
    else if (r.status === "pending") pending++;
    else published++;
  }
  await audit(staff.id, "campaign.publish", "Campaign", id, { status: c.status }, { published, pending, errors: errors.length });
  refreshStorefront();
  return { rejected: false, errors, warnings: v.warnings, published, pending };
}

/** Παύση / συνέχεια / λήξη εφαρμόζονται και στις ζωντανές προσφορές· η αρχειοθέτηση λήγει ό,τι τρέχει αλλά κρατά τις προσφορές. */
export async function setCampaignState(id: string, action: "pause" | "resume" | "end" | "archive", staffId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await db.campaign.findUnique({ where: { id }, select: { status: true, startsAt: true, endsAt: true, promotions: { select: { id: true, status: true } } } });
  if (!c) return { ok: false, error: "Η καμπάνια δεν βρέθηκε." };
  const shown = shownStatus(c);
  const live = c.promotions.filter((p) => LIVE_PROMO.includes(p.status)).map((p) => p.id);
  let status: string;
  const now = new Date();
  // banners / landing pages της καμπάνιας ακολουθούν: παύση = τα banners σε παύση· λήξη / αρχείο = λήγουν τώρα
  const stopContent = async () => {
    await db.adPlacement.updateMany({ where: { campaignId: id, status: { in: ["active", "paused"] } }, data: { status: "paused" } });
    for (const m of ["ad", "landing"] as const) {
      const where = { campaignId: id, status: { not: "archived" }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
      if (m === "ad") await db.adPlacement.updateMany({ where, data: { endsAt: now } });
      else await db.landingPage.updateMany({ where, data: { endsAt: now } });
    }
  };
  if (action === "pause") {
    if (!["live", "scheduled"].includes(shown)) return { ok: false, error: "Παύση γίνεται μόνο σε καμπάνια σε εξέλιξη ή προγραμματισμένη." };
    await bulkPromotions(live, "pause", staffId);
    await db.adPlacement.updateMany({ where: { campaignId: id, status: "active" }, data: { status: "paused" } });
    status = "paused";
  } else if (action === "resume") {
    if (shown !== "paused") return { ok: false, error: "Η καμπάνια δεν είναι σε παύση." };
    await bulkPromotions(live, "resume", staffId);
    await db.adPlacement.updateMany({ where: { campaignId: id, status: "paused" }, data: { status: "active" } });
    status = liveState(c.startsAt, c.endsAt, now);
  } else if (action === "end") {
    if (["ended", "archived", "draft"].includes(shown)) return { ok: false, error: "Η καμπάνια δεν τρέχει." };
    await bulkPromotions(live, "end", staffId); await stopContent(); status = "ended";
  } else { await bulkPromotions(live, "end", staffId); await stopContent(); status = "archived"; }
  await db.campaign.update({ where: { id }, data: { status } });
  await audit(staffId, `campaign.${action}`, "Campaign", id, { status: c.status }, { status });
  refreshStorefront();
  return { ok: true };
}

export type CampaignOption = { id: string; label: string; published: boolean };
/** Καμπάνιες που μπορούν να δεχτούν προσφορά (όχι στο αρχείο / όχι λήξη), για τον οδηγό προσφοράς. */
export async function campaignOptions(): Promise<CampaignOption[]> {
  const rows = await db.campaign.findMany({ where: { code: { not: null }, status: { notIn: ["archived", "ended"] } }, orderBy: { startsAt: "desc" }, select: { id: true, code: true, title: true, status: true, startsAt: true, endsAt: true } });
  return rows.filter((c) => shownStatus(c) !== "ended").map((c) => ({ id: c.id, label: `${c.code} · ${c.title}`, published: ["scheduled", "live", "paused"].includes(c.status) }));
}

/**
 * Οι ημερομηνίες της καμπάνιας άλλαξαν: όσα είχαν τις παλιές της παίρνουν τις νέες. Οι ζωντανές προσφορές περνούν από
 * τη λογική των προσφορών (νέα έκδοση)· όσες έχουν λήξει / είναι στο αρχείο δεν αγγίζονται.
 */
export async function syncCampaignDates(id: string, old: { startsAt: Date; endsAt: Date }, staff: Staff) {
  const c = await db.campaign.findUnique({ where: { id }, select: { startsAt: true, endsAt: true } });
  if (!c) return;
  const promos = await db.promotion.findMany({ where: { campaignId: id, status: { notIn: ["archived", "ended"] }, OR: [{ startsAt: old.startsAt }, { endsAt: old.endsAt }] }, select: { id: true, startsAt: true, endsAt: true } });
  for (const p of promos) {
    await redatePromotion(p.id, { ...(p.startsAt?.getTime() === old.startsAt.getTime() ? { startsAt: c.startsAt } : {}), ...(p.endsAt?.getTime() === old.endsAt.getTime() ? { endsAt: c.endsAt } : {}) }, staff);
  }
  const live = { campaignId: id, status: { not: "archived" } };
  await db.landingPage.updateMany({ where: { ...live, startsAt: old.startsAt }, data: { startsAt: c.startsAt } });
  await db.landingPage.updateMany({ where: { ...live, endsAt: old.endsAt }, data: { endsAt: c.endsAt } });
  await db.adPlacement.updateMany({ where: { ...live, startsAt: old.startsAt }, data: { startsAt: c.startsAt } });
  await db.adPlacement.updateMany({ where: { ...live, endsAt: old.endsAt }, data: { endsAt: c.endsAt } });
  refreshStorefront();
}
