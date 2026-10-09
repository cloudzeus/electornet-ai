"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { cutoutFor } from "@/lib/data/cutouts";
import { normalizeDoc, validateDoc, type HeroDoc, type ProductInfo, type SlideIssue } from "@/lib/cms/hero-slides-model";
import { publishHero, revertHero, saveHeroDraft } from "@/lib/cms/hero-slides";

const PERM = "cms.slides.write";
const ENTITY = "hero.slides/home";

export async function saveHeroAction(input: HeroDoc): Promise<{ doc: HeroDoc }> {
  const u = await requirePermission(PERM);
  const doc = normalizeDoc(input);
  await saveHeroDraft(doc, u.id);
  await audit(u.id, "cms.hero.save", "CmsDocument", ENTITY, null, { slides: doc.slides.length });
  return { doc };
}

export async function publishHeroAction(input: HeroDoc): Promise<{ ok: true; doc: HeroDoc; publishedAt: string } | { ok: false; issues: Record<string, SlideIssue[]> }> {
  const u = await requirePermission(PERM);
  const doc = normalizeDoc(input);
  const issues = validateDoc(doc);
  if (Object.keys(issues).length) return { ok: false, issues };
  await saveHeroDraft(doc, u.id);
  const r = await publishHero(u.id);
  await audit(u.id, "cms.hero.publish", "CmsDocument", ENTITY, null, { slides: doc.slides.length });
  revalidatePath("/");
  return { ok: true, doc, publishedAt: (r.publishedAt ?? new Date()).toISOString() };
}

export async function revertHeroAction(): Promise<{ doc: HeroDoc }> {
  const u = await requirePermission(PERM);
  const doc = await revertHero(u.id);
  await audit(u.id, "cms.hero.revert", "CmsDocument", ENTITY);
  return { doc };
}

export async function searchHeroProductsAction(q: string): Promise<(ProductInfo & { id: string; sku: string })[]> {
  await requirePermission(PERM);
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await db.product.findMany({
    where: { active: true, OR: [{ title: { contains: s, mode: "insensitive" } }, { sku: { contains: s, mode: "insensitive" } }] },
    take: 12, orderBy: { title: "asc" },
    select: { id: true, title: true, sku: true, slug: true, price: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } },
  });
  return rows.map((r) => ({ id: r.id, sku: r.sku, title: r.title, slug: r.slug, price: r.price ?? null, cutout: cutoutFor(r.media[0]?.url) ?? r.media[0]?.url ?? null }));
}
