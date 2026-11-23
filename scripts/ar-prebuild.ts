/**
 * Χτίζει από πριν τα στερεά AR («Δες το στον χώρο σου») για ΟΛΑ τα προϊόντα που παίρνουν AR και τα ανεβάζει στο CDN,
 * ώστε ο πρώτος πελάτης να μην περιμένει την κατασκευή. Ελέγχει και τι φωτογραφία μπήκε στην πρόσοψη κάθε στερεού.
 *
 *   npm run ar:build                 όλα (ό,τι υπάρχει ήδη στο CDN το προσπερνά)
 *   npm run ar:build -- --dry        μόνο μέτρηση, χωρίς κατασκευή
 *   npm run ar:build -- --limit 20   τα πρώτα 20
 *
 * Γράφει στο docs/ar-sterea/ τη λίστα όσων δεν έχουν φωτογραφία κατά μέτωπο (θέλουν «Όψη AR» από τη διαχείριση).
 */
process.env.AR_NO_STORE = "1"; // ανεβάζουμε εμείς και περιμένουμε· το persist της γεννήτριας δεν περιμένει και κρύβει τα λάθη
import { mkdirSync, writeFileSync } from "node:fs";
import { db } from "../lib/db";
import { getProductsByIds } from "../lib/data/repo";
import { getBunny } from "../lib/media/cdn";
import { storeBytes } from "../lib/media/storage";
import { getArCategories } from "../lib/ar/categories";
import { arPlan, arVariants } from "../lib/ar/plan";
import { arInputOf, arKey, buildArModel } from "../lib/ar/build";
import { pickFront } from "../lib/ar/textures";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? null : process.argv[i + 1] ?? ""; };
const DRY = arg("dry") !== null, LIMIT = Number(arg("limit")) || Infinity, PAR = 4;
const FRONT = { face: "κατά μέτωπο", top: "από πάνω (επίπεδη συσκευή)", billboard: "υπό γωνία", none: "καμία φωτογραφία δεν φορτώθηκε", tv: "τηλεόραση (οθόνη, χωρίς φωτογραφία)" } as const;

(async () => {
  const b = await getBunny();
  if (!DRY && !(b.enabled && b.zone && b.storagePassword && b.cdnUrl)) throw new Error("Το Bunny CDN είναι κλειστό εδώ: τα στερεά θα έμεναν στον δίσκο αυτού του υπολογιστή.");
  const exists = async (key: string) => (await Promise.all(["glb", "usdz"].map((k) => fetch(`${b.cdnUrl}${b.basePath}/ar/${key}.${k}`, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false)))).every(Boolean);

  const [rows, ars, cats] = await Promise.all([db.product.findMany({ where: { active: true }, select: { id: true } }), db.productAr.findMany(), getArCategories()]);
  const arBy = new Map(ars.map((a) => [a.productId, a]));
  const off: Record<string, number> = {}, front: Record<string, number> = {};
  const todo: { p: Awaited<ReturnType<typeof getProductsByIds>>[number]; plan: ReturnType<typeof arPlan> }[] = [];
  let custom = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    for (const p of await getProductsByIds(rows.slice(i, i + 1000).map((r) => r.id))) {
      const plan = arPlan(p, arBy.get(p.id) ?? null, cats);
      if (!plan.on) off[plan.code ?? "?"] = (off[plan.code ?? "?"] ?? 0) + 1;
      else if (plan.custom) custom++; // δικό μας μοντέλο GLB: δεν χτίζεται στερεό
      else todo.push({ p, plan });
    }
  }
  console.log(`Ενεργά προϊόντα ${rows.length} · παίρνουν στερεό ${todo.length} · με δικό μας μοντέλο ${custom} · χωρίς AR ${JSON.stringify(off)}`);
  if (DRY) process.exit(0);

  const list = todo.slice(0, LIMIT), noFront: string[] = [], errors: string[] = [];
  let built = 0, had = 0, done = 0, bytes = 0;
  const t0 = Date.now();
  const one = async ({ p, plan }: (typeof todo)[number]) => {
    const input = arInputOf(p, plan, arBy.get(p.id)?.frontImage ?? null);
    try {
      // ίδια ορίσματα με το buildArModel: ποια φωτογραφία θα μπει στην πρόσοψη και πώς
      const { w, h, d } = input.dims;
      const mode = input.archetype === "tv" ? "tv" : (await pickFront(input.frontImage ? [input.frontImage] : input.images, w / h, !!input.frontImage, h < 0.35 * Math.min(w, d) ? w / d : undefined))?.mode ?? "none";
      front[mode] = (front[mode] ?? 0) + 1;
      if (mode === "billboard" || mode === "none") noFront.push([p.id, p.slug, p.brand, `"${p.title.replace(/"/g, "'")}"`, FRONT[mode], input.images.length].join(";"));
      for (const v of arVariants(plan)) {
        const key = `${arKey(input)}${v.labels ? "" : "-nl"}${v.wall ? "-wall" : ""}`;
        if (await exists(key)) { had++; continue; }
        const m = await buildArModel(input, v);
        if (m.etag !== key) throw new Error(`κλειδί ${m.etag} ≠ ${key}`); // αν αλλάξει ο τύπος του κλειδιού στη γεννήτρια, σταματάμε
        await Promise.all([storeBytes(`ar/${key}.glb`, m.glb, "model/gltf-binary"), storeBytes(`ar/${key}.usdz`, m.usdz, "model/vnd.usdz+zip")]);
        built++; bytes += m.glb.length + m.usdz.length;
      }
    } catch (e) { errors.push(`${p.id};${p.slug};${(e as Error).message}`); }
    if (++done % 50 === 0) console.log(`${done}/${list.length} · νέα αρχεία ${built} · υπήρχαν ${had} · λάθη ${errors.length} · ${Math.round((Date.now() - t0) / 60000)}′`);
  };
  let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < list.length) await one(list[next++]); }));

  mkdirSync("docs/ar-sterea", { recursive: true });
  writeFileSync("docs/ar-sterea/xoris-metopiki-fotografia.csv", "﻿id;slug;μάρκα;τίτλος;πρόσοψη;φωτογραφίες\n" + noFront.sort().join("\n") + "\n");
  writeFileSync("docs/ar-sterea/lathi.csv", "﻿id;slug;λάθος\n" + errors.join("\n") + "\n");
  console.log(`ΤΕΛΟΣ ${JSON.stringify({ products: list.length, built, had, mb: Math.round(bytes / 1e6), errors: errors.length, front: Object.fromEntries(Object.entries(front).map(([k, n]) => [FRONT[k as keyof typeof FRONT], n])), minutes: Math.round((Date.now() - t0) / 60000) })}`);
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
