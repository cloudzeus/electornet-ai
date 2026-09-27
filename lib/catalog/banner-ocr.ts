import "server-only";
import sharp, { type Sharp } from "sharp";
import { chat, parseJson } from "@/lib/ai/openrouter";

/**
 * Απόδελτίωση banner κατασκευαστή: μία εικόνα με φωτογραφίες ΚΑΙ κείμενο (τίτλοι, παράγραφοι, εικονίδια με λεζάντες,
 * υποσημειώσεις) → δομημένες ενότητες που η σελίδα προϊόντος αποδίδει ως πραγματικό κείμενο + καθαρές φωτογραφίες.
 *
 * Ένα μοντέλο όρασης (OCR + ανάλυση διάταξης) διαβάζει το κείμενο αυτολεξεί, το μεταφράζει στα ελληνικά όταν είναι ξένο,
 * και δίνει πλαίσια (bounding boxes) για κάθε στοιχείο. Τα πλαίσια είναι κλάσματα 0…1 της ΑΡΧΙΚΗΣ εικόνας, ώστε το ίδιο
 * αποτέλεσμα να κόβεται σε οποιαδήποτε ανάλυση — ο διαχειριστής τα διορθώνει στο εργαλείο πριν την αποθήκευση.
 *
 * Τα πολύ ψηλά banners (π.χ. 1200 × 4000) χωρίζονται πρώτα σε κομμάτια στις ΛΕΥΚΕΣ λωρίδες ανάμεσα στις ενότητες:
 * έτσι το μοντέλο βλέπει κείμενο σε αναγνώσιμο μέγεθος και καμία ενότητα δεν κόβεται στη μέση.
 */
export type Box = [number, number, number, number]; // x, y, πλάτος, ύψος — κλάσματα 0…1 της αρχικής εικόνας
export interface OcrText { text: string; el?: string; box: Box | null }
export interface OcrFeature { label: OcrText; icon: Box | null }
export type ImageKind = "product" | "lifestyle" | "detail" | "diagram";
export interface OcrImage { box: Box; kind: ImageKind; overlayText: boolean; alt: string }
export interface OcrSection { title: OcrText | null; subtitle: OcrText | null; paragraphs: OcrText[]; features: OcrFeature[]; footnote: OcrText | null; images: OcrImage[] }
export interface BannerAnalysis { width: number; height: number; lang: string; sections: OcrSection[]; model: string; costUsd: number; ms: number; tiles: number }

export const OCR_MODEL = process.env.BANNER_OCR_MODEL || "google/gemini-3.8-flash";
const MAX_SIDE = 2000;

const PROMPT = `You are a precise OCR and layout-analysis engine for an electronics e-shop. The image is a MANUFACTURER MARKETING BANNER for one product (washing machine, TV, air conditioner…). It mixes photos with text. Break it into content SECTIONS so the shop can re-publish it as real, responsive HTML (text as text, photos as clean crops).

Return ONLY JSON:
{"lang": "el"|"en"|"de"|"other",
 "sections": [{
   "title": T|null,          // the big heading of the section
   "subtitle": T|null,       // a smaller heading under/near the title
   "paragraphs": T[],        // body text, one entry per paragraph, in reading order
   "features": [{"label": T, "icon": BOX|null}],   // short labelled items (often an icon + 1–4 words), in reading order
   "footnote": T|null,       // small print / disclaimers (lines starting with * are footnotes)
   "images": [{"box": BOX, "kind": "product"|"lifestyle"|"detail"|"diagram", "overlayText": boolean, "alt": string}]
 }]}
T = {"text": string, "el": string|undefined, "box": BOX}
BOX = [ymin, xmin, ymax, xmax] integers 0–1000, relative to THIS image.

RULES
- Transcribe text EXACTLY as printed (keep accents, units, ®, ™, symbols, line meaning). Join lines of the same paragraph with a space. Never invent or summarise.
- If a text is NOT in Greek, also give "el": a natural Greek translation for a Greek shopper (keep brand/technology names like "AI EcoBubble", "OLED", "Wi-Fi" as they are). If it is already Greek, omit "el".
- A banner can contain 1 or more sections (separated by space, a new big heading, or a new photo). Keep the visual top-to-bottom, left-to-right order.
- images: real photos / renders / diagrams of meaningful size, AND prominent graphic emblems that carry meaning (e.g. a "10 years warranty" seal, a "High Quality" label, an award or certification badge) — give those kind "diagram". NOT the small feature icons (those go to features[].icon), NOT the plain brand logo, NOT decorative lines or empty background. Box tightly around the visible element itself.
- Specification tables: put EVERY row as a feature with label "Name: value" (no icon), in order, until the table ends — do not stop halfway.
- overlayText = true when a heading/text is printed ON TOP of the photo. In that case try to box the photo area that does NOT contain the text if a clean crop of at least half the photo is possible; otherwise box the whole photo.
- alt: short Greek description of the photo (max 12 words), e.g. "Πλυντήριο σε κουζίνα με ξύλινα ντουλάπια".
- Ignore text that is part of the product itself (buttons, labels printed on the appliance, screen UI).
- Boxes must be tight and accurate — they are used to crop the image.`;

