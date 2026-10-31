import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { getTable } from "@/lib/softone/lookups";
import {
  BRANCH_FIELDS, MEMBER_FIELDS, matchStores, rowsToObjects, toBranch, toPartner, virtualBranch,
  type Lookups, type MatchBranch,
} from "./partners-core";

/**
 * Εισαγωγή μελών και υποκαταστημάτων από το SoftOne — **μόνο ανάγνωση** από το ERP.
 * Γράφει μόνο στη δική μας βάση: Partner, PartnerBranch και σύνδεση Store → μέλος (email υποκαταστήματος, μετά email μέλους).
 * Με `dryRun` δεν αγγίζει τη βάση· επιστρέφει τι θα γινόταν.
 */
export type ImportSummary = {
  dryRun: boolean;
  members: number;
  branches: number;
  virtual: number;
  partners: { created: number; updated: number; missing: number };
  branchRows: { created: number; updated: number; missing: number };
  matched: { byBranchEmail: number; byPartnerEmail: number };
  linkedStores: number;
  storesWithoutPartner: number;
  branchesWithoutStore: number;
  ms: number;
};

async function readSoftone() {
  const [biz, grp, mem] = await Promise.all([
    getTable("TRDBUSINESS", ["TRDBUSINESS", "NAME"]),
    getTable("TRDPGROUP", ["TRDPGROUP", "NAME"], "SODTYPE=13"),
    getTable("TRDR", [...MEMBER_FIELDS], "SODTYPE=13 AND TRDBUSINESS IS NOT NULL"),
  ]);
  const lk: Lookups = { business: new Map(biz.map(([id, n]) => [Number(id), n])), group: new Map(grp.map(([id, n]) => [Number(id), n])) };
  const members = rowsToObjects(MEMBER_FIELDS, mem);
  if (!members.length) throw new Error("Το SoftOne δεν επέστρεψε μέλη — η εισαγωγή σταμάτησε για να μη σημειωθούν όλα ως «λείπουν»");
  const br = await getTable("TRDBRANCH", [...BRANCH_FIELDS], `SODTYPE=13 AND TRDR IN (${members.map((m) => Number(m.TRDR)).join(",")})`);
  return { lk, members, branches: rowsToObjects(BRANCH_FIELDS, br) };
}

const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/** Εκτελεί σε μικρές ομάδες (η βάση είναι κοινή — μικρό pool). */
async function inChunks<T>(xs: T[], fn: (x: T) => Promise<unknown>, size = 6) {
  for (let i = 0; i < xs.length; i += size) await Promise.all(xs.slice(i, i + size).map(fn));
}

