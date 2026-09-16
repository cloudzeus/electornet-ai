try { process.loadEnvFile(); } catch {}
import { startGeneration, advanceGeneration } from "../lib/ar/generate";
import { db } from "../lib/db";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  let g = await startGeneration("r-145807", "/img/products/r-145807-0.jpg", "test", { left: "/img/products/r-145807-3.jpg", right: "/img/products/r-145807-2.jpg" });
  console.log(new Date().toISOString().slice(11, 19), "start →", g.status, g.step ?? g.error);
  const t0 = Date.now();
  while (g && !["done", "failed"].includes(g.status) && Date.now() - t0 < 12 * 60000) { await sleep(10000); g = (await advanceGeneration(g.id))!; console.log(new Date().toISOString().slice(11, 19), g.status, g.step ?? "", g.progress + "%", g.error ?? ""); }
  console.log("RESULT:", JSON.stringify({ status: g.status, fullBytes: g.fullBytes, lightBytes: g.lightBytes, creditsFull: g.creditsFull, creditsLight: g.creditsLight, error: g.error }));
  const ar = await db.productAr.findUnique({ where: { productId: "r-145807" } });
  console.log("productAr:", JSON.stringify({ box: ar?.modelBox, rotationY: ar?.rotationY, fitMode: ar?.fitMode, light: !!ar?.glbLightUrl }));
  if (g.renderUrl) { const r = await fetch(g.renderUrl); require("fs").writeFileSync("/private/tmp/claude-501/-Users-kozyris-EURONICS-euronics-redesign/179b7f70-a7cd-4836-8a83-2e0fc587bddc/scratchpad/hisense-mv-render.webp", Buffer.from(await r.arrayBuffer())); }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