// ---------- Κομμάτια για τα ψηλά banners ----------

/** Γραμμές της εικόνας που είναι «άδειες» (ομοιόμορφο φόντο): εκεί κόβουμε χωρίς να σπάσουμε ενότητα. */
async function blankRows(img: Sharp, width: number, height: number): Promise<boolean[]> {
  const w = Math.min(400, width), h = Math.round((height * w) / width);
  const { data } = await img.clone().greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const rows: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let min = 255, max = 0;
    for (let x = 0; x < w; x++) { const v = data[y * w + x]; if (v < min) min = v; if (v > max) max = v; }
    rows.push(max - min < 14);
  }
  // πίσω στην κλίμακα της αρχικής εικόνας
  const out: boolean[] = new Array(height);
  for (let y = 0; y < height; y++) out[y] = rows[Math.min(h - 1, Math.floor((y * h) / height))];
  return out;
}

/** Όρια κομματιών (y αρχής/τέλους): στόχος ύψος ≈ πλάτος × 1,1, κόψιμο στη μέση της πλησιέστερης λευκής ζώνης. */
async function tileBounds(img: Sharp, width: number, height: number): Promise<[number, number][]> {
  if (height / width <= 1.4) return [[0, height]];
  const target = Math.round(width * 1.1), blank = await blankRows(img, width, height);
  const cuts: number[] = [0];
  while (height - cuts[cuts.length - 1] > target * 1.3) {
    const from = cuts[cuts.length - 1], ideal = from + target, lo = from + Math.round(target * 0.55), hi = Math.min(height - 1, from + Math.round(target * 1.35));
    // η μακρύτερη λευκή ζώνη μέσα στο παράθυρο, προτιμώντας όσες είναι κοντά στο ιδανικό σημείο
    let best = -1, bestScore = -Infinity;
    for (let y = lo; y < hi; ) {
      if (!blank[y]) { y++; continue; }
      let e = y; while (e < hi && blank[e]) e++;
      const mid = Math.round((y + e) / 2), score = (e - y) - Math.abs(mid - ideal) / 20;
      if (e - y >= 6 && score > bestScore) { best = mid; bestScore = score; }
      y = e;
    }
    cuts.push(best > 0 ? best : ideal); // χωρίς λευκή ζώνη: σκληρό κόψιμο (σπάνιο)
  }
  cuts.push(height);
  return cuts.slice(0, -1).map((y, i) => [y, cuts[i + 1]] as [number, number]);
}

