import "server-only";
import type { MediaAsset } from "@prisma/client";
import { db } from "@/lib/db";
import type { MediaAssetDTO } from "./types";
import { storeBytes, removeBytes, mediaPath } from "./storage";
import { processImage, probeVideo, kindOf, PRODUCT_FRAME } from "./process";

export const toDTO = (a: MediaAsset): MediaAssetDTO => ({
  id: a.id,
  kind: a.kind as MediaAssetDTO["kind"],
  folderId: a.folderId,
  filename: a.filename,
  title: a.title,
  alt: a.alt,
  caption: a.caption,
  tags: a.tags,
  mime: a.mime,
  size: a.size,
  width: a.width,
  height: a.height,
  duration: a.duration,
  storage: a.storage as MediaAssetDTO["storage"],
  url: a.url,
  thumbUrl: a.thumbUrl,
  emailUrl: a.emailUrl,
  blur: a.blur,
  focalX: a.focalX,
  focalY: a.focalY,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

const extOf = (name: string, mime: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : mime.split("/")[1] ?? "bin");

/**
 * Ingest bytes as a new asset (or replace an existing one keeping id/metadata).
 * Images are normalised (WebP unless keepFormat), videos probed + poster, files stored as-is.
 */
export async function ingest(opts: { bytes: Buffer; filename: string; mime: string; folderId?: string | null; createdBy?: string | null; replaceId?: string | null; keepFormat?: boolean; frame?: boolean; posterAt?: number; title?: string | null }) {
  const kind = kindOf(opts.mime);
  const prev = opts.replaceId ? await db.mediaAsset.findUnique({ where: { id: opts.replaceId } }) : null;
  const id = prev?.id ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  let main = opts.bytes, ext = extOf(opts.filename, opts.mime), mime = opts.mime;
  let width: number | null = null, height: number | null = null, duration: number | null = null, thumbUrl: string | null = null, emailUrl: string | null = null, blur: string | null = null;
  if (kind === "image") {
    const p = await processImage(opts.bytes, opts.mime, { keepFormat: opts.keepFormat, frame: opts.frame ? PRODUCT_FRAME : null });
    main = p.main; ext = p.ext; mime = p.mime; width = p.width; height = p.height; blur = p.blur;
    const t = await storeBytes(mediaPath(id, opts.filename, "thumb.webp"), p.thumb, "image/webp");
    thumbUrl = t.url;
    const e = await storeBytes(mediaPath(id, opts.filename, "email.jpg"), p.emailThumb, "image/jpeg"); // email clients: JPEG only
    emailUrl = e.url;
  } else if (kind === "video") {
    const v = await probeVideo(opts.bytes, opts.posterAt ?? 1);
    width = v.width; height = v.height; duration = v.duration;
    if (v.poster) {
      const p = await processImage(v.poster, "image/jpeg");
      const t = await storeBytes(mediaPath(id, opts.filename, "poster.webp"), p.thumb, "image/webp");
      const e = await storeBytes(mediaPath(id, opts.filename, "email.jpg"), p.emailThumb, "image/jpeg");
      thumbUrl = t.url; emailUrl = e.url; blur = p.blur;
    }
  }
  const rel = mediaPath(id, opts.filename, ext);
  const stored = await storeBytes(rel, main, mime);
  if (prev) await removeBytes(prev.storage as "local" | "bunny", prev.path, prev.url);
  const data = { kind, filename: opts.filename, mime, size: main.length, width, height, duration, storage: stored.storage, path: rel, url: stored.url, thumbUrl, emailUrl, blur };
  const row = prev
    ? await db.mediaAsset.update({ where: { id }, data })
    : await db.mediaAsset.create({ data: { id, ...data, folderId: opts.folderId ?? null, createdBy: opts.createdBy ?? null, title: opts.title ?? opts.filename.replace(/\.[^.]+$/, "") } });
  return toDTO(row);
}

export async function destroy(ids: string[]) {
  const rows = await db.mediaAsset.findMany({ where: { id: { in: ids } } });
  for (const r of rows) {
    await removeBytes(r.storage as "local" | "bunny", r.path, r.url);
    if (r.thumbUrl) await removeBytes(r.storage as "local" | "bunny", r.path.replace(/\.[^.]+$/, r.kind === "video" ? ".poster.webp" : ".thumb.webp"), r.thumbUrl);
    if (r.emailUrl) await removeBytes(r.storage as "local" | "bunny", r.path.replace(/\.[^.]+$/, ".email.jpg"), r.emailUrl);
  }
  await db.mediaAsset.deleteMany({ where: { id: { in: ids } } });
  return rows.length;
}
