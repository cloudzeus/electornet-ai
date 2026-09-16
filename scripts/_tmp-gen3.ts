try { process.loadEnvFile(); } catch {}
import { startGeneration, advanceGeneration } from "../lib/ar/generate";
import { arCandidates } from "../lib/ar/build";
import { products } from "../lib/data/fixtures/products";
import { db } from "../lib/db";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const p = products.find((x) => x.id === "p-inventor-ikura")!;
  const img = arCandidates(p)[0];
  console.log("image:", img);
  let g = await startGeneration(p.id, img, "test");
  console.log(new Date().toISOString().slice(11, 19), "start →", g.status, g.step ?? g.error);
  const t0 = Date.now();
  while (g && !["done", "failed"].includes(g.status) && Date.now() - t0 < 9 * 60000) {
    await sleep(8000);
    g = (await advanceGeneration(g.id))!;
    console.log(new Date().toISOString().slice(11, 19), g.status, g.step ?? "", g.progress + "%", g.error ?? "");
  }
  console.log("RESULT:", JSON.stringify({ status: g.status, full: g.fullUrl, fullBytes: g.fullBytes, light: g.lightUrl, lightBytes: g.lightBytes, creditsFull: g.creditsFull, creditsLight: g.creditsLight, render: g.renderUrl, error: g.error }));
  const ar = await db.productAr.findUnique({ where: { productId: p.id } });
  console.log("productAr:", JSON.stringify({ enabled: ar?.enabled, glb: ar?.glbUrl, light: ar?.glbLightUrl, box: ar?.modelBox, source: ar?.source }));
  const u = await db.aiUsage.findMany({ where: { feature: "3d" }, orderBy: { createdAt: "desc" }, take: 3 });
  for (const x of u) console.log("ledger:", x.model, "ok=" + x.ok, "credits=" + x.tokensIn, "$" + x.costUsd.toFixed(3), "€" + (x.billedEur ?? 0).toFixed(3), x.error ?? "");
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
