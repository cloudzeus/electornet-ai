import "server-only";
import { db } from "@/lib/db";
import { ingest } from "@/lib/media/repo";
import type { TicketAttachment } from "./core";

/**
 * Φωτογραφίες / βίντεο βλάβης από τον πελάτη → βιβλιοθήκη πολυμέσων (φάκελος «Service», ετικέτα service-ticket).
 * Όρια: έως 5 αρχεία ανά αποστολή, εικόνα έως 12 MB, βίντεο (mp4 / mov / webm) έως 60 MB.
 */
export const MAX_FILES = 5;
const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_VIDEO = 60 * 1024 * 1024;
const VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

export type UploadCheck = { ok: true; files: File[] } | { ok: false; error: string };

export function checkUploads(list: FormDataEntryValue[]): UploadCheck {
  const files = list.filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && f.size > 0);
  if (files.length > MAX_FILES) return { ok: false, error: `Έως ${MAX_FILES} αρχεία κάθε φορά.` };
  for (const f of files) {
    const image = f.type.startsWith("image/"), video = VIDEO.includes(f.type);
    if (!image && !video) return { ok: false, error: `Το «${f.name}» δεν είναι φωτογραφία ή βίντεο (mp4, mov, webm).` };
    if (image && f.size > MAX_IMAGE) return { ok: false, error: `Η φωτογραφία «${f.name}» ξεπερνά τα 12 MB.` };
    if (video && f.size > MAX_VIDEO) return { ok: false, error: `Το βίντεο «${f.name}» ξεπερνά τα 60 MB — στείλε ένα πιο σύντομο.` };
  }
  return { ok: true, files };
}

export async function storeUploads(files: File[], customer: { id: string; number: number }, label: string): Promise<TicketAttachment[]> {
  if (!files.length) return [];
  let folder = await db.mediaFolder.findFirst({ where: { name: "Service", parentId: null } });
  if (!folder) folder = await db.mediaFolder.create({ data: { name: "Service" } });
  const out: TicketAttachment[] = [];
  for (const [i, f] of files.entries()) {
    const video = VIDEO.includes(f.type);
    const asset = await ingest({ bytes: Buffer.from(await f.arrayBuffer()), filename: `service-${customer.number}-${Date.now()}-${i}.${video ? (f.type === "video/webm" ? "webm" : f.type === "video/quicktime" ? "mov" : "mp4") : "jpg"}`, mime: f.type, folderId: folder.id, createdBy: customer.id, title: `${label} — πελάτης #${customer.number}` });
    await db.mediaAsset.update({ where: { id: asset.id }, data: { tags: ["service-ticket", "customer-upload"] } }).catch(() => null);
    out.push({ url: asset.url, thumb: asset.thumbUrl ?? null, kind: video ? "video" : "image", name: f.name.slice(0, 120), at: new Date().toISOString(), by: "customer" });
  }
  return out;
}
