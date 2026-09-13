"use server";

import { db } from "@/lib/db";
import { requirePermission, requireSuperAdmin } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { toDTO, destroy, ingest } from "@/lib/media/repo";
import { removeBackground, probeVideo } from "@/lib/media/process";
import { activeStorage } from "@/lib/media/storage";
import { describeImage } from "@/lib/ai/tasks";
import type { MediaAssetDTO, MediaFolderDTO, MediaKind } from "@/lib/media/types";
import type { Prisma } from "@prisma/client";

const PAGE = 60;

export interface ListQuery {
  folderId?: string | null; // undefined = all folders, null = root only
  q?: string;
  kind?: MediaKind | "all";
  sort?: "newest" | "oldest" | "name" | "size";
  page?: number;
  tag?: string;
}

export async function listMedia(query: ListQuery): Promise<{ items: MediaAssetDTO[]; total: number; page: number; pages: number; notice: string | null; local: number }> {
  await requirePermission("cms.media.read");
  const where: Prisma.MediaAssetWhereInput = {};
  if (query.folderId !== undefined) where.folderId = query.folderId;
  if (query.kind && query.kind !== "all") where.kind = query.kind;
  if (query.tag) where.tags = { has: query.tag };
  if (query.q) where.OR = [{ filename: { contains: query.q, mode: "insensitive" } }, { title: { contains: query.q, mode: "insensitive" } }, { alt: { contains: query.q, mode: "insensitive" } }, { tags: { has: query.q } }];
  const orderBy: Prisma.MediaAssetOrderByWithRelationInput = query.sort === "oldest" ? { createdAt: "asc" } : query.sort === "name" ? { filename: "asc" } : query.sort === "size" ? { size: "desc" } : { createdAt: "desc" };
  const page = Math.max(1, query.page ?? 1);
  const [rows, total, st] = await Promise.all([db.mediaAsset.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE }), db.mediaAsset.count({ where }), activeStorage()]);
  const local = st.storage === "bunny" ? await (await import("@/lib/media/migrate")).localCount().then((c) => c.media + c.voice) : 0;
  return { items: rows.map(toDTO), total, page, pages: Math.max(1, Math.ceil(total / PAGE)), notice: st.notice, local };
}

export async function listFolders(): Promise<MediaFolderDTO[]> {
  await requirePermission("cms.media.read");
  const rows = await db.mediaFolder.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { assets: true } } } });
  return rows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, count: f._count.assets }));
}

export async function createFolder(name: string, parentId: string | null) {
  const user = await requirePermission("cms.media.write");
  const n = name.trim();
  if (!n) return { ok: false as const, error: "Δώσε όνομα φακέλου." };
  try {
    const f = await db.mediaFolder.create({ data: { name: n, parentId } });
    await audit(user.id, "media.folder.create", "MediaFolder", f.id, null, { name: n, parentId });
    return { ok: true as const, id: f.id };
  } catch {
    return { ok: false as const, error: "Υπάρχει ήδη φάκελος με αυτό το όνομα εδώ." };
  }
}

export async function renameFolder(id: string, name: string) {
  const user = await requirePermission("cms.media.write");
  const before = await db.mediaFolder.findUniqueOrThrow({ where: { id } });
  await db.mediaFolder.update({ where: { id }, data: { name: name.trim() } });
  await audit(user.id, "media.folder.rename", "MediaFolder", id, { name: before.name }, { name: name.trim() });
  return { ok: true as const };
}

export async function deleteFolder(id: string) {
  const user = await requirePermission("cms.media.write");
  const f = await db.mediaFolder.findUniqueOrThrow({ where: { id }, include: { _count: { select: { assets: true, children: true } } } });
  if (f._count.assets || f._count.children) return { ok: false as const, error: "Ο φάκελος δεν είναι άδειος." };
  await db.mediaFolder.delete({ where: { id } });
  await audit(user.id, "media.folder.delete", "MediaFolder", id, { name: f.name }, null);
  return { ok: true as const };
}

export async function updateAsset(id: string, patch: Partial<Pick<MediaAssetDTO, "title" | "alt" | "caption" | "tags" | "focalX" | "focalY" | "folderId">>) {
  const user = await requirePermission("cms.media.write");
  const before = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
  const row = await db.mediaAsset.update({ where: { id }, data: patch });
  await audit(user.id, "media.update", "MediaAsset", id, { title: before.title, alt: before.alt, tags: before.tags, focalX: before.focalX, focalY: before.focalY, folderId: before.folderId }, patch);
  return toDTO(row);
}

export async function moveAssets(ids: string[], folderId: string | null) {
  const user = await requirePermission("cms.media.write");
  await db.mediaAsset.updateMany({ where: { id: { in: ids } }, data: { folderId } });
  await audit(user.id, "media.move", "MediaAsset", ids.join(","), null, { folderId, count: ids.length });
  return { ok: true as const };
}

export async function tagAssets(ids: string[], add: string[], remove: string[]) {
  const user = await requirePermission("cms.media.write");
  const rows = await db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, tags: true } });
  await db.$transaction(rows.map((r) => db.mediaAsset.update({ where: { id: r.id }, data: { tags: [...new Set([...r.tags.filter((t) => !remove.includes(t)), ...add])] } })));
  await audit(user.id, "media.tag", "MediaAsset", ids.join(","), null, { add, remove, count: ids.length });
  return { ok: true as const };
}

