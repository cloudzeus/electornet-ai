import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { contrast } from "./brand-store-check";
import type { BrandTheme } from "./brand-store";

/**
 * «Στυλ από το επίσημο site»: διαβάζει την αρχική σελίδα της μάρκας και τα CSS της και προτείνει παλέτα
 * (φόντο, κείμενο, χρώμα μάρκας), light/dark, γραμματοσειρές (μόνο ως πληροφορία — δεν φορτώνουμε fonts με άδεια)
 * και όνομα/περιγραφή. Παίρνουμε ΜΟΝΟ χρώματα και meta· καμία εικόνα ή κείμενο σελίδας δεν αντιγράφεται.
 * Ασφάλεια: μόνο https, μόνο δημόσιες διευθύνσεις (έλεγχος DNS σε κάθε redirect), όρια χρόνου και μεγέθους.
 */

export type StyleSuggestion = {
  url: string;
  siteName: string | null;
  description: string | null;
  theme: BrandTheme;
  /** εναλλακτική παλέτα στο αντίθετο mode */
  alt: BrandTheme;
  /** τα πιο «χαρακτηριστικά» χρώματα, για να διαλέξει άλλο χρώμα μάρκας με ένα κλικ */
  swatches: { hex: string; weight: number }[];
  fonts: string[];
  notes: string[];
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 EuronicsBrandStyle/1.0";

function privateIp(ip: string) {
  if (isIP(ip) === 6) { const l = ip.toLowerCase(); return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168."); }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:") throw new Error("Μόνο διευθύνσεις https://");
  if (u.port && u.port !== "443") throw new Error("Μη επιτρεπτή θύρα.");
  const host = u.hostname;
  if (isIP(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) throw new Error("Δώσε το δημόσιο domain της μάρκας (π.χ. https://www.lg.com/gr).");
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Το ${host} δεν βρέθηκε.`);
  if (addrs.some((a) => privateIp(a.address))) throw new Error("Η διεύθυνση δεν είναι δημόσια.");
}

/** fetch με έλεγχο κάθε redirect και όριο μεγέθους */
async function getText(url: string, max: number, accept: string): Promise<{ url: string; text: string }> {
  let u = new URL(url);
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(u);
    const r = await fetch(u, { redirect: "manual", headers: { "user-agent": UA, accept, "accept-language": "el-GR,el;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(12_000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location")!, u); if (u.protocol === "http:") u.protocol = "https:"; continue; }
    if (!r.ok) throw new Error(`Το site απάντησε ${r.status}${r.status === 403 ? " (μπλοκάρει αυτόματη ανάγνωση)" : ""}.`);
    const reader = r.body?.getReader();
    if (!reader) return { url: u.toString(), text: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; chunks.push(value); if (size > max) { await reader.cancel(); break; } }
    return { url: u.toString(), text: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new Error("Πάρα πολλές ανακατευθύνσεις.");
}

// ---- χρώματα ----
type RGB = [number, number, number];
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
const toHex = ([r, g, b]: RGB) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
function parseColor(s: string): { rgb: RGB; a: number } | null {
  s = s.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
    return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1 };
  return null;
}
function hsl([r, g, b]: RGB) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  return { s, l };
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const fromHex = (h: string): RGB => parseColor(h)!.rgb;

/** κάνει το `fg` όσο χρειάζεται πιο κοντά στο `toward` ώστε να πιάσει την αντίθεση `target` πάνω στο `bg` */
function ensure(fg: RGB, bg: string, toward: RGB, target: number): string {
  for (let t = 0; t <= 1.0001; t += 0.05) { const c = toHex(mix(fg, toward, t)); if ((contrast(c, bg) ?? 0) >= target) return c; }
  return toHex(toward);
}

function palette(accent: string, mode: "light" | "dark", bodyBg: string | null, text: string | null): BrandTheme {
  const A = fromHex(accent);
  if (mode === "dark") {
    const bg = bodyBg && (contrast(bodyBg, "#000000") ?? 99) < 2 ? bodyBg : "#0b0b0d";
    const bg2 = toHex(mix(fromHex(bg), [255, 255, 255], 0.07));
    return { mode, bg, bg2, ink: "#ffffff", muted: ensure([140, 140, 150], bg, [255, 255, 255], 4.6), accent, accentInk: (contrast("#ffffff", accent) ?? 0) >= (contrast("#000000", accent) ?? 0) ? "#ffffff" : "#000000" };
  }
  const bg = bodyBg && (contrast(bodyBg, "#ffffff") ?? 99) < 1.15 ? bodyBg : "#ffffff";
  const bg2 = toHex(mix(mix(fromHex(bg), A, 0.04), [238, 240, 244], 0.5));
  const ink = text && (contrast(text, bg) ?? 0) >= 7 ? text : "#111318";
  return { mode, bg, bg2, ink, muted: ensure(mix(fromHex(ink), fromHex(bg), 0.5), bg, fromHex(ink), 4.6), accent: ensureAccent(accent, bg), accentInk: (contrast("#ffffff", accent) ?? 0) >= (contrast("#000000", accent) ?? 0) ? "#ffffff" : "#000000" };
}
/** χρώμα μάρκας πολύ ανοιχτό για λευκό φόντο (π.χ. κίτρινο) → λίγο πιο σκούρο για να διαβάζονται τίτλοι */
const ensureAccent = (accent: string, bg: string) => ((contrast(accent, bg) ?? 0) >= 3 ? accent : ensure(fromHex(accent), bg, [0, 0, 0], 3));

export async function scrapeBrandStyle(input: string): Promise<StyleSuggestion> {
  const start = /^https?:\/\//i.test(input.trim()) ? input.trim().replace(/^http:/i, "https:") : `https://${input.trim()}`;
  const page = await getText(start, 1_500_000, "text/html,application/xhtml+xml");
  const html = page.text;
  const base = new URL(page.url);
  const meta = (re: RegExp) => html.match(re)?.[1]?.trim() || null;
  const attr = (name: string) => meta(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")) ?? meta(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, "i"));
  const decode = (s: string | null) => s?.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">") ?? null;

  const notes: string[] = [];
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += "\n" + [...html.matchAll(/\sstyle=["']([^"']+)["']/gi)].map((m) => `x{${m[1]}}`).join("\n");
  const sheets = [...html.matchAll(/<link[^>]+rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter((h): h is string => !!h).slice(0, 8);
  let fetched = 0;
  for (const h of sheets) {
    try { const r = await getText(new URL(h.replace(/&amp;/g, "&"), base).toString(), 900_000, "text/css,*/*;q=0.1"); css += "\n" + r.text; fetched++; } catch { /* ένα CSS που δεν φορτώνει δεν σταματά την ανάλυση */ }
    if (css.length > 3_000_000) break;
  }
  if (!sheets.length && css.length < 2000) notes.push("Το site φτιάχνει τη σελίδα με JavaScript· η ανάλυση στηρίχτηκε σε λίγα στοιχεία — έλεγξε την πρόταση.");
  else notes.push(`Αναλύθηκαν ${fetched} αρχεία CSS και η αρχική σελίδα.`);

  // βάρη: theme-color ×12, custom properties με όνομα brand/primary/accent ×8, κουμπιά/CTA ×4, οτιδήποτε άλλο ×1
  const score = new Map<string, number>();
  const add = (raw: string, w: number) => { const c = parseColor(raw); if (!c || c.a < 0.6) return; const hx = toHex(c.rgb); score.set(hx, (score.get(hx) ?? 0) + w); };
  const themeColor = attr("theme-color");
  if (themeColor) add(themeColor, 12);
  const COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\([^)]+\)/gi;
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) {
    const w = /(primary|brand|accent|main|key|highlight|cta|theme)/i.test(m[1]) ? 8 : 1;
    for (const c of m[2].match(COLOR) ?? []) add(c, w);
  }
  let bodyBg: string | null = null;
  let bodyText: string | null = null;
  const fonts = new Map<string, number>();
  for (const m of css.matchAll(/([^{}]{1,300})\{([^{}]{1,4000})\}/g)) {
    const sel = m[1].toLowerCase();
    const decl = m[2];
    const w = /(btn|button|cta|primary|brand|accent)/.test(sel) ? 4 : 1;
    for (const d of decl.matchAll(/(?:^|;)\s*(background(?:-color)?|color|border(?:-color)?|fill)\s*:\s*([^;]+)/gi)) for (const c of d[2].match(COLOR) ?? []) add(c, w);
    if (/(^|[\s,])(html|body)\s*$/.test(sel.trim()) || /(^|,)\s*(html|body)\s*(,|$)/.test(sel)) {
      const bg = decl.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.match(COLOR)?.[0];
      const tx = decl.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.match(COLOR)?.[0];
      if (bg && parseColor(bg)) bodyBg = toHex(parseColor(bg)!.rgb);
      if (tx && parseColor(tx)) bodyText = toHex(parseColor(tx)!.rgb);
    }
    const ff = decl.match(/font-family\s*:\s*([^;]+)/i)?.[1];
    if (ff) { const first = ff.split(",")[0].replace(/["']/g, "").trim(); if (first && !/^(inherit|initial|var\(|sans-serif|serif|monospace|system-ui|-apple-system|arial|helvetica|icons?|fontawesome)/i.test(first)) fonts.set(first, (fonts.get(first) ?? 0) + 1); }
  }

  const ranked = [...score.entries()].map(([hex, weight]) => ({ hex, weight, ...hsl(fromHex(hex)) })).sort((a, b) => b.weight - a.weight);
  const colorful = ranked.filter((c) => c.s >= 0.35 && c.l >= 0.18 && c.l <= 0.78);
  const accent = (themeColor && parseColor(themeColor) && hsl(parseColor(themeColor)!.rgb).s >= 0.35 ? toHex(parseColor(themeColor)!.rgb) : null) ?? colorful[0]?.hex ?? ranked.find((c) => c.l > 0.08 && c.l < 0.92)?.hex ?? "#0a3d91";
  if (!colorful.length) notes.push("Η μάρκα χρησιμοποιεί κυρίως ουδέτερα χρώματα (μαύρο/λευκό/γκρι) — διάλεξε χρώμα μάρκας από τα δείγματα ή γράψ' το.");
  const dark = bodyBg ? (contrast(bodyBg, "#000000") ?? 99) < 2.5 : false;
  const mode = dark ? "dark" : "light";
  const swatches = [...new Map([...colorful, ...ranked.filter((c) => c.s < 0.35)].map((c) => [c.hex, c])).values()].slice(0, 12).map(({ hex, weight }) => ({ hex, weight }));

  return {
    url: page.url,
    siteName: decode(attr("og:site_name") ?? attr("application-name")),
    description: decode(attr("og:description") ?? attr("description")),
    theme: palette(accent, mode, bodyBg, bodyText),
    alt: palette(accent, mode === "dark" ? "light" : "dark", null, null),
    swatches,
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f),
    notes,
  };
}

/** Παλέτα από ένα χρώμα μάρκας (όταν ο χρήστης διαλέγει άλλο δείγμα ή γράφει δικό του). */
export function paletteFromAccent(accent: string, mode: "light" | "dark"): BrandTheme {
  return palette(accent, mode, null, null);
}
