import "server-only";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { blockedHost, pageImages, robotsAllows } from "./enrich-core";

/**
 * Ανάγνωση ΜΙΑΣ σελίδας προϊόντος (site κατασκευαστή ή καταστήματος) για τις φωτογραφίες που δηλώνει η ίδια.
 * Κανόνες: όχι συγκριτικά / marketplaces (blockedHost), σεβασμός του robots.txt (User-agent: *), καμία παράκαμψη
 * προστασίας bot — 403 / challenge = δεν διαβάζεται. Μόνο δημόσιες διευθύνσεις (fetchPublicBytes).
 */
const robotsCache = new Map<string, { at: number; txt: string | null }>();

async function robotsFor(origin: string): Promise<string | null> {
  const c = robotsCache.get(origin);
  if (c && Date.now() - c.at < 6 * 3600_000) return c.txt;
  const txt = await fetchPublicBytes(`${origin}/robots.txt`, { max: 512 * 1024, accept: "text/plain", timeoutMs: 8000 }).then((r) => r.bytes.toString("utf8")).catch((e: Error) => (/ 404/.test(e.message) ? "" : null));
  robotsCache.set(origin, { at: Date.now(), txt });
  return txt;
}

export type PageCheck = { ok: true; images: string[] } | { ok: false; reason: string };

export async function readProductPage(url: string): Promise<PageCheck> {
  if (blockedHost(url)) return { ok: false, reason: "συγκριτικό / marketplace — δεν χρησιμοποιείται" };
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "μη έγκυρη διεύθυνση" }; }
  const robots = await robotsFor(u.origin);
  // robots.txt που δεν διαβάζεται (403, challenge, timeout) = δεν ξέρουμε τι επιτρέπεται → δεν διαβάζουμε
  if (robots == null) return { ok: false, reason: "το robots.txt δεν διαβάζεται" };
  if (!robotsAllows(robots, u.pathname + u.search)) return { ok: false, reason: "το robots.txt δεν το επιτρέπει" };
  try {
    const r = await fetchPublicBytes(u.toString(), { max: 3 * 1024 * 1024, accept: "text/html,application/xhtml+xml", timeoutMs: 15000 });
    const html = r.bytes.toString("utf8");
    if (/cf-chl|challenge-platform|captcha/i.test(html.slice(0, 20000)) && !/<meta[^>]+og:image/i.test(html)) return { ok: false, reason: "προστασία bot — δεν διαβάζεται" };
    return { ok: true, images: pageImages(html, r.url) };
  } catch (e) { return { ok: false, reason: (e as Error).message.slice(0, 120) }; }
}