export async function deleteAssets(ids: string[]) {
  const user = await requirePermission("cms.media.write");
  const n = await destroy(ids);
  await audit(user.id, "media.delete", "MediaAsset", ids.join(","), { count: n }, null);
  return { ok: true as const, count: n };
}

/** Background removal → new PNG asset next to the original («…-cutout»). */
export async function removeBackgroundAction(id: string): Promise<{ ok: true; asset: MediaAssetDTO } | { ok: false; error: string }> {
  const user = await requirePermission("cms.media.write");
  const src = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
  if (src.kind !== "image") return { ok: false, error: "Μόνο για εικόνες." };
  try {
    const bytes = await fetchBytes(src.url);
    const png = await removeBackground(bytes);
    const asset = await ingest({ bytes: png, filename: src.filename.replace(/\.[^.]+$/, "") + "-cutout.png", mime: "image/png", folderId: src.folderId, createdBy: user.id, keepFormat: true, title: (src.title ?? src.filename) + " (cutout)" });
    await db.mediaAsset.update({ where: { id: asset.id }, data: { alt: src.alt, tags: [...new Set([...src.tags, "cutout"])] } });
    await audit(user.id, "media.removebg", "MediaAsset", asset.id, { source: id }, { filename: asset.filename });
    return { ok: true, asset: { ...asset, alt: src.alt, tags: [...new Set([...src.tags, "cutout"])] } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Αποτυχία." };
  }
}

/** Video: regenerate poster at a given second. */
export async function setVideoPoster(id: string, at: number) {
  const user = await requirePermission("cms.media.write");
  const src = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
  if (src.kind !== "video") return { ok: false as const, error: "Μόνο για video." };
  const bytes = await fetchBytes(src.url);
  const v = await probeVideo(bytes, at);
  if (!v.poster) return { ok: false as const, error: "Δεν βρέθηκε ffmpeg στον server." };
  const { processImage } = await import("@/lib/media/process");
  const { storeBytes, mediaPath } = await import("@/lib/media/storage");
  const p = await processImage(v.poster, "image/jpeg");
  const t = await storeBytes(mediaPath(src.id, src.filename, `poster-${Math.round(at * 10)}.webp`), p.thumb, "image/webp");
  const row = await db.mediaAsset.update({ where: { id }, data: { thumbUrl: t.url, blur: p.blur } });
  await audit(user.id, "media.poster", "MediaAsset", id, null, { at });
  return { ok: true as const, asset: toDTO(row) };
}

async function fetchBytes(url: string): Promise<Buffer> {
  if (url.startsWith("/")) {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    return readFile(path.join(process.cwd(), "public", url));
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Δεν κατέβηκε το αρχείο (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** AI alt text / title / tags for an image (OpenRouter vision model). Writes only empty fields unless `overwrite`. */
export async function aiDescribeAsset(id: string, overwrite = false): Promise<{ ok: true; asset: MediaAssetDTO } | { ok: false; error: string }> {
  const user = await requirePermission("cms.media.write");
  const src = await db.mediaAsset.findUniqueOrThrow({ where: { id } });
  if (src.kind !== "image") return { ok: false, error: "Μόνο για εικόνες." };
  const url = src.url.startsWith("/") ? `data:${src.mime};base64,${(await fetchBytes(src.thumbUrl ?? src.url)).toString("base64")}` : (src.thumbUrl ?? src.url);
  const d = await describeImage(url, src.title ?? src.filename);
  if (!d) return { ok: false, error: "Δεν υπάρχει διαθέσιμο AI (κλειδί OpenRouter / όριο κόστους)." };
  const row = await db.mediaAsset.update({ where: { id }, data: { alt: overwrite || !src.alt ? d.alt : src.alt, title: overwrite || !src.title || src.title === src.filename.replace(/\.[^.]+$/, "") ? d.title || src.title : src.title, tags: [...new Set([...src.tags, ...d.tags])] } });
  await audit(user.id, "media.ai-describe", "MediaAsset", id, { alt: src.alt, title: src.title }, { alt: row.alt, title: row.title, tags: row.tags });
  return { ok: true, asset: toDTO(row) };
}

/** «Μεταφορά στο CDN»: local files → Bunny, rows repointed. Super admin only (it changes every URL). */
export async function migrateToCdn(): Promise<{ ok: boolean; message: string }> {
  const user = await requireSuperAdmin();
  const { migrateLocalToCdn } = await import("@/lib/media/migrate");
  try {
    const r = await migrateLocalToCdn();
    await audit(user.id, "media.migrate-cdn", "MediaAsset", "*", null, r);
    return { ok: r.failed.length === 0, message: `Μεταφέρθηκαν ${r.media} αρχεία media και ${r.voice} φράσεις ήχου στο Bunny.${r.failed.length ? ` Απέτυχαν: ${r.failed.join(" · ")}` : ""}` };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}

export async function localFilesCount() {
  const { localCount } = await import("@/lib/media/migrate");
  const c = await localCount();
  return c.media + c.voice;
}
