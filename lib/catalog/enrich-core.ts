/**
 * Καθαρός κώδικας του εμπλουτισμού (χωρίς βάση / δίκτυο), για να ελέγχεται με tests:
 *  - φωτογραφίες από τη γκαλερί του Icecat και από μια σελίδα προϊόντος (JSON-LD Product.image, og:image),
 *  - robots.txt: η σελίδα επιτρέπεται για όλους (User-agent: *)· αν όχι, δεν τη διαβάζουμε,
 *  - sites που δεν χρησιμοποιούνται ποτέ ως πηγή (συγκριτικά τιμών / marketplaces με προστασία bot).
 */

/** Συγκριτικά τιμών και marketplaces: απαγορεύουν την αυτόματη ανάγνωση ή συγκεντρώνουν ξένο περιεχόμενο. */
const BLOCKED = ["skroutz.gr", "bestprice.gr", "glami.gr", "google.com", "google.gr", "amazon.", "ebay.", "aliexpress.", "temu.", "shopflix.gr", "public-cdn"];

export function blockedHost(url: string): boolean {
  let h: string;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return true; }
  return BLOCKED.some((b) => (b.endsWith(".") ? h.includes(b) : h === b || h.endsWith(`.${b}`)));
}

const IMG_EXT = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
const NOT_PRODUCT = /(logo|icon|sprite|favicon|placeholder|banner-?top|badge|flag|payment|social|avatar|1x1|pixel)/i;

function absolute(u: string, base: string): string | null {
  try { const x = new URL(u.trim(), base); return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : null; } catch { return null; }
}

/** Διεύθυνση που μοιάζει με φωτογραφία προϊόντος (όχι λογότυπο / εικονίδιο / svg). */
export function isProductImageUrl(u: string): boolean {
  let x: URL;
  try { x = new URL(u); } catch { return false; }
  if (x.protocol !== "https:" && x.protocol !== "http:") return false;
  if (/\.svg(\?|$)/i.test(x.pathname) || /\.gif(\?|$)/i.test(x.pathname)) return false;
  return !NOT_PRODUCT.test(x.pathname);
}

const dedupe = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/** Γκαλερί Icecat: η μεγάλη εικόνα (Pic) πρώτα, αλλιώς η 500×500. */
export function icecatImages(gallery: { Pic?: string; Pic500x500?: string }[] | undefined, max = 12): string[] {
  return dedupe((gallery ?? []).map((g) => g.Pic || g.Pic500x500 || null)).filter(isProductImageUrl).slice(0, max);
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((v) => v != null) ?? null;
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/gi, "/");

function jsonLdImages(node: unknown, out: string[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) jsonLdImages(n, out); return; }
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (isProduct) {
    const im = o.image;
    for (const v of Array.isArray(im) ? im : [im]) {
      if (typeof v === "string") out.push(v);
      else if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") out.push((v as { url: string }).url);
    }
  }
  if (o["@graph"]) jsonLdImages(o["@graph"], out);
}

/**
 * Φωτογραφίες προϊόντος μιας σελίδας: πρώτα όσες δηλώνει η ίδια (JSON-LD Product.image), μετά og:image.
 * Δεν «ξύνουμε» κάθε <img> — μόνο ό,τι ο ιστότοπος δημοσιεύει ως εικόνα του προϊόντος.
 */
export function pageImages(html: string, baseUrl: string, max = 12): string[] {
  const found: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonLdImages(JSON.parse(m[1].trim()), found); } catch { /* σπασμένο JSON-LD: αγνοείται */ }
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const prop = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase();
    if (prop === "og:image" || prop === "og:image:secure_url" || prop === "twitter:image") { const c = attr(m[0], "content"); if (c) found.push(c); }
  }
  return dedupe(found.map((u) => absolute(decode(u), baseUrl))).filter(isProductImageUrl).slice(0, max);
}

/** Μόνο αν μοιάζει με αρχείο εικόνας ή δεν έχει κατάληξη (CDN τύπου /image/123) — για τις διευθύνσεις που δίνει το AI. */
export const looksLikeImageFile = (u: string) => { try { const p = new URL(u).pathname; return IMG_EXT.test(p) || !/\.[a-z0-9]{2,5}$/i.test(p); } catch { return false; } };

/**
 * robots.txt: επιτρέπεται η διαδρομή για «User-agent: *»; Ο κανόνας με το μεγαλύτερο ταίριασμα κερδίζει (Allow σε
 * ισοπαλία), όπως στο RFC 9309. Υποστηρίζει * και $. Χωρίς ομάδα για * → επιτρέπεται.
 */
export function robotsAllows(robots: string, path: string): boolean {
  const rules: { allow: boolean; pat: string }[] = [];
  let agents: string[] = [], inRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (inRules) { agents = []; inRules = false; } agents.push(v.toLowerCase()); continue; }
    if (k === "allow" || k === "disallow") { inRules = true; if (agents.includes("*") && v) rules.push({ allow: k === "allow", pat: v }); }
  }
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const re = new RegExp("^" + r.pat.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));
    if (!re.test(path)) continue;
    const len = r.pat.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/** Κλειδί προτάσεως χαρακτηριστικού: ίδια ομάδα + κλειδί δεν ξαναπροτείνεται. */
export const specFingerprint = (group: string, key: string) => [group, key].map((x) => x.toLowerCase().replace(/\s+/g, " ").trim()).join("|").slice(0, 300);
