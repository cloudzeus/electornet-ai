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
export async function pickFront(candidates: string[], faceAspect: number): Promise<FrontSource | null> {
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
    if (err < bestErr) { bestErr = err; best = { trimmed, aspect, mode: err <= 0.12 ? "face" : "billboard" }; }
    if (bestErr <= 0.05) break;
  }
  return best;
}

/** Η επιλεγμένη φωτογραφία τεντωμένη στον λόγο του επιπέδου που θα τη δείξει (για billboard είναι ο δικός της). */
export async function frontTexture(front: FrontSource | null, planeAspect: number): Promise<Buffer> {
  const W = planeAspect >= 1 ? 1024 : Math.round(1024 * planeAspect), H = planeAspect >= 1 ? Math.round(1024 / planeAspect) : 1024;
  if (!front) return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
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
