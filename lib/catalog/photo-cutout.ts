import "server-only";
import sharp from "sharp";
import { removeBackground } from "@/lib/media/process";
import { alphaBox, keepMain, keyOutEdgeColour } from "./photo-cutout-core";

/**
 * «Αφαίρεση φόντου» στις φωτογραφίες από το web (banner κατασκευαστή με χρωματιστό φόντο): βγάζει το φόντο, κόβει
 * γύρω από το προϊόν και το κεντράρει σε λευκό τετράγωνο — όπως το πλαίσιο του site. Ίδια ποιότητα με το πρωτότυπο:
 * το προϊόν μένει στα pixel του (καμία σμίκρυνση/μεγέθυνση), το τετράγωνο προσαρμόζεται σε αυτό, έξοδος PNG (χωρίς απώλειες).
 * Πρώτα AI (isnet μέσα στην εφαρμογή / rembg / remove.bg, Ρυθμίσεις → AI & υπηρεσίες)· αν αποτύχει, μονόχρωμο φόντο από τις άκρες.
 */
const FILL = 0.86; // το προϊόν πιάνει το 86% του τετραγώνου
const MIN_CANVAS = 600; // όριο «μικρής» φωτογραφίας (LOW_RES_PX)

export async function cutoutOnCanvas(bytes: Buffer): Promise<{ bytes: Buffer; method: "ai" | "colour" }> {
  let rgba: { data: Buffer; info: { width: number; height: number } }, method: "ai" | "colour";
  try {
    rgba = await sharp(await removeBackground(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // banner με έντονο χρώμα: το AI κρατά και τα εικονίδια πάνω στο προϊόν — σβήνονται όσα έχουν την απόχρωση του φόντου
    const key = await keyOutEdgeColour(bytes).catch(() => null);
    if (key?.saturated && key.info.width === rgba.info.width && key.info.height === rgba.info.height) {
      for (let i = 3; i < rgba.data.length; i += 4) if (!key.data[i]) rgba.data[i] = 0;
    }
    keepMain(rgba.data, rgba.info.width, rgba.info.height);
    method = "ai";
  } catch {
    rgba = await keyOutEdgeColour(bytes);
    method = "colour";
  }
  const { data, info } = rgba;
  const box = alphaBox(data, info.width, info.height);
  if (!box) throw new Error("Δεν έμεινε τίποτα μετά την αφαίρεση φόντου.");
  const size = Math.max(MIN_CANVAS, Math.ceil(Math.max(box.width, box.height) / FILL));
  const product = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).extract(box).png().toBuffer();
  const out = await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .composite([{ input: product, left: Math.round((size - box.width) / 2), top: Math.round((size - box.height) / 2) }])
    .png().toBuffer();
  return { bytes: out, method };
}


/** Η προεπισκόπηση και η αποθήκευση δουλεύουν το ίδιο αποτέλεσμα (ανά πρόταση φωτογραφίας), μία φορά. */
const cache = new Map<string, Promise<{ bytes: Buffer; method: "ai" | "colour" }>>();
export function cutoutForSuggestion(id: string, original: () => Promise<Buffer>) {
  let p = cache.get(id);
  if (!p) {
    p = original().then((b) => cutoutOnCanvas(b));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return p;
}
