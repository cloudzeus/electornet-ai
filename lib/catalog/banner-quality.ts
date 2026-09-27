import "server-only";
import sharp from "sharp";
import type { Box, StudioDoc } from "./banner-doc";

/**
 * Έλεγχος πληρότητας μιας ανάλυσης: πόσο από το «μελάνι» του banner (ό,τι διαφέρει από το φόντο) καλύπτουν τα πλαίσια
 * κειμένου / φωτογραφιών / εικονιδίων. Αν το μοντέλο προσπέρασε μια φωτογραφία ή ένα μπλοκ κειμένου, η κάλυψη πέφτει —
 * τότε η αυτόματη απόδελτίωση ΔΕΝ κρύβει το banner και το στέλνει για έλεγχο από άνθρωπο.
 */
export const MIN_COVERAGE = 0.8;

export function docBoxes(doc: StudioDoc): Box[] {
  return doc.sections.flatMap((s) => [s.title?.box, s.subtitle?.box, s.footnote?.box, ...s.paragraphs.map((p) => p.box), ...s.features.flatMap((f) => [f.box, f.icon]), ...s.images.map((i) => i.box)]).filter((b): b is Box => !!b);
}

export async function coverage(bytes: Buffer, boxes: Box[]): Promise<number> {
  const W = 240;
  const { data, info } = await sharp(bytes, { limitInputPixels: 80_000_000 }).rotate().flatten({ background: "#ffffff" }).greyscale().resize({ width: W }).raw().toBuffer({ resolveWithObject: true });
  const H = info.height, px = (x: number, y: number) => data[y * W + x];
  // φόντο = διάμεσος των τεσσάρων γωνιών
  const corners = [px(1, 1), px(W - 2, 1), px(1, H - 2), px(W - 2, H - 2)].sort((a, b) => a - b);
  const bg = (corners[1] + corners[2]) / 2;
  const pad = 0.012; // λίγο περιθώριο: αντιαλίαση γραμμάτων, σκιές
  const grown = boxes.map(([x, y, w, h]) => [Math.floor((x - pad) * W), Math.floor((y - pad) * H), Math.ceil((x + w + pad) * W), Math.ceil((y + h + pad) * H)]);
  let ink = 0, covered = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (Math.abs(px(x, y) - bg) < 30) continue;
    ink++;
    if (grown.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) covered++;
  }
  return ink < W * H * 0.01 ? 1 : covered / ink;
}
