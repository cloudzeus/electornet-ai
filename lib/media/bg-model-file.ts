import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Μοντέλο αφαίρεσης φόντου (isnet-general-use του rembg, ONNX, ~170 MB). Κατεβαίνει στο build
 * (`scripts/fetch-bg-model.ts`) και, αν λείπει, την πρώτη φορά που χρειαστεί. Έλεγχος sha256 πριν χρησιμοποιηθεί.
 */
export const BG_MODEL = {
  url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
  sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
  bytes: 178648008,
};

export const bgModelPath = () => process.env.BG_MODEL_PATH || path.join(process.cwd(), ".models", "isnet-general-use.onnx");

let pending: Promise<string> | null = null;
export function ensureBgModel(file = bgModelPath()): Promise<string> {
  pending ??= (async () => {
    const s = await stat(/*turbopackIgnore: true*/ file).catch(() => null);
    if (s?.size === BG_MODEL.bytes) return file;
    const res = await fetch(BG_MODEL.url, { signal: AbortSignal.timeout(10 * 60_000) });
    if (!res.ok) throw new Error(`Λήψη μοντέλου αφαίρεσης φόντου: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sum = createHash("sha256").update(buf).digest("hex");
    if (sum !== BG_MODEL.sha256) throw new Error("Το μοντέλο αφαίρεσης φόντου δεν πέρασε τον έλεγχο sha256 — δεν χρησιμοποιείται.");
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.part`;
    await writeFile(tmp, buf);
    await rename(tmp, file).catch(async (e) => { await rm(tmp, { force: true }); throw e; });
    return file;
  })().finally(() => { pending = null; });
  return pending;
}
