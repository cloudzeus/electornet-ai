"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { ingest } from "@/lib/media/repo";
import type { StickerParams } from "@/lib/stickers/model";
import type { MediaAssetDTO } from "@/lib/media/types";

export interface StickerDTO { id: string; key: string; name: string; params: StickerParams; svg: string; active: boolean; updatedAt: string }

export async function listStickers(): Promise<StickerDTO[]> {
  await requirePermission("catalog.promos.write");
  const rows = await db.sticker.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "desc" }] });
  return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, params: r.params as unknown as StickerParams, svg: r.svg, active: r.active, updatedAt: r.updatedAt.toISOString() }));
}

export async function saveSticker(input: { id?: string | null; key: string; name: string; params: StickerParams; svg: string; active?: boolean }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.promos.write");
  const key = input.key.trim().toLowerCase();
  const name = input.name.trim();
  if (!key || !name) return { ok: false, error: "Δώσε όνομα και κλειδί." };
  const clash = await db.sticker.findUnique({ where: { key } });
  if (clash && clash.id !== input.id) return { ok: false, error: `Το κλειδί «${key}» χρησιμοποιείται ήδη.` };
  const data = { key, name, params: input.params as object, svg: input.svg, active: input.active ?? true };
  const row = input.id
    ? await db.sticker.update({ where: { id: input.id }, data })
    : await db.sticker.create({ data: { ...data, createdBy: user.id } });
  await audit(user.id, input.id ? "sticker.update" : "sticker.create", "Sticker", row.id, clash ? { params: clash.params } : null, { key, name, params: input.params });
  revalidatePath("/admin/stickers");
  return { ok: true, id: row.id };
}

export async function deleteSticker(id: string) {
  const user = await requirePermission("catalog.promos.write");
  const row = await db.sticker.delete({ where: { id } });
  await audit(user.id, "sticker.delete", "Sticker", id, { key: row.key, name: row.name }, null);
  revalidatePath("/admin/stickers");
  return { ok: true as const };
}

/** Export to the media library: SVG as-is, PNG rasterised by the browser (base64). */
export async function exportStickerToMedia(input: { name: string; svg?: string; pngBase64?: string }): Promise<{ ok: true; assets: MediaAssetDTO[] } | { ok: false; error: string }> {
  const user = await requirePermission("cms.media.write");
  try {
    const assets: MediaAssetDTO[] = [];
    let folder = await db.mediaFolder.findFirst({ where: { name: "Stickers", parentId: null } });
    if (!folder) folder = await db.mediaFolder.create({ data: { name: "Stickers" } });
    const base = input.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "sticker";
    if (input.svg) assets.push(await ingest({ bytes: Buffer.from(input.svg, "utf8"), filename: `${base}.svg`, mime: "image/svg+xml", folderId: folder.id, createdBy: user.id, title: input.name }));
    if (input.pngBase64) assets.push(await ingest({ bytes: Buffer.from(input.pngBase64, "base64"), filename: `${base}.png`, mime: "image/png", folderId: folder.id, createdBy: user.id, keepFormat: true, title: `${input.name} (PNG)` }));
    for (const a of assets) await db.mediaAsset.update({ where: { id: a.id }, data: { tags: ["sticker"] } });
    await audit(user.id, "sticker.export", "MediaAsset", assets.map((a) => a.id).join(","), null, { name: input.name, files: assets.map((a) => a.filename) });
    return { ok: true, assets };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Αποτυχία εξαγωγής." };
  }
}
