import "server-only";
import { createHash } from "node:crypto";
import { storeBytes } from "@/lib/media/storage";
import { getBunny } from "@/lib/media/cdn";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildGeometry } from "./geometry";
import { pickFront, frontTexture, labelTexture, logoTexture, LABEL_ASPECT } from "./textures";
import { writeGlb } from "./glb";
import { writeUsdz } from "./usdz";
import type { Dims } from "@/lib/data/dims";
import { cutoutFor } from "@/lib/data/cutouts";
import type { Product } from "@/lib/data/types";

/**
 * Το μοντέλο AR χτίζεται όταν ζητηθεί, από τις τρέχουσες διαστάσεις και τη
 * φωτογραφία — όχι από αρχείο ανά SKU. Έτσι κάθε προϊόν με διαστάσεις
 * (EPREL, ERP, Icecat) και φωτογραφία έχει AR αυτόματα, και όταν αλλάξουν
 * οι διαστάσεις αλλάζει και το μοντέλο.
 *
 * Cache: μνήμη → Bunny CDN (φάκελος `ar/`, ή public/uploads όταν το Bunny
 * είναι κλειστό) → κατασκευή. Το αντίγραφο στο CDN επιβιώνει επανεκκινήσεις
 * και deploys και μοιράζεται ανάμεσα σε πολλά instances του server.
 */
export interface ArInput { id: string; title: string; dims: Dims; /** υποψήφιες φωτογραφίες, cutouts πρώτα */ images: string[] }
export interface ArModel { glb: Buffer; usdz: Buffer; etag: string }

const VERSION = 11;
const mem = new Map<string, ArModel>();

export const arKey = (i: ArInput) => createHash("sha1").update(JSON.stringify({ v: VERSION, id: i.id, w: i.dims.w, h: i.dims.h, d: i.dims.d, imgs: i.images })).digest("hex").slice(0, 20);

async function fromStore(key: string, kind: "glb" | "usdz"): Promise<Buffer | null> {
  try {
    const b = await getBunny();
    if (b.enabled && b.zone && b.storagePassword && b.cdnUrl) {
      const r = await fetch(`${b.cdnUrl}${b.basePath}/ar/${key}.${kind}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
      return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    }
    return await readFile(path.join(process.cwd(), "public", "uploads", "ar", `${key}.${kind}`));
  } catch { return null; }
}

export async function buildArModel(input: ArInput, opts: { labels?: boolean } = {}): Promise<ArModel> {
  const withLabels = opts.labels !== false;
  const key = `${arKey(input)}${withLabels ? "" : "-nl"}`;
  const hit = mem.get(key);
  if (hit) return hit;
  const [sg, su] = await Promise.all([fromStore(key, "glb"), fromStore(key, "usdz")]);
  if (sg && su) { const m = { glb: sg, usdz: su, etag: key }; mem.set(key, m); return m; }

  const [logo, picked] = await Promise.all([logoTexture(), pickFront(input.images, input.dims.w / input.dims.h)]);
  const { prims, materials, frontAspect } = buildGeometry({ dims: input.dims, labelAspect: LABEL_ASPECT, logoAspect: logo.aspect, front: { mode: picked?.mode ?? "face", aspect: picked?.aspect ?? input.dims.w / input.dims.h }, parts: { labels: withLabels } });
  const [front, lw, lh, ld] = await Promise.all([
    frontTexture(picked, frontAspect),
    labelTexture("Π", input.dims.w), labelTexture("Υ", input.dims.h), labelTexture("Β", input.dims.d),
  ]);
  const textures = { front, "label-w": lw, "label-h": lh, "label-d": ld, logo: logo.png };
  const glb = writeGlb(prims, materials, textures, input.title);
  const usdz = writeUsdz(prims, materials, textures, input.title);
  const m = { glb, usdz, etag: key };
  mem.set(key, m);
  if (mem.size > 200) mem.delete(mem.keys().next().value as string);
  // Αντίγραφο στο CDN, χωρίς να καθυστερεί την απάντηση
  void Promise.all([storeBytes(`ar/${key}.glb`, glb, "model/gltf-binary"), storeBytes(`ar/${key}.usdz`, usdz, "model/vnd.usdz+zip")]).catch(() => {});
  return m;
}

/** Υποψήφιες φωτογραφίες του προϊόντος: τα cutouts πρώτα, μετά οι κανονικές, χωρίς διπλά. */
export function arCandidates(p: Pick<Product, "image" | "images">): string[] {
  const all = [p.image, ...(p.images ?? [])].filter((x): x is string => !!x);
  const cuts = all.map((x) => cutoutFor(x)).filter((x): x is string => !!x);
  return [...new Set([...cuts, ...all])];
}