// ---------- Μετατροπές ----------

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Κουτί του μοντέλου [ymin,xmin,ymax,xmax] 0–1000 μέσα σε κομμάτι → [x,y,w,h] 0…1 της αρχικής εικόνας. */
function toBox(raw: unknown, tile: [number, number], height: number): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  const [y0, x0, y1, x1] = raw as number[];
  const th = tile[1] - tile[0];
  const top = (tile[0] + (Math.min(y0, y1) / 1000) * th) / height, bottom = (tile[0] + (Math.max(y0, y1) / 1000) * th) / height;
  const left = Math.min(x0, x1) / 1000, right = Math.max(x0, x1) / 1000;
  const b: Box = [clamp01(left), clamp01(top), clamp01(right) - clamp01(left), clamp01(bottom) - clamp01(top)];
  return b[2] > 0.005 && b[3] > 0.003 ? b : null;
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
function toText(raw: unknown, tile: [number, number], height: number): OcrText | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { text?: unknown; el?: unknown; box?: unknown };
  const text = clean(r.text); if (!text) return null;
  const el = clean(r.el);
  return { text, ...(el && el !== text ? { el } : {}), box: toBox(r.box, tile, height) };
}

interface RawSection { title?: unknown; subtitle?: unknown; paragraphs?: unknown[]; features?: { label?: unknown; icon?: unknown }[]; footnote?: unknown; images?: { box?: unknown; kind?: unknown; overlayText?: unknown; alt?: unknown }[] }

function toSection(r: RawSection, tile: [number, number], height: number): OcrSection | null {
  const s: OcrSection = {
    title: toText(r.title, tile, height), subtitle: toText(r.subtitle, tile, height),
    paragraphs: (Array.isArray(r.paragraphs) ? r.paragraphs : []).map((p) => toText(p, tile, height)).filter((p): p is OcrText => !!p),
    features: (Array.isArray(r.features) ? r.features : []).map((f) => ({ label: toText(f?.label, tile, height), icon: toBox(f?.icon, tile, height) })).filter((f): f is OcrFeature => !!f.label),
    footnote: toText(r.footnote, tile, height),
    images: (Array.isArray(r.images) ? r.images : []).map((im) => ({ box: toBox(im?.box, tile, height), kind: (["product", "lifestyle", "detail", "diagram"] as const).find((k) => k === im?.kind) ?? "product", overlayText: im?.overlayText === true, alt: clean(im?.alt).slice(0, 120) }))
      .filter((im): im is OcrImage => !!im.box && im.box[2] * im.box[3] > 0.004), // κάτω από ~0,4 % της επιφάνειας είναι εικονίδιο, όχι φωτογραφία
  };
  return s.title || s.subtitle || s.paragraphs.length || s.features.length || s.images.length ? s : null;
}

// ---------- Ανάλυση ----------

async function analyseTile(img: Sharp, width: number, height: number, tile: [number, number]) {
  const th = tile[1] - tile[0];
  const scale = Math.min(1, MAX_SIDE / Math.max(width, th));
  const jpeg = await img.clone().extract({ left: 0, top: tile[0], width, height: th }).resize(Math.round(width * scale), Math.round(th * scale)).flatten({ background: "#ffffff" }).jpeg({ quality: 86 }).toBuffer();
  const r = await chat({
    feature: "banner-ocr", model: OCR_MODEL, json: true, maxTokens: 6000, temperature: 0, timeoutMs: 90000, reasoning: "low",
    messages: [{ role: "system", content: PROMPT }, { role: "user", content: [{ type: "text", text: "Analyse this banner." }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }] }],
  });
  const j = parseJson<{ lang?: string; sections?: RawSection[] }>(r.text);
  if (!j) throw new Error("Το μοντέλο δεν επέστρεψε έγκυρη ανάλυση — δοκίμασε ξανά.");
  return { lang: typeof j.lang === "string" ? j.lang : "other", sections: (j.sections ?? []).map((s) => toSection(s, tile, height)).filter((s): s is OcrSection => !!s), costUsd: r.costUsd, model: r.model };
}

