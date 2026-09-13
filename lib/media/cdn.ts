
import { getSetting } from "@/lib/settings/store";

/**
 * Bunny CDN helpers driven by Settings → «Bunny CDN».
 * - `cdnUrl(path, opts)` → public URL (Optimizer params when enabled), or the local path when the CDN is off.
 * - `uploadToStorage(path, body)` / `deleteFromStorage(path)` → Bunny Storage API.
 * - `purge(url)` → account API (needs accountApiKey).
 */
export async function getBunny() {
  const { data, secrets } = await getSetting("bunny");
  const region = String(data.storageRegion ?? "");
  return {
    enabled: data.enabled === true && !!data.cdnUrl,
    cdnUrl: String(data.cdnUrl ?? "").replace(/\/$/, ""),
    zone: String(data.storageZone ?? ""),
    basePath: String(data.basePath ?? "").replace(/\/$/, ""),
    storageHost: `https://${region ? `${region}.` : ""}storage.bunnycdn.com`,
    storagePassword: secrets.storagePassword ?? "",
    accountApiKey: secrets.accountApiKey ?? "",
    pullZoneId: String(data.pullZoneId ?? ""),
    optimizer: data.optimizer === true,
    quality: Number(data.imageQuality) || 82,
  };
}

export async function cdnUrl(path: string, opts: { width?: number; format?: "webp" | "avif" | "auto" } = {}) {
  const b = await getBunny();
  if (!b.enabled) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  const url = `${b.cdnUrl}${b.basePath}${clean}`;
  if (!b.optimizer) return url;
  const q = new URLSearchParams();
  if (opts.width) q.set("width", String(opts.width));
  q.set("quality", String(b.quality));
  if (opts.format) q.set("format", opts.format);
  return `${url}?${q}`;
}

export async function uploadToStorage(path: string, body: Buffer | Uint8Array, contentType?: string) {
  const b = await getBunny();
  if (!b.zone || !b.storagePassword) throw new Error("Bunny Storage: δεν έχει ρυθμιστεί");
  const clean = path.replace(/^\//, "");
  const res = await fetch(`${b.storageHost}/${b.zone}${b.basePath}/${clean}`, { method: "PUT", headers: { AccessKey: b.storagePassword, "Content-Type": contentType ?? "application/octet-stream" }, body: body as BodyInit });
  if (!res.ok) throw new Error(`Bunny Storage upload ${res.status}`);
  return `${b.cdnUrl}${b.basePath}/${clean}`;
}

export async function deleteFromStorage(path: string) {
  const b = await getBunny();
  const clean = path.replace(/^\//, "");
  const res = await fetch(`${b.storageHost}/${b.zone}${b.basePath}/${clean}`, { method: "DELETE", headers: { AccessKey: b.storagePassword } });
  return res.ok;
}

export async function purge(url: string) {
  const b = await getBunny();
  if (!b.accountApiKey) return false;
  const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}`, { method: "POST", headers: { AccessKey: b.accountApiKey } });
  return res.ok;
}
