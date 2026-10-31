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
/**
 * `hints`: κομμάτια του μοντέλου («717R32») — οι φωτογραφίες της γκαλερί (σύνδεσμοι <a href> προς αρχείο εικόνας, όπως στα
 * lightbox των WordPress / WooCommerce) με το μοντέλο στο όνομα αρχείου μπαίνουν πρώτες.
 */
export function pageImages(html: string, baseUrl: string, max = 12, hints: string[] = []): string[] {
  const found: string[] = [];
  const keys = modelKeys(hints);
  // όχι η ενεργειακή ετικέτα (συχνά jpg με το μοντέλο στο όνομα, δίπλα στο «Ενεργειακή Ετικέτα»)
  const gallery = [...html.matchAll(/<a\b[^>]*>/gi)].filter((m) => !labelLink(html, m.index)).map((m) => attr(m[0], "href")).filter((h): h is string => !!h && IMG_EXT.test(h.split(/[?#]/)[0]));
  const named = (u: string) => { const f = decodeURIComponent(u.split(/[?#]/)[0].split("/").pop() ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); return keys.some((k) => f.includes(k)); };
  found.push(...gallery.filter(named));
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonLdImages(JSON.parse(m[1].trim()), found); } catch { /* σπασμένο JSON-LD: αγνοείται */ }
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const prop = (attr(m[0], "property") ?? attr(m[0], "name") ?? "").toLowerCase();
    if (prop === "og:image" || prop === "og:image:secure_url" || prop === "twitter:image") { const c = attr(m[0], "content"); if (c) found.push(c); }
  }
  found.push(...gallery.filter((u) => !named(u)).slice(0, 6));
  return dedupe(found.map((u) => absolute(decode(u), baseUrl))).filter(isProductImageUrl).slice(0, max);
}

const stripTags = (h: string) => decode(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const LABEL_TEXT = /(ενεργειακ\S* ετικ[εέ]τα|ετικ[εέ]τα ενεργ|energy label|energielabel)\s*$/i;
/** Ο σύνδεσμος στη θέση `at` είναι η ενεργειακή ετικέτα: το κείμενο ακριβώς πριν από αυτόν λέει «Ενεργειακή ετικέτα». */
const labelLink = (html: string, at: number) => LABEL_TEXT.test(stripTags(html.slice(Math.max(0, at - 1500), at)).trim().slice(-80));

/** Η ενεργειακή ετικέτα που δημοσιεύει η σελίδα (εικόνα ή PDF δίπλα στο «Ενεργειακή ετικέτα»), αλλιώς null. */
export function energyLabelLink(html: string, baseUrl: string): string | null {
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
    const h = attr(m[0], "href");
    if (h && /\.(jpe?g|png|webp|pdf)(\?|#|$)/i.test(h) && labelLink(html, m.index)) return absolute(decode(h), baseUrl);
  }
  return null;
}

/** Ορατό κείμενο της σελίδας, με αλλαγές γραμμής στα κελιά / τίτλους, για ανάγνωση χαρακτηριστικών από το AI. */
export function pageText(html: string, max = 20000): string {
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  const t = decode(body.replace(/<(br|\/p|\/div|\/li|\/tr|\/t[dh]|\/h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/&nbsp;/g, " ");
  return t.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").slice(0, max);
}

/** Κομμάτια μοντέλου με ψηφία («HTN/HTG-717R32» → «717r32»), για ταίριασμα σε ονόματα αρχείων και διαδρομές. */
export const modelKeys = (hints: string[]) => [...new Set(hints.flatMap((h) => h.split(/[^\p{L}\p{N}]+/u)).map((h) => h.toLowerCase()).filter((h) => h.length >= 3 && /\d/.test(h)))];

/** Η αρχική σελίδα ενός site (χωρίς διαδρομή) δεν είναι σελίδα προϊόντος. */
export const isHomePage = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, "") === "" ; } catch { return true; } };

/**
 * Από μια λίστα διευθύνσεων (σύνδεσμοι αποτελεσμάτων αναζήτησης, sitemap): η πρώτη του ΙΔΙΟΥ site που η διαδρομή της
 * περιέχει το μοντέλο («/oikiakos-klimatismos/htn-htg-717r32/» για «717R32»). Όχι αρχεία (PDF / εικόνες), όχι αναζητήσεις.
 */
export function modelUrl(urls: string[], host: string, hints: string[]): string | null {
  const keys = modelKeys(hints).filter((k) => k.length >= 5); // «r32» ταιριάζει σε όλη τη σειρά — μόνο ισχυρά κομμάτια
  if (!keys.length) return null;
  for (const u of urls) {
    let x: URL;
    try { x = new URL(u); } catch { continue; }
    if (x.hostname !== host || x.search || /\.[a-z0-9]{2,5}$/i.test(x.pathname) || isHomePage(u) || /\/(search|feed|tag)\//i.test(x.pathname)) continue;
    let path: string;
    try { path = decodeURIComponent(x.pathname); } catch { path = x.pathname; }
    path = path.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (keys.some((k) => path.includes(k))) return `${x.origin}${x.pathname}`;
  }
  return null;
}

/** Ο πρώτος σύνδεσμος μιας σελίδας αποτελεσμάτων αναζήτησης που είναι η σελίδα του μοντέλου (βλ. modelUrl). */
export function searchResultLink(html: string, baseUrl: string, hints: string[]): string | null {
  let host: string;
  try { host = new URL(baseUrl).hostname; } catch { return null; }
  const urls = [...html.matchAll(/<a\b[^>]*>/gi)].map((m) => attr(m[0], "href")).map((h) => (h ? absolute(decode(h), baseUrl) : null)).filter((u): u is string => !!u);
  return modelUrl(urls, host, hints);
}

/** Λέξεις σειράς από τον τίτλο, για αναζήτηση σε site («HTN-717R32 (R32) TOYOTOMI HIRO INV.IN» → «HIRO»): χωρίς ψηφία, όχι η μάρκα. */
export function seriesWords(title: string, brand: string): string[] {
  const b = brand.toLowerCase();
  return [...new Set(title.split(/[\s()/,]+/).filter((w) => !/\d/.test(w)).map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => w.length >= 4 && w.toLowerCase() !== b && !/^(inverter|inv|wifi|black|white|silver|domestic)$/i.test(w)))].slice(0, 2);
}

/** Διευθύνσεις ενός sitemap (<loc>), και ποιες είναι υπο-sitemaps. */
export function sitemapLocs(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decode(m[1].trim()));
  const isIndex = /<sitemapindex\b/i.test(xml);
  return isIndex ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
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

// ---------- ενεργειακή σήμανση από τα χαρακτηριστικά των πηγών ----------

/**
 * Μοντέλα που έδωσε η πηγή (χαρακτηριστικό «Μοντέλο»), και στη γραφή του EPREL για τα ζεύγη κλιματιστικών:
 * «HTN/HTG-717R32» → «HTN-717R32/HTG-717R32» (εσωτερική/εξωτερική), «HTN-717R32».
 */
export function modelsFromSpecs(specs: { key: string; value: string }[]): string[] {
  const out: string[] = [];
  const add = (v: string) => { const t = v.trim(); if (t && !out.includes(t)) out.push(t); };
  for (const s of specs) {
    if (!/^(μοντέλο|μοντελο|model|κωδικός μοντέλου|αριθμός μοντέλου|model number)$/i.test(s.key.trim())) continue;
    const v = s.value.trim().toUpperCase();
    const pair = /^([A-Z]{2,5})\/([A-Z]{2,5})[-\s]?(\w[\w-]*)$/.exec(v);
    if (pair) { add(`${pair[1]}-${pair[3]}/${pair[2]}-${pair[3]}`); add(`${pair[1]}-${pair[3]}`); } else add(v);
  }
  return out.slice(0, 3);
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ενεργειακή κλάση από χαρακτηριστικά πηγής: «Ενεργειακή κλάση», «Κατηγορία ψύξης», «Energy class» — πρώτα η ψύξη. */
export function energyClassFromSpecs(specs: { key: string; value: string }[]): { cls: string; scale: "A-G" | "A+++-D"; key: string } | null {
  const isClass = (k: string) => /(κλαση|κατηγορια|ταξη|class|σημανση)/.test(k) && /(ενεργ|energy|ψυξ|cooling|θερμαν|heating)/.test(k);
  const ranked = specs.filter((s) => isClass(plain(s.key))).sort((a, b) => Number(/ψυξ|cooling/.test(plain(b.key))) - Number(/ψυξ|cooling/.test(plain(a.key))));
  for (const s of ranked) {
    const m = /^(A\+{1,3}|[A-G])(?![A-Z0-9])/.exec(s.value.trim().replace(/^[ΑΒΕαβε]/, (c) => ({ Α: "A", Β: "B", Ε: "E", α: "A", β: "B", ε: "E" })[c] ?? c).toUpperCase());
    if (m) return { cls: m[1], scale: m[1].includes("+") ? "A+++-D" : "A-G", key: s.key };
  }
  return null;
}
