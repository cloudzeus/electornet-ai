import "server-only";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Υφές του μοντέλου AR, όλες PNG με διαφάνεια:
 * - πρόσοψη: το cutout του προϊόντος (ή η φωτογραφία) χωρεμένο στην έδρα
 * - ετικέτες διαστάσεων: πινακίδα navy με λευκά γράμματα
 * - λογότυπο Euronics
 * Μικρές (≤1024 px) ώστε το μοντέλο να μένει κάτω από ~300 KB και να ανοίγει
 * γρήγορα στο κινητό.
 */
export const LABEL_ASPECT = 4; // 640×160

async function loadImage(src: string): Promise<Buffer | null> {
  try {
    if (/^https?:\/\//.test(src)) {
      const r = await fetch(src, { signal: AbortSignal.timeout(15000) });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
    return await readFile(path.join(process.cwd(), "public", src.replace(/^\//, "")));
  } catch { return null; }
}

export interface FrontSource { trimmed: Buffer; aspect: number; mode: "face" | "billboard" }

/**
 * Διαλέγει τη φωτογραφία που ταιριάζει καλύτερα στην πρόσοψη Π×Υ και την
 * κόβει στα όριά της (διαφανή ή λευκά περιθώρια). Αν ο λόγος πλευρών της
 * είναι κοντά στο Π/Υ είναι κατά μέτωπο και γεμίζει την έδρα· αλλιώς είναι
 * σε γωνία (φαίνεται και η πλαϊνή πλευρά, άρα πιο φαρδιά) και μπαίνει ως
 * billboard με το πραγματικό ύψος, ώστε να μην παραμορφώνεται.
 */
export async function pickFront(candidates: string[], faceAspect: number, forceFace = false): Promise<FrontSource | null> {
  let best: FrontSource | null = null, bestErr = Infinity;
  for (const src of candidates) {
    const raw = await loadImage(src);
    if (!raw) continue;
    let trimmed: Buffer;
    try { trimmed = await sharp(raw).ensureAlpha().trim({ threshold: 12 }).png().toBuffer(); } catch { trimmed = await sharp(raw).ensureAlpha().png().toBuffer(); }
    const meta = await sharp(trimmed).metadata();
    if (!meta.width || !meta.height) continue;
    const aspect = meta.width / meta.height;
    const err = Math.abs(Math.log(aspect / faceAspect));
    // Όταν τη διάλεξε ο διαχειριστής ως «όψη», γεμίζει πάντα την πρόσοψη
    if (err < bestErr) { bestErr = err; best = { trimmed, aspect, mode: forceFace || err <= 0.12 ? "face" : "billboard" }; }
    if (bestErr <= 0.05) break;
  }
  return best;
}

/**
 * Χρώμα σώματος για το ρεαλιστικό μοντέλο: η διάμεσος των αδιαφανών pixels της φωτογραφίας (λευκό κλιματιστικό →
 * σχεδόν λευκό, μαύρο ψυγείο → σκούρο). sRGB 0–255.
 */
export async function bodyColorOf(front: FrontSource): Promise<[number, number, number]> {
  const { data, info } = await sharp(front.trimmed).ensureAlpha().resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const ch: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < info.width * info.height; i++) { const o = i * 4; if (data[o + 3] < 200) continue; ch[0].push(data[o]); ch[1].push(data[o + 1]); ch[2].push(data[o + 2]); }
  if (!ch[0].length) return [236, 236, 236];
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return [med(ch[0]), med(ch[1]), med(ch[2])];
}
/** sRGB (0–255) → γραμμικό (0–1), όπως το θέλει το baseColorFactor του glTF */
export const toLinear = (c: [number, number, number]): [number, number, number] => c.map((v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];

/** Η επιλεγμένη φωτογραφία τεντωμένη στον λόγο του επιπέδου που θα τη δείξει (για billboard είναι ο δικός της). bg: αδιαφανής πρόσοψη στο χρώμα του σώματος. */
export async function frontTexture(front: FrontSource | null, planeAspect: number, bg?: [number, number, number]): Promise<Buffer> {
  const W = planeAspect >= 1 ? 1024 : Math.round(1024 * planeAspect), H = planeAspect >= 1 ? Math.round(1024 / planeAspect) : 1024;
  if (!front) return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
  if (bg) {
    const photo = await sharp(front.trimmed).resize({ width: W, height: H, fit: "fill" }).png().toBuffer();
    return sharp({ create: { width: W, height: H, channels: 3, background: { r: bg[0], g: bg[1], b: bg[2] } } }).composite([{ input: photo }]).png({ palette: true, quality: 92, compressionLevel: 9 }).toBuffer();
  }
  // PNG με παλέτα: ίδια εμφάνιση, περίπου το ένα τρίτο του μεγέθους — το μοντέλο ανοίγει γρήγορα και σε 4G
  return sharp(front.trimmed).resize({ width: W, height: H, fit: "fill" }).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
}

/**
 * Πινακίδα διάστασης: «Π 60 εκ.» — το γράμμα κίτρινο, ο αριθμός λευκός.
 *
 * Το κείμενο ΔΕΝ περνά από SVG <text>: στον server (container χωρίς
 * γραμματοσειρές) έβγαινε άδεια πινακίδα. Το γράφουμε με το sharp/pango από
 * τη δική μας Manrope (public/fonts), που έχει ελληνικά, και το κολλάμε πάνω
 * στην πινακίδα — ίδιο αποτέλεσμα σε κάθε μηχάνημα.
 */
const FONT_FILE = path.join(process.cwd(), "public", "fonts", "Manrope-var.ttf");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function labelTexture(axis: "Π" | "Υ" | "Β", value: number): Promise<Buffer> {
  const num = `${value.toLocaleString("el-GR", { maximumFractionDigits: 1 })} εκ.`;
  const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160"><rect x="4" y="4" width="632" height="152" rx="76" fill="#122A58" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/></svg>`);
  try {
    const text = await sharp({ text: { text: `<span foreground="#F1C400">${esc(axis)}</span><span foreground="#ffffff"> ${esc(num)}</span>`, font: "Manrope ExtraBold", fontfile: FONT_FILE, rgba: true, dpi: 520 } }).png().toBuffer();
    const fitted = await sharp(text).resize({ width: 520, height: 96, fit: "inside" }).toBuffer();
    return await sharp(pill).composite([{ input: fitted, gravity: "centre" }]).png().toBuffer();
  } catch {
    return sharp(pill).png().toBuffer(); // χωρίς γραμματοσειρά: σκέτη πινακίδα, όχι σφάλμα
  }
}

export async function logoTexture(): Promise<{ png: Buffer; aspect: number }> {
  const src = await readFile(path.join(process.cwd(), "public", "design", "euronics-logo.png"));
  const meta = await sharp(src).metadata();
  const aspect = (meta.width ?? 4) / (meta.height ?? 1);
  const png = await sharp(src).resize({ width: 768, fit: "inside" }).png().toBuffer();
  return { png, aspect };
}

/** Οθόνη τηλεόρασης σβηστή: σκούρο γυαλί με απαλή διαγώνια αντανάκλαση — καθαρό από κάθε γωνία, χωρίς παραμόρφωση. */
export async function screenTexture(aspect: number): Promise<Buffer> {
  const W = 1024, H = Math.max(64, Math.round(1024 / Math.max(0.5, aspect)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2130"/><stop offset="1" stop-color="#07090e"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0.18" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.32" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="0.46" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
  </defs><rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#r)"/></svg>`;
  return sharp(Buffer.from(svg)).png({ palette: true, compressionLevel: 9 }).toBuffer();
}
