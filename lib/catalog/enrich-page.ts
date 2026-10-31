import "server-only";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { blockedHost, energyLabelLink, modelKeys, pageImages, pageText, robotsAllows, searchResultLink, modelUrl, sitemapLocs } from "./enrich-core";

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

export type PageCheck = { ok: true; images: string[]; text: string; labelUrl: string | null; url: string } | { ok: false; reason: string };

/** Η σελίδα, με όλους τους κανόνες: όχι συγκριτικά, robots.txt, όχι προστασία bot. */
async function fetchPage(url: string): Promise<{ html: string; url: string } | { reason: string }> {
  if (blockedHost(url)) return { reason: "συγκριτικό / marketplace — δεν χρησιμοποιείται" };
  let u: URL;
  try { u = new URL(url); } catch { return { reason: "μη έγκυρη διεύθυνση" }; }
  const robots = await robotsFor(u.origin);
  // robots.txt που δεν διαβάζεται (403, challenge, timeout) = δεν ξέρουμε τι επιτρέπεται → δεν διαβάζουμε
  if (robots == null) return { reason: "το robots.txt δεν διαβάζεται" };
  if (!robotsAllows(robots, u.pathname + u.search)) return { reason: "το robots.txt δεν το επιτρέπει" };
  try {
    const r = await fetchPublicBytes(u.toString(), { max: 3 * 1024 * 1024, accept: "text/html,application/xhtml+xml", timeoutMs: 15000 });
    const html = r.bytes.toString("utf8");
    if (/cf-chl|challenge-platform|captcha/i.test(html.slice(0, 20000)) && !/<meta[^>]+og:image/i.test(html)) return { reason: "προστασία bot — δεν διαβάζεται" };
    return { html, url: r.url };
  } catch (e) { return { reason: (e as Error).message.slice(0, 120) }; }
}

/**
 * `hints`: κομμάτια του μοντέλου, για να μπαίνουν πρώτες οι φωτογραφίες της γκαλερί με το μοντέλο στο όνομα αρχείου.
 * Επιστρέφει και το ορατό κείμενο (για τα χαρακτηριστικά του ΙΔΙΟΥ μοντέλου) και την ενεργειακή ετικέτα της σελίδας.
 */
export async function readProductPage(url: string, hints: string[] = []): Promise<PageCheck> {
  const r = await fetchPage(url);
  if ("reason" in r) return { ok: false, reason: r.reason };
  return { ok: true, images: pageImages(r.html, r.url, 12, hints), text: pageText(r.html), labelUrl: energyLabelLink(r.html, r.url), url: r.url };
}

/**
 * Η σελίδα του μοντέλου σε ένα site, όταν ξέρουμε το site αλλά όχι τη σελίδα: πρώτα το sitemap (που δηλώνει το robots.txt
 * ή το /sitemap.xml) — μια διεύθυνση με το μοντέλο στη διαδρομή — αλλιώς η αναζήτηση του site (WordPress «?s=»), με τον
 * κωδικό και με τις λέξεις της σειράς (`words`).
 * Έως 12 αρχεία sitemap, με τους ίδιους κανόνες (robots.txt κ.λπ.).
 */
export async function searchSiteForModel(origin: string, hints: string[], words: string[] = []): Promise<string | null> {
  const host = new URL(origin).hostname;
  const robots = await robotsFor(origin);
  if (robots == null) return null;
  const declared = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const queue = declared.length ? declared : [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`];
  const seen = new Set<string>();
  for (let n = 0; queue.length && n < 12; n++) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    let u: URL;
    try { u = new URL(sm); } catch { continue; }
    if (u.hostname !== host || !robotsAllows(robots, u.pathname)) continue;
    const xml = await fetchPublicBytes(sm, { max: 8 * 1024 * 1024, accept: "application/xml,text/xml", timeoutMs: 15000 }).then((r) => r.bytes.toString("utf8")).catch(() => null);
    if (!xml) continue;
    const { pages, sitemaps } = sitemapLocs(xml);
    const hit = modelUrl(pages, host, hints);
    if (hit) return hit;
    // πρώτα τα sitemaps προϊόντων / σελίδων, τελευταία άρθρα, κατηγορίες, ετικέτες
    const rank = (x: string) => (/product|proion|page|item|model/i.test(x) ? 0 : /post|categor|tag|author|news|blog/i.test(x) ? 2 : 1);
    queue.push(...sitemaps.sort((a, b) => rank(a) - rank(b)));
  }
  // αναζήτηση του site: με τον κωδικό, και με τις λέξεις της σειράς από τον τίτλο («HIRO») — συχνά δεν ευρετηριάζουν κωδικούς
  const core = modelKeys(hints).sort((a, b) => b.length - a.length)[0];
  if (!core) return null;
  for (const q of [core, ...words.slice(0, 2)]) {
    const r = await fetchPage(`${origin}/?s=${encodeURIComponent(q)}`);
    const hit = "reason" in r ? null : searchResultLink(r.html, r.url, hints);
    if (hit) return hit;
  }
  return null;
}
