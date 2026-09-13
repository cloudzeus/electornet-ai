import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Evidence captured with every consent / login: real client IP (behind the
 * proxy / CDN), user agent parsed into OS · browser · device, locale, referer,
 * page URL. `ipHash` (sha256 with a server salt) is what survives erasure so
 * a consent can still be proven without keeping the IP itself.
 */
export interface Evidence { ip: string | null; ipHash: string | null; userAgent: string | null; os: string | null; browser: string | null; device: string | null; locale: string | null; referer: string | null; url: string | null; timezone: string | null }

export const hashIp = (ip: string) => createHash("sha256").update(`${process.env.EVIDENCE_SALT ?? process.env.AUTH_SECRET ?? "eu"}:${ip}`).digest("hex");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function parseUserAgent(ua: string): { os: string | null; browser: string | null; device: string | null } {
  const u = ua || "";
  const os = /Windows NT 10/.test(u) ? "Windows 10/11" : /Windows NT 6\.3/.test(u) ? "Windows 8.1" : /Windows/.test(u) ? "Windows" : /iPhone|iPad|iPod/.test(u) ? `iOS ${u.match(/OS (\d+[_.]\d+)/)?.[1]?.replace("_", ".") ?? ""}`.trim() : /Android/.test(u) ? `Android ${u.match(/Android (\d+(\.\d+)?)/)?.[1] ?? ""}`.trim() : /Mac OS X/.test(u) ? `macOS ${u.match(/Mac OS X (\d+[_.]\d+)/)?.[1]?.replace(/_/g, ".") ?? ""}`.trim() : /CrOS/.test(u) ? "ChromeOS" : /Linux/.test(u) ? "Linux" : null;
  const browser = /Edg\//.test(u) ? `Edge ${u.match(/Edg\/(\d+)/)?.[1]}` : /OPR\//.test(u) ? `Opera ${u.match(/OPR\/(\d+)/)?.[1]}` : /SamsungBrowser/.test(u) ? `Samsung Internet ${u.match(/SamsungBrowser\/(\d+)/)?.[1]}` : /Firefox\//.test(u) ? `Firefox ${u.match(/Firefox\/(\d+)/)?.[1]}` : /CriOS\//.test(u) ? `Chrome iOS ${u.match(/CriOS\/(\d+)/)?.[1]}` : /Chrome\//.test(u) ? `Chrome ${u.match(/Chrome\/(\d+)/)?.[1]}` : /Safari\//.test(u) && /Version\//.test(u) ? `Safari ${u.match(/Version\/(\d+)/)?.[1]}` : null;
  const device = /iPad|Tablet|Android(?!.*Mobile)/.test(u) ? "tablet" : /Mobi|iPhone|Android/.test(u) ? "mobile" : u ? "desktop" : null;
  return { os, browser, device };
}

export async function captureEvidence(extra: { url?: string | null; timezone?: string | null } = {}): Promise<Evidence> {
  const h = await headers();
  const raw = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ip = raw.replace(/^::ffff:/, "") || null;
  const userAgent = h.get("user-agent");
  const ua = parseUserAgent(userAgent ?? "");
  return { ip, ipHash: ip ? hashIp(ip) : null, userAgent, ...ua, locale: h.get("accept-language")?.split(",")[0] ?? null, referer: h.get("referer"), url: extra.url ?? h.get("referer") ?? null, timezone: extra.timezone ?? null };
}
