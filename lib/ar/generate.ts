import "server-only";
import { db } from "@/lib/db";
import { ingest } from "@/lib/media/repo";
import { inspectGlb } from "./custom";
import { readAsset } from "./serve";
import { tripoUpload, tripoImageToModel, tripoConvert, tripoTask, tripoDownload, tripoBalance, tripoConfig, TripoError } from "@/lib/tripo/client";
import { markupFor, billed } from "@/lib/ai/pricing";
import { usdEurRate } from "@/lib/fx";

/**
 * Ροή «3D από φωτογραφία»: ξεκινά ο διαχειριστής, προχωρά με πολλαπλές
 * κλήσεις `advance()` (η οθόνη ρωτά κάθε λίγα δευτερόλεπτα όσο είναι ανοιχτή)
 * και τελειώνει με δύο GLB στο CDN μας: πλήρες και ελαφρύ για αργές
 * συνδέσεις. Δεν χρειάζεται worker· αν κλείσει η οθόνη, συνεχίζει με το
 * επόμενο άνοιγμα.
 */
const FOLDER = "AR μοντέλα";

/**
 * Το Tripo δεν επιστρέφει κόστος ανά task· το μετράμε από τη διαφορά υπολοίπου
 * (credits) πριν και μετά, το μετατρέπουμε σε $ με την τιμή credit των
 * ρυθμίσεων και το γράφουμε στο ledger AiUsage με markup και ισοτιμία, όπως
 * κάθε άλλη κλήση AI — έτσι μπαίνει στην αναφορά κόστους.
 */
const balance = () => tripoBalance().then((b) => b.balance + b.frozen).catch(() => null);
async function logTripo(task: "image_to_model" | "convert_model", credits: number | null, ms: number, ok: boolean, error?: string) {
  const model = `tripo/${task}`;
  const [{ creditUsd }, markupPct, fxRate] = await Promise.all([tripoConfig(), markupFor(model), usdEurRate().catch(() => null)]);
  const costUsd = Math.max(0, credits ?? 0) * creditUsd;
  const billedUsd = billed(costUsd, markupPct);
  await db.aiUsage.create({ data: { day: new Date().toISOString().slice(0, 10), feature: "3d", model, tokensIn: Math.round(Math.max(0, credits ?? 0)), costUsd, markupPct, billedUsd, fxRate, billedEur: fxRate ? billedUsd * fxRate : null, ms, ok, error: error?.slice(0, 300) } }).catch(() => null);
}
const LIGHT = { faceLimit: 8000, textureSize: 1024, textureFormat: "JPEG" as const };

async function folderId() {
  const f = await db.mediaFolder.findFirst({ where: { name: FOLDER, parentId: null }, select: { id: true } });
  return f?.id ?? (await db.mediaFolder.create({ data: { name: FOLDER } })).id;
}

const extOf = (url: string, mime: string) => (url.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] ?? mime.split("/")[1] ?? "png").toLowerCase().replace("jpeg", "jpg");

export async function startGeneration(productId: string, imageUrl: string, staffId: string) {
  const bytes = await readAsset(imageUrl);
  if (!bytes) throw new Error("Η φωτογραφία δεν διαβάστηκε.");
  const mime = /\.png(\?|$)/i.test(imageUrl) ? "image/png" : /\.webp(\?|$)/i.test(imageUrl) ? "image/webp" : "image/jpeg";
  const ext = extOf(imageUrl, mime);
  const before = await balance();
  const gen = await db.arGeneration.create({ data: { productId, imageUrl, status: "queued", step: "Ανέβασμα φωτογραφίας στο Tripo3D", createdById: staffId, creditsBefore: before } });
  const t0 = Date.now();
  try {
    const token = await tripoUpload(bytes, `product.${ext}`, mime);
    const taskId = await tripoImageToModel(token, ext, { texture: true, pbr: true });
    return db.arGeneration.update({ where: { id: gen.id }, data: { tripoTaskId: taskId, status: "running", step: "Δημιουργία 3D μοντέλου", progress: 1 } });
  } catch (e) {
    const error = e instanceof TripoError ? e.message : (e as Error).message;
    await logTripo("image_to_model", 0, Date.now() - t0, false, error);
    return db.arGeneration.update({ where: { id: gen.id }, data: { status: "failed", error, step: null } });
  }
}

