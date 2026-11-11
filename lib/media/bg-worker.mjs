// Ξεχωριστή διεργασία για την αφαίρεση φόντου (isnet-general-use σε onnxruntime-node). Την ξεκινά και τη σταματά το
// lib/media/bg-model.ts: όταν κλείσει, το λειτουργικό παίρνει πίσω ΟΛΗ τη μνήμη (το onnxruntime δεν την επιστρέφει
// πάντα όσο ζει η διεργασία). Μηνύματα IPC: { id, bytes } → { id, png } | { id, error }. Plain JS: τρέχει χωρίς build.
import os from "node:os";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const SIZE = 1024, MAX_SIDE = 4000;
const THREADS = Math.max(1, Math.min(2, os.availableParallelism() - 1));
sharp.concurrency(1);
sharp.cache(false);

const session = ort.InferenceSession.create(process.argv[2], {
  executionProviders: ["cpu"], intraOpNumThreads: THREADS, interOpNumThreads: 1, executionMode: "sequential",
  graphOptimizationLevel: "all", enableCpuMemArena: false, enableMemPattern: false,
});

async function cutout(bytes) {
  const s = await session;
  // η ανάλυση του πρωτοτύπου μένει (όριο ασφαλείας MAX_SIDE)· μόνο η μάσκα υπολογίζεται σε 1024²
  const base = await sharp(bytes).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = base.info;
  const rgb = await sharp(base.data, { raw: { width: w, height: h, channels: 3 } }).resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer();
  // όπως το rembg (DisSession): /max, −0,5 ανά κανάλι, CHW
  const n = SIZE * SIZE, input = new Float32Array(3 * n);
  let max = 1;
  for (const v of rgb) if (v > max) max = v;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) input[c * n + i] = rgb[i * 3 + c] / max - 0.5;
  const tensor = new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]);
  // μόνο η τελική μάσκα: το μοντέλο βγάζει και 11 ενδιάμεσους χάρτες (π.χ. 64×512×512)
  const out = await s.run({ [s.inputNames[0]]: tensor }, [s.outputNames[0]]);
  const pred = out[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
  const mask = Buffer.alloc(n), span = hi - lo || 1;
  for (let i = 0; i < n; i++) mask[i] = Math.round(((pred[i] - lo) / span) * 255);
  tensor.dispose();
  for (const t of Object.values(out)) t.dispose();
  // 1 κανάλι — αλλιώς το sharp δίνει 3 και η μάσκα «γλιστρά»
  const alpha = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(w, h, { fit: "fill" }).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = base.data[i * 3]; rgba[i * 4 + 1] = base.data[i * 3 + 1]; rgba[i * 4 + 2] = base.data[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i]; }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

session.then(() => process.send?.({ ready: true }), (e) => { process.send?.({ fatal: e.message }); process.exit(1); });
process.on("message", async ({ id, bytes }) => {
  try { process.send?.({ id, png: await cutout(Buffer.from(bytes)) }); }
  catch (e) { process.send?.({ id, error: e instanceof Error ? e.message : String(e) }); }
});
process.on("disconnect", () => process.exit(0));
