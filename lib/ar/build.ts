import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
 * οι διαστάσεις αλλάζει και το μοντέλο. Cache στον δίσκο ανά «αποτύπωμα»
 * (διαστάσεις + εικόνα + έκδοση γεννήτριας).
 */
export interface ArInput { id: string; title: string; dims: Dims; /** υποψήφιες φωτογραφίες, cutouts πρώτα */ images: string[] }
export interface ArModel { glb: Buffer; usdz: Buffer; etag: string }

const VERSION = 6;
const CACHE_DIR = path.join(process.cwd(), ".cache", "ar");
const mem = new Map<string, ArModel>();

export const arKey = (i: ArInput) => createHash("sha1").update(JSON.stringify({ v: VERSION, id: i.id, w: i.dims.w, h: i.dims.h, d: i.dims.d, imgs: i.images })).digest("hex").slice(0, 20);

export async function buildArModel(input: ArInput): Promise<ArModel> {
  const key = arKey(input);
  const hit = mem.get(key);
  if (hit) return hit;
  try {
    const [glb, usdz] = await Promise.all([readFile(path.join(CACHE_DIR, `${key}.glb`)), readFile(path.join(CACHE_DIR, `${key}.usdz`))]);
    const m = { glb, usdz, etag: key };
    mem.set(key, m);
    return m;
  } catch { /* δεν υπάρχει ακόμη */ }

  const [logo, picked] = await Promise.all([logoTexture(), pickFront(input.images, input.dims.w / input.dims.h)]);
  const { prims, materials, frontAspect } = buildGeometry({ dims: input.dims, labelAspect: LABEL_ASPECT, logoAspect: logo.aspect, front: { mode: picked?.mode ?? "face", aspect: picked?.aspect ?? input.dims.w / input.dims.h } });
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
  try { await mkdir(CACHE_DIR, { recursive: true }); await Promise.all([writeFile(path.join(CACHE_DIR, `${key}.glb`), glb), writeFile(path.join(CACHE_DIR, `${key}.usdz`), usdz)]); } catch { /* read-only FS: μένει στη μνήμη */ }
  return m;
}

/** Υποψήφιες φωτογραφίες του προϊόντος: τα cutouts πρώτα, μετά οι κανονικές, χωρίς διπλά. */
export function arCandidates(p: Pick<Product, "image" | "images">): string[] {
  const all = [p.image, ...(p.images ?? [])].filter((x): x is string => !!x);
  const cuts = all.map((x) => cutoutFor(x)).filter((x): x is string => !!x);
  return [...new Set([...cuts, ...all])];
}
