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

/** Η φωτογραφία χωρεμένη σε καμβά με τον λόγο της πρόσοψης, διαφανές φόντο. */
export async function frontTexture(image: string | null, cutout: string | null, aspect: number): Promise<Buffer> {
  const W = aspect >= 1 ? 1024 : Math.round(1024 * aspect), H = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const src = (cutout && (await loadImage(cutout))) ?? (image && (await loadImage(image))) ?? null;
  if (!src) return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
  const fitted = await sharp(src).resize({ width: Math.round(W * 0.94), height: Math.round(H * 0.94), fit: "inside", withoutEnlargement: false }).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).composite([{ input: fitted, gravity: "centre" }]).png().toBuffer();
}

/** Πινακίδα διάστασης: «Π 60 εκ.» — το γράμμα κίτρινο, ο αριθμός λευκός. */
export async function labelTexture(axis: "Π" | "Υ" | "Β", value: number): Promise<Buffer> {
  const num = `${value.toLocaleString("el-GR", { maximumFractionDigits: 1 })} εκ.`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160">
    <rect x="4" y="4" width="632" height="152" rx="76" fill="#122A58" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
    <text x="320" y="108" text-anchor="middle" font-family="Manrope, 'DejaVu Sans', Arial, Helvetica, sans-serif" font-weight="800" font-size="84" fill="#ffffff"><tspan fill="#F1C400">${axis}</tspan> ${num}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function logoTexture(): Promise<{ png: Buffer; aspect: number }> {
  const src = await readFile(path.join(process.cwd(), "public", "design", "euronics-logo.png"));
  const meta = await sharp(src).metadata();
  const aspect = (meta.width ?? 4) / (meta.height ?? 1);
  const png = await sharp(src).resize({ width: 768, fit: "inside" }).png().toBuffer();
  return { png, aspect };
}
