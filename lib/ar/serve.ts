import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { dimsFor, type Dims } from "@/lib/data/dims";
import { buildArModel, arCandidates } from "./build";
import { scaleGlb } from "./custom";

/**
 * Σερβίρισμα μοντέλου AR. Το AR είναι κατ' επιλογή: χωρίς εγγραφή
 * ProductAr με enabled=true, 404. Με ανεβασμένο GLB σερβίρουμε αυτό
 * (κλιμακωμένο στο δηλωμένο ύψος αν ζητήθηκε), αλλιώς τον όγκο που χτίζει
 * η γεννήτρια από διαστάσεις και φωτογραφία.
 */
const custom = new Map<string, Buffer>();

export async function readAsset(url: string): Promise<Buffer | null> {
  try {
    if (/^https?:\/\//.test(url)) { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; }
    return await readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  } catch { return null; }
}

export function fitFactor(box: { w: number; h: number; d: number } | null, dims: Dims | null) {
  if (!box || !dims || !box.h) return 1;
  return dims.h / box.h;
}

export async function serveArModel(req: Request, id: string, kind: "glb" | "usdz") {
  const wantLight = new URL(req.url).searchParams.get("q") === "light";
  const [[p], ar] = await Promise.all([getProductsByIds([id]), db.productAr.findUnique({ where: { productId: id } })]);
  if (!p || !ar?.enabled) return new Response("Το AR δεν είναι ενεργό για αυτό το προϊόν.", { status: 404 });
  const dims = dimsFor(p);
  const respond = (body: Buffer, etag: string) => {
    const tag = `"${etag}-${kind}"`;
    if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers: { etag: tag } });
    return new Response(new Uint8Array(body), { headers: { "content-type": kind === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip", "content-length": String(body.length), "content-disposition": `inline; filename="${p.slug}.${kind}"`, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", etag: tag, "access-control-allow-origin": "*" } });
  };

  // Δικό μας μοντέλο
  // Ελαφριά έκδοση για αργές συνδέσεις, όταν υπάρχει και τη ζητά ο browser
  const url = kind === "glb" ? (wantLight && ar.glbLightUrl ? ar.glbLightUrl : ar.glbUrl) : ar.usdzUrl;
  if (url) {
    const box = (ar.modelBox as { w: number; h: number; d: number } | null) ?? null;
    const factor = kind === "glb" && ar.fitToDims ? fitFactor(box, dims) : 1;
    const key = `${url}|${factor.toFixed(4)}`;
    let body = custom.get(key);
    if (!body) {
      const raw = await readAsset(url);
      if (!raw) return new Response("Το αρχείο του μοντέλου δεν βρέθηκε.", { status: 404 });
      body = kind === "glb" ? scaleGlb(raw, factor) : raw;
      custom.set(key, body);
      if (custom.size > 100) custom.delete(custom.keys().next().value as string);
    }
    return respond(body, `c${ar.updatedAt.getTime().toString(36)}`);
  }
  if (kind === "usdz" && ar.glbUrl) return new Response("Χωρίς USDZ: το model-viewer μετατρέπει το GLB στη συσκευή.", { status: 404 });

  // Γεννήτρια από διαστάσεις + φωτογραφία
  if (!dims) return new Response("Δεν υπάρχουν διαστάσεις για αυτό το προϊόν.", { status: 404 });
  const m = await buildArModel({ id: p.id, title: `${p.brand} ${p.title}`, dims, images: arCandidates(p) });
  return respond(kind === "glb" ? m.glb : m.usdz, m.etag);
}