/** Ανάλυση ενός banner (JPG / PNG / WebP / μία σελίδα PDF ως εικόνα). */
export async function analyseBanner(bytes: Buffer): Promise<BannerAnalysis> {
  const t0 = Date.now();
  const img = sharp(bytes, { limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  const width = meta.autoOrient?.width ?? meta.width ?? 0, height = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!width || !height) throw new Error("Δεν αναγνωρίστηκε ως εικόνα.");
  const tiles = await tileBounds(img, width, height);
  const parts = await Promise.all(tiles.map((t) => analyseTile(img, width, height, t)));
  const langs = parts.map((p) => p.lang);
  return {
    width, height, lang: langs.find((l) => l !== "el") ?? langs[0] ?? "other",
    sections: parts.flatMap((p) => p.sections), model: parts[0]?.model ?? OCR_MODEL,
    costUsd: parts.reduce((n, p) => n + p.costUsd, 0), ms: Date.now() - t0, tiles: tiles.length,
  };
}

// ---------- Κόψιμο φωτογραφιών ----------

/**
 * Κόβει ένα πλαίσιο από την αρχική εικόνα σε WebP. Μικρό περιθώριο γύρω από το πλαίσιο του μοντέλου και μετά «ξάκρισμα»
 * του ομοιόμορφου φόντου (λευκό γύρω από φωτογραφία προϊόντος) — εκτός αν το ξάκρισμα τρώει πάνω από τη μισή εικόνα.
 */
export async function cropBox(bytes: Buffer, box: Box, opts: { pad?: number; trim?: boolean; max?: number } = {}): Promise<{ webp: Buffer; width: number; height: number }> {
  const img = sharp(bytes, { limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  const W = meta.autoOrient?.width ?? meta.width ?? 0, H = meta.autoOrient?.height ?? meta.height ?? 0;
  const pad = opts.pad ?? 0.004;
  const left = Math.max(0, Math.floor((box[0] - pad) * W)), top = Math.max(0, Math.floor((box[1] - pad) * H));
  const width = Math.min(W - left, Math.ceil((box[2] + pad * 2) * W)), height = Math.min(H - top, Math.ceil((box[3] + pad * 2) * H));
  if (width < 8 || height < 8) throw new Error("Το πλαίσιο είναι πολύ μικρό.");
  let out = await img.clone().extract({ left, top, width, height }).png().toBuffer();
  if (opts.trim !== false) {
    const t = await sharp(out).trim({ threshold: 12 }).png().toBuffer({ resolveWithObject: true }).catch(() => null);
    if (t && t.info.width * t.info.height >= width * height * 0.5) out = t.data;
  }
  const max = opts.max ?? 1600;
  const r = await sharp(out).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
  return { webp: r.data, width: r.info.width, height: r.info.height };
}

/**
 * Έξυπνη περικοπή εικονιδίου: το πλαίσιο του μοντέλου είναι συχνά λίγο στενό και «κόβει» το εικονίδιο. Εδώ κοιτάμε τα
 * pixels: βρίσκουμε το χρώμα φόντου γύρω του, ακολουθούμε τα σχήματα του εικονιδίου (με μικρή διαστολή ώστε οι γραμμές
 * του να ενώνονται) πέρα από το πλαίσιο, μέχρι να κλείσει — χωρίς να «πιάσουμε» τη λεζάντα δίπλα (το κενό τη χωρίζει).
 * Αν το φόντο δεν είναι καθαρό (φωτογραφία), γυρνά στο πλαίσιο με άνετο περιθώριο.
 */
export async function cropIcon(bytes: Buffer, box: Box, opts: { max?: number } = {}): Promise<{ webp: Buffer; width: number; height: number; smart: boolean }> {
  const img = sharp(bytes, { limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  const W = meta.autoOrient?.width ?? meta.width ?? 0, H = meta.autoOrient?.height ?? meta.height ?? 0;
  const bx = Math.round(box[0] * W), by = Math.round(box[1] * H), bw = Math.max(1, Math.round(box[2] * W)), bh = Math.max(1, Math.round(box[3] * H));
  const m = Math.max(12, Math.round(Math.max(bw, bh) * 0.6));
  const L = Math.max(0, bx - m), T = Math.max(0, by - m), R = Math.min(W, bx + bw + m), B = Math.min(H, by + bh + m);
  const ww = R - L, wh = B - T;
  const max = opts.max ?? 160;
  const finish = async (x: number, y: number, w: number, h: number, smart: boolean) => {
    const e = { left: Math.max(0, x), top: Math.max(0, y), width: Math.max(8, Math.min(W - Math.max(0, x), w)), height: Math.max(8, Math.min(H - Math.max(0, y), h)) };
    const r = await img.clone().extract(e).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { webp: r.data, width: r.info.width, height: r.info.height, smart };
  };
  const fallback = () => { const p = Math.round(Math.max(bw, bh) * 0.12); return finish(bx - p, by - p, bw + 2 * p, bh + 2 * p, false); };
  if (ww < 8 || wh < 8) return fallback();

  const { data } = await img.clone().extract({ left: L, top: T, width: ww, height: wh }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => (y * ww + x) * 3;
  // φόντο = διάμεσος των pixels της περιμέτρου του παραθύρου
  const ring: number[][] = [[], [], []];
  for (let x = 0; x < ww; x++) for (const y of [0, wh - 1]) { const i = px(x, y); ring[0].push(data[i]); ring[1].push(data[i + 1]); ring[2].push(data[i + 2]); }
  for (let y = 0; y < wh; y++) for (const x of [0, ww - 1]) { const i = px(x, y); ring[0].push(data[i]); ring[1].push(data[i + 1]); ring[2].push(data[i + 2]); }
  const med = ring.map((c) => c.sort((a, b) => a - b)[c.length >> 1]);
  // καθαρό φόντο; (αλλιώς είναι φωτογραφία — καμία εικασία)
  const spread = ring[0].filter((_, k) => Math.abs(ring[0][k] - med[0]) + Math.abs(ring[1][k] - med[1]) + Math.abs(ring[2][k] - med[2]) > 60).length / ring[0].length;
  if (spread > 0.25) return fallback();

  const ink = new Uint8Array(ww * wh);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) { const i = px(x, y); if (Math.max(Math.abs(data[i] - med[0]), Math.abs(data[i + 1] - med[1]), Math.abs(data[i + 2] - med[2])) > 40) ink[y * ww + x] = 1; }
  // διαστολή 2px: οι γραμμές του ίδιου εικονιδίου ενώνονται, η λεζάντα (με κενό) μένει χωριστά
  const D = 2, dil = new Uint8Array(ww * wh);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) if (ink[y * ww + x]) for (let dy = -D; dy <= D; dy++) for (let dx = -D; dx <= D; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < ww && Y < wh) dil[Y * ww + X] = 1; }
  // σπόροι: μελάνι μέσα στο αρχικό πλαίσιο
  const seen = new Uint8Array(ww * wh), q: number[] = [];
  for (let y = by - T; y < by - T + bh; y++) for (let x = bx - L; x < bx - L + bw; x++) if (x >= 0 && y >= 0 && x < ww && y < wh && ink[y * ww + x]) { seen[y * ww + x] = 1; q.push(y * ww + x); }
  if (!q.length) return fallback();
  let x0 = ww, y0 = wh, x1 = -1, y1 = -1;
  while (q.length) {
    const k = q.pop()!, x = k % ww, y = (k / ww) | 0;
    if (ink[k]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= ww || Y >= wh) continue; const n = Y * ww + X; if (!seen[n] && dil[n]) { seen[n] = 1; q.push(n); } }
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // άγγιξε το όριο του παραθύρου ή φούσκωσε υπερβολικά → ενώθηκε με κάτι άλλο (κείμενο, γραφικό): πλαίσιο με περιθώριο
  if (x0 === 0 || y0 === 0 || x1 === ww - 1 || y1 === wh - 1 || cw * ch > bw * bh * 3.2) return fallback();
  const p = Math.max(2, Math.round(Math.max(cw, ch) * 0.08));
  return finish(L + x0 - p, T + y0 - p, cw + 2 * p, ch + 2 * p, true);
}