async function saveModel(url: string, productId: string, genId: string, suffix: string, staffId: string | null) {
  const bytes = await tripoDownload(url);
  if (!bytes) throw new Error("Το αρχείο του μοντέλου δεν κατέβηκε από το Tripo3D.");
  const info = inspectGlb(bytes);
  if (!info.ok) throw new Error(`Το Tripo3D επέστρεψε μη έγκυρο GLB: ${info.error}`);
  const asset = await ingest({ bytes, filename: `${productId}-${suffix}-${genId.slice(-6)}.glb`, mime: "model/gltf-binary", folderId: await folderId(), createdBy: staffId, keepFormat: true, title: `3D ${productId} (${suffix})` });
  return { asset, box: info.box, bytes: bytes.length };
}

/** Ένα βήμα μπροστά. Επιστρέφει την τρέχουσα κατάσταση. */
export async function advanceGeneration(genId: string) {
  const g = await db.arGeneration.findUnique({ where: { id: genId } });
  if (!g || g.status === "done" || g.status === "failed") return g;
  try {
    if (g.status === "running" && g.tripoTaskId) {
      const t = await tripoTask(g.tripoTaskId);
      if (t.status === "queued" || t.status === "running") return db.arGeneration.update({ where: { id: genId }, data: { progress: Math.max(g.progress, Math.min(95, t.progress ?? 0)), renderUrl: t.output?.rendered_image ?? g.renderUrl } });
      if (t.status !== "success") throw new Error(`Το Tripo3D απάντησε «${t.status}» για τη δημιουργία.`);
      const url = t.output?.pbr_model ?? t.output?.model;
      if (!url) throw new Error("Το Tripo3D δεν έδωσε αρχείο μοντέλου.");
      const full = await saveModel(url, g.productId, genId, "full", g.createdById);
      const afterFull = await balance();
      const creditsFull = g.creditsBefore != null && afterFull != null ? Math.max(0, g.creditsBefore - afterFull) : null;
      await logTripo("image_to_model", creditsFull, Date.now() - g.createdAt.getTime(), true);
      // Δένεται αμέσως με το προϊόν ώστε να παίζει το AR· η ελαφριά έκδοση ακολουθεί
      await db.productAr.upsert({ where: { productId: g.productId }, update: { glbUrl: full.asset.url, glbAssetId: full.asset.id, modelBox: full.box, source: "tripo", enabled: true, fitToDims: true, updatedById: g.createdById }, create: { productId: g.productId, glbUrl: full.asset.url, glbAssetId: full.asset.id, modelBox: full.box, source: "tripo", enabled: true, fitToDims: true, updatedById: g.createdById } });
      const lightTask = await tripoConvert(g.tripoTaskId, { format: "GLTF", ...LIGHT });
      return db.arGeneration.update({ where: { id: genId }, data: { fullUrl: full.asset.url, fullBytes: full.bytes, renderUrl: t.output?.rendered_image ?? g.renderUrl, lightTaskId: lightTask, status: "converting", step: "Ελαφριά έκδοση για αργές συνδέσεις", progress: 96, creditsFull, creditsBefore: afterFull } });
    }
    if (g.status === "converting" && g.lightTaskId) {
      const t = await tripoTask(g.lightTaskId);
      if (t.status === "queued" || t.status === "running") return g;
      if (t.status !== "success" || !t.output?.model) {
        await logTripo("convert_model", 0, Date.now() - g.updatedAt.getTime(), false, `Tripo: ${t.status}`);
        // Χωρίς ελαφριά έκδοση το AR δουλεύει με την πλήρη — δεν είναι αποτυχία της δημιουργίας
        return db.arGeneration.update({ where: { id: genId }, data: { status: "done", step: null, progress: 100, error: `Η ελαφριά έκδοση απέτυχε (${t.status}); μένει η πλήρης.` } });
      }
      const light = await saveModel(t.output.model, g.productId, genId, "light", g.createdById);
      const afterLight = await balance();
      const creditsLight = g.creditsBefore != null && afterLight != null ? Math.max(0, g.creditsBefore - afterLight) : null;
      await logTripo("convert_model", creditsLight, Date.now() - g.updatedAt.getTime(), true);
      await db.productAr.update({ where: { productId: g.productId }, data: { glbLightUrl: light.asset.url, glbLightAssetId: light.asset.id } });
      return db.arGeneration.update({ where: { id: genId }, data: { lightUrl: light.asset.url, lightBytes: light.bytes, status: "done", step: null, progress: 100, creditsLight } });
    }
    return g;
  } catch (e) {
    const error = e instanceof TripoError ? e.message : (e as Error).message;
    return db.arGeneration.update({ where: { id: genId }, data: { status: "failed", error, step: null } });
  }
}

export const activeGenerations = () => db.arGeneration.findMany({ where: { status: { in: ["queued", "running", "converting"] } }, select: { id: true } });