export async function importPartners({ dryRun = false, staffId = null }: { dryRun?: boolean; staffId?: string | null } = {}): Promise<ImportSummary> {
  const t0 = Date.now();
  const { lk, members, branches } = await readSoftone();
  const now = new Date();
  const partnersIn = members.map((m) => ({ data: toPartner(m, lk), raw: m }));
  const byTrdr = new Map<number, typeof branches>();
  for (const b of branches) byTrdr.set(Number(b.TRDR), [...(byTrdr.get(Number(b.TRDR)) ?? []), b]);
  const virtualFor = partnersIn.filter((p) => !byTrdr.has(p.data.s1Trdr));

  if (dryRun) {
    // χωρίς τις νέες στήλες: η προεπισκόπηση τρέχει και πριν εφαρμοστεί το SQL
    const stores = await db.store.findMany({ select: { id: true, email: true, zip: true, city: true } });
    // προεπισκόπηση: όλα τα υποκαταστήματα θεωρούνται νέα και ασύνδετα
    const mb: MatchBranch[] = [
      ...branches.map((b) => ({ key: `b${b.TRDBRANCH}`, partnerKey: `p${b.TRDR}`, email: toBranch(b).email, isCenter: b.ISCENTER === "1", storeId: null, matchedBy: null, zip: b.ZIP, city: b.CITY })),
      ...virtualFor.map((p) => ({ key: `v${p.data.s1Trdr}`, partnerKey: `p${p.data.s1Trdr}`, email: p.data.email, isCenter: true, storeId: null, matchedBy: null, zip: p.data.zip, city: p.data.city })),
    ];
    const m = matchStores(mb, partnersIn.map((p) => ({ key: `p${p.data.s1Trdr}`, email: p.data.email })), stores);
    return {
      dryRun, members: members.length, branches: branches.length, virtual: virtualFor.length,
      partners: { created: members.length, updated: 0, missing: 0 }, branchRows: { created: mb.length, updated: 0, missing: 0 },
      matched: { byBranchEmail: m.filter((x) => x.matchedBy === "email-branch").length, byPartnerEmail: m.filter((x) => x.matchedBy === "email-partner").length },
      linkedStores: m.length, storesWithoutPartner: stores.length - m.length, branchesWithoutStore: mb.length - m.length, ms: Date.now() - t0,
    };
  }

  const stores = await db.store.findMany({ select: { id: true, email: true, zip: true, city: true, partnerId: true } });

  // ---- μέλη ----
  const existing = new Map((await db.partner.findMany({ where: { s1Trdr: { not: null } } })).map((p) => [p.s1Trdr!, p]));
  const sum = { partners: { created: 0, updated: 0, missing: 0 }, branchRows: { created: 0, updated: 0, missing: 0 } };
  const toCreate = partnersIn.filter((p) => !existing.has(p.data.s1Trdr));
  if (toCreate.length) {
    await db.partner.createMany({ data: toCreate.map((p) => ({ ...p.data, s1Data: p.raw, s1SyncedAt: now })), skipDuplicates: true });
    sum.partners.created = toCreate.length;
  }
  const changed = partnersIn.filter((p) => { const e = existing.get(p.data.s1Trdr); return e && (!same(p.data, e) || e.s1Missing); });
  await inChunks(changed, (p) => db.partner.update({ where: { s1Trdr: p.data.s1Trdr }, data: { ...p.data, s1Data: p.raw, s1SyncedAt: now, s1Missing: false } }));
  sum.partners.updated = changed.length;
  const seenTrdr = new Set(partnersIn.map((p) => p.data.s1Trdr));
  sum.partners.missing = (await db.partner.updateMany({ where: { s1Trdr: { notIn: [...seenTrdr] }, NOT: { s1Trdr: null }, s1Missing: false }, data: { s1Missing: true } })).count;
  await db.partner.updateMany({ where: { s1Trdr: { in: [...seenTrdr] } }, data: { s1SyncedAt: now } });

  const pid = new Map((await db.partner.findMany({ where: { s1Trdr: { in: [...seenTrdr] } }, select: { id: true, s1Trdr: true } })).map((p) => [p.s1Trdr!, p.id]));

  // ---- υποκαταστήματα ----
  const exB = new Map((await db.partnerBranch.findMany({ where: { s1BranchId: { not: null } } })).map((b) => [b.s1BranchId!, b]));
  const bIn = branches.map((b) => ({ data: { ...toBranch(b), partnerId: pid.get(Number(b.TRDR))! }, raw: b })).filter((b) => b.data.partnerId);
  const bNew = bIn.filter((b) => !exB.has(b.data.s1BranchId));
  if (bNew.length) await db.partnerBranch.createMany({ data: bNew.map((b) => ({ ...b.data, s1Data: b.raw, s1SyncedAt: now })), skipDuplicates: true });
  const bChanged = bIn.filter((b) => { const e = exB.get(b.data.s1BranchId); return e && (!same(b.data, e) || e.s1Missing); });
  await inChunks(bChanged, (b) => db.partnerBranch.update({ where: { s1BranchId: b.data.s1BranchId }, data: { ...b.data, s1Data: b.raw, s1SyncedAt: now, s1Missing: false } }));
  const seenB = bIn.map((b) => b.data.s1BranchId);
  const bMissing = await db.partnerBranch.updateMany({ where: { s1BranchId: { notIn: seenB }, NOT: { s1BranchId: null }, s1Missing: false }, data: { s1Missing: true } });

  // εικονικά (μέλη χωρίς υποκατάστημα): ένα ανά μέλος· αν απέκτησε πραγματικά, το εικονικό σημειώνεται «λείπει»
  const exV = new Map((await db.partnerBranch.findMany({ where: { s1BranchId: null } })).map((b) => [b.partnerId, b]));
  let vCreated = 0, vUpdated = 0;
  await inChunks(virtualFor, async (p) => {
    const partnerId = pid.get(p.data.s1Trdr)!;
    const data = { ...virtualBranch(p.data), partnerId };
    const e = exV.get(partnerId);
    if (!e) { await db.partnerBranch.create({ data: { ...data, s1SyncedAt: now } }); vCreated++; }
    else if (!same(data, e) || e.s1Missing) { await db.partnerBranch.update({ where: { id: e.id }, data: { ...data, s1SyncedAt: now, s1Missing: false } }); vUpdated++; }
  });
  const virtualIds = new Set(virtualFor.map((p) => pid.get(p.data.s1Trdr)));
  const vGone = [...exV.values()].filter((v) => !virtualIds.has(v.partnerId) && !v.s1Missing).map((v) => v.id);
  if (vGone.length) await db.partnerBranch.updateMany({ where: { id: { in: vGone } }, data: { s1Missing: true } });
  sum.branchRows = { created: bNew.length + vCreated, updated: bChanged.length + vUpdated, missing: bMissing.count + vGone.length };

  // ---- σύνδεση με τα καταστήματα του eshop ----
  const allB = await db.partnerBranch.findMany({ where: { s1Missing: false }, select: { id: true, partnerId: true, email: true, isCenter: true, storeId: true, matchedBy: true, zip: true, city: true } });
  const allP = await db.partner.findMany({ where: { s1Missing: false }, select: { id: true, email: true } });
  const matches = matchStores(allB.map((b) => ({ key: b.id, partnerKey: b.partnerId, email: b.email, isCenter: b.isCenter, storeId: b.storeId, matchedBy: b.matchedBy, zip: b.zip, city: b.city })), allP.map((p) => ({ key: p.id, email: p.email })), stores);
  const bById = new Map(allB.map((b) => [b.id, b]));
  await inChunks(matches, async (m) => {
    await db.partnerBranch.update({ where: { id: m.branchKey }, data: { storeId: m.storeId, matchedBy: m.matchedBy } });
  });
  // κάθε συνδεδεμένο κατάστημα δείχνει στο μέλος του υποκαταστήματος
  const links = [...allB.filter((b) => b.storeId).map((b) => [b.storeId!, b.partnerId] as const), ...matches.map((m) => [m.storeId, bById.get(m.branchKey)!.partnerId] as const)];
  const storePartner = new Map(stores.map((s) => [s.id, s.partnerId]));
  await inChunks(links.filter(([sid, p]) => storePartner.get(sid) !== p), ([sid, p]) => db.store.update({ where: { id: sid }, data: { partnerId: p } }));

  const [linkedStores, storesWithoutPartner, branchesWithoutStore] = await Promise.all([
    db.store.count({ where: { partnerId: { not: null } } }),
    db.store.count({ where: { partnerId: null } }),
    db.partnerBranch.count({ where: { storeId: null, s1Missing: false } }),
  ]);
  const summary: ImportSummary = {
    dryRun, members: members.length, branches: branches.length, virtual: virtualFor.length, ...sum,
    matched: { byBranchEmail: matches.filter((x) => x.matchedBy === "email-branch").length, byPartnerEmail: matches.filter((x) => x.matchedBy === "email-partner").length },
    linkedStores, storesWithoutPartner, branchesWithoutStore, ms: Date.now() - t0,
  };
  await audit(staffId, "b2b.partners.import", "Partner", null, null, summary);
  return summary;
}
