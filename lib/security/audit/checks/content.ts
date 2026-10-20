import { db } from "@/lib/db";
import { getBunny } from "@/lib/media/cdn";
import { getSetting } from "@/lib/settings/store";
import { SECTIONS } from "@/lib/settings/schema";
import type { Finding } from "../rules";
import type { Check } from "../types";
import { contentOutcome, scanRecord, type SourceKey, type SourceTally } from "./content-core";

/**
 * Σάρωση των πεδίων που φτάνουν σε σελίδα/email (CMS, components, landing pages, newsletter, αυτοκόλλητα, κατηγορίες,
 * περιγραφές προϊόντων και ERP) με το scanContent. full: όλα, σε παρτίδες των 1.000 με cursor· light: όσα άλλαξαν από
 * την αρχή του παραθύρου. Χρονικό όριο ~3′: αν τελειώσει, status warn «δεν ολοκληρώθηκε — σαρώθηκαν X/Y», ποτέ ok.
 */

const BATCH = 1000;
const BUDGET_MS = 180_000;

type Row = { id: string; label?: string | null; fields: Record<string, unknown> };
type Cursor = string | number | null;
type Src = { key: SourceKey; count(light: boolean): Promise<number>; page(after: Cursor, light: boolean): Promise<{ rows: Row[]; last: Cursor }> };

const last = <T extends { id: string | number }>(rows: T[]): Cursor => rows.at(-1)?.id ?? null;
const sid = (c: Cursor) => (c == null ? {} : { id: { gt: String(c) } });

function sources(since: Date): Src[] {
  const upd = (light: boolean) => (light ? { updatedAt: { gte: since } } : {});
  const sections = SECTIONS.map((s) => s.key);
  return [
    {
      key: "setting",
      count: (l) => db.setting.count({ where: { section: { in: sections }, ...upd(l) } }),
      async page(after, l) {
        const r = await db.setting.findMany({ where: { section: { in: sections, ...(after == null ? {} : { gt: String(after) }) }, ...upd(l) }, orderBy: { section: "asc" }, take: BATCH, select: { section: true, data: true } });
        return { rows: r.map((x) => ({ id: x.section, label: x.section, fields: { data: x.data } })), last: r.at(-1)?.section ?? null };
      },
    },
    {
      key: "cms",
      count: (l) => db.cmsDocument.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.cmsDocument.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, collection: true, key: true, data: true, published: true } });
        return { rows: r.map((x) => ({ id: x.id, label: `${x.collection}/${x.key}`, fields: { data: x.data, published: x.published } })), last: last(r) };
      },
    },
    {
      key: "widget",
      count: (l) => db.widget.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.widget.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, type: true, label: true, props: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.label ?? x.type, fields: { label: x.label, props: x.props } })), last: last(r) };
      },
    },
    {
      key: "landing",
      count: (l) => db.landingPage.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.landingPage.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, slug: true, title: true, seoTitle: true, seoDesc: true, blocks: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.slug, fields: { title: x.title, seoTitle: x.seoTitle, seoDesc: x.seoDesc, blocks: x.blocks } })), last: last(r) };
      },
    },
    {
      key: "newsletter",
      count: (l) => db.newsletter.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.newsletter.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, title: true, subject: true, preheader: true, blocks: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.title, fields: { subject: x.subject, preheader: x.preheader, blocks: x.blocks } })), last: last(r) };
      },
    },
    {
      key: "sticker",
      count: (l) => db.sticker.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.sticker.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, key: true, name: true, svg: true, params: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.key, fields: { name: x.name, svg: x.svg, params: x.params } })), last: last(r) };
      },
    },
    {
      key: "category",
      count: () => db.category.count(),
      async page(after) {
        const r = await db.category.findMany({ where: sid(after), orderBy: { id: "asc" }, take: BATCH, select: { id: true, slug: true, name: true, metaTitle: true, metaDesc: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.slug, fields: { name: x.name, metaTitle: x.metaTitle, metaDesc: x.metaDesc } })), last: last(r) };
      },
    },
    {
      key: "product",
      count: (l) => db.product.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.product.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, sku: true, title: true, summary: true, description: true, highlights: true } });
        return { rows: r.map((x) => ({ id: x.id, label: x.sku, fields: { title: x.title, summary: x.summary, description: x.description, highlights: x.highlights } })), last: last(r) };
      },
    },
    {
      key: "section",
      count: (l) => db.productSection.count({ where: upd(l) }),
      async page(after, l) {
        const r = await db.productSection.findMany({ where: { ...sid(after), ...upd(l) }, orderBy: { id: "asc" }, take: BATCH, select: { id: true, productId: true, title: true, subtitle: true, body: true, footnote: true, features: true, stats: true } });
        return { rows: r.map((x) => ({ id: x.id, label: `προϊόν ${x.productId}`, fields: { title: x.title, subtitle: x.subtitle, body: x.body, footnote: x.footnote, features: x.features, stats: x.stats } })), last: last(r) };
      },
    },
    {
      key: "s1item",
      // light: syncedAt αλλάζει μόνο όταν άλλαξε κάτι στο είδος (lib/softone/catalog.ts)
      count: (l) => db.s1Item.count({ where: l ? { syncedAt: { gte: since } } : {} }),
      async page(after, l) {
        const r = await db.s1Item.findMany({ where: { ...(after == null ? {} : { mtrl: { gt: Number(after) } }), ...(l ? { syncedAt: { gte: since } } : {}) }, orderBy: { mtrl: "asc" }, take: BATCH, select: { mtrl: true, code: true, name: true, shortDesc: true, longDesc: true } });
        return { rows: r.map((x) => ({ id: String(x.mtrl), label: x.code, fields: { name: x.name, shortDesc: x.shortDesc, longDesc: x.longDesc } })), last: r.at(-1)?.mtrl ?? null };
      },
    },
  ];
}

const hostOf = (u: unknown) => { try { return typeof u === "string" && u ? new URL(u).hostname : null; } catch { return null; } };

export const contentCheck: Check = {
  key: "content",
  title: "Περιεχόμενο (ένεση κώδικα, ClickFix, spam)",
  modes: ["full", "light"],
  timeoutMs: 210_000,
  async run({ mode, since, signal }) {
    const t0 = Date.now();
    const light = mode === "light";
    const [general, bunny] = await Promise.all([getSetting("general").catch(() => ({ data: {} as Record<string, unknown> })), getBunny().catch(() => null)]);
    const ownHosts = [hostOf(general.data.baseUrl), hostOf(bunny?.cdnUrl)].filter((h): h is string => !!h);
    const srcs = sources(since);
    const totals = await Promise.all(srcs.map((s) => s.count(light)));
    const tallies: SourceTally[] = srcs.map((s, i) => ({ key: s.key, scanned: 0, total: totals[i] }));
    const findings: Finding[] = [];
    let complete = true;
    outer: for (const [i, s] of srcs.entries()) {
      let after: Cursor = null;
      for (;;) {
        if (signal?.aborted || Date.now() - t0 > BUDGET_MS) { complete = false; break outer; }
        const { rows, last: next } = await s.page(after, light);
        for (const r of rows) findings.push(...scanRecord(s.key, r, { ownHosts }));
        tallies[i].scanned += rows.length;
        if (rows.length < BATCH || next == null) break;
        after = next;
      }
      // εγγραφές που προστέθηκαν κατά τη σάρωση: το σύνολο δεν πέφτει κάτω από όσα σαρώθηκαν
      tallies[i].total = Math.max(tallies[i].total, tallies[i].scanned);
    }
    return contentOutcome({ mode, since, tallies, findings, complete });
  },
};
