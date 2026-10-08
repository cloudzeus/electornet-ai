import "server-only";
import { createHash } from "node:crypto";
import { storeBytes } from "@/lib/media/storage";
import { getBunny } from "@/lib/media/cdn";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildGeometry, buildTvGeometry } from "./geometry";
import type { ArPlan, TvSpec } from "./plan";
import { pickFront, frontTexture, labelTexture, logoTexture, bodyColorOf, toLinear, screenTexture, LABEL_ASPECT } from "./textures";
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
export interface ArInput { id: string; title: string; dims: Dims; /** υποψήφιες φωτογραφίες, cutouts πρώτα */ images: string[]; /** επιλογή διαχειριστή: αυτή γεμίζει την πρόσοψη */ frontImage?: string | null; /** ειδική μορφή (βλ. placement profiles) */ archetype?: "tv"; /** τηλεόραση: πάνελ και βάση (βλ. arPlan) */ tv?: TvSpec }
export interface ArModel { glb: Buffer; usdz: Buffer; etag: string }

const VERSION = 21; // 21: πάντα συμπαγές στερεό (η φωτογραφία υπό γωνία μπαίνει ολόκληρη στην πρόσοψη) · 17: ρεαλιστικό σώμα · 18: τηλεόραση ως πάνελ με/χωρίς βάση, προφίλ τοποθέτησης · 19: πραγματική βάση TV, USDZ κατά ARKit · 20: ένα mesh στον τοίχο, ετικέτες στο μέγεθος της έδρας
const mem = new Map<string, ArModel>();

export const arKey = (i: ArInput) => createHash("sha1").update(JSON.stringify({ v: VERSION, id: i.id, w: i.dims.w, h: i.dims.h, d: i.dims.d, imgs: i.images, front: i.frontImage ?? null, a: i.archetype ?? null, tv: i.tv ?? null })).digest("hex").slice(0, 20);

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

/** Αντίγραφο στο CDN χωρίς να καθυστερεί την απάντηση (AR_NO_STORE=1: δοκιμές χωρίς εγγραφή στο κοινό CDN) */
function persist(key: string, glb: Buffer, usdz: Buffer) {
  if (process.env.AR_NO_STORE === "1") return;
  void Promise.all([storeBytes(`ar/${key}.glb`, glb, "model/gltf-binary"), storeBytes(`ar/${key}.usdz`, usdz, "model/vnd.usdz+zip")]).catch(() => {});
}

export async function buildArModel(input: ArInput, opts: { labels?: boolean; wall?: boolean } = {}): Promise<ArModel> {
  const withLabels = opts.labels !== false;
  const key = `${arKey(input)}${withLabels ? "" : "-nl"}${opts.wall ? "-wall" : ""}`;
  // Τηλεόραση: πάνελ με βάση (έπιπλο) ή χωρίς (τοίχος) — όχι φωτογραφία
  if (input.archetype === "tv" && input.tv) {
    const hitTv = mem.get(key);
    if (hitTv) return hitTv;
    const [tg, tu] = await Promise.all([fromStore(key, "glb"), fromStore(key, "usdz")]);
    if (tg && tu) { const m = { glb: tg, usdz: tu, etag: key }; mem.set(key, m); return m; }
    const tv = { w: input.dims.w, ...input.tv };
    const { prims, materials } = buildTvGeometry({ tv, stand: !opts.wall, labelAspect: LABEL_ASPECT, labels: withLabels });
    // ετικέτες: στο έπιπλο το συνολικό ύψος και το βάθος της βάσης· στον τοίχο μόνο το πάνελ
    const lh = opts.wall ? tv.panelH : input.dims.h, ld = opts.wall ? tv.panelD : input.dims.d;
    const [screen, lw, lhT, ldT] = await Promise.all([screenTexture(input.dims.w / tv.panelH), labelTexture("Π", input.dims.w), labelTexture("Υ", lh), labelTexture("Β", ld)]);
    const textures = { screen, "label-w": lw, "label-h": lhT, "label-d": ldT };
    const glb = writeGlb(prims, materials, textures, input.title);
    const usdz = writeUsdz(prims, materials, textures, input.title, { wall: opts.wall ? { h: tv.panelH / 100, d: Math.min(0.1, Math.max(0.008, tv.panelD / 100)) } : null });
    const m = { glb, usdz, etag: key };
    mem.set(key, m);
    if (mem.size > 200) mem.delete(mem.keys().next().value as string);
    persist(key, glb, usdz);
    return m;
  }
  const hit = mem.get(key);
  if (hit) return hit;
  const [sg, su] = await Promise.all([fromStore(key, "glb"), fromStore(key, "usdz")]);
  if (sg && su) { const m = { glb: sg, usdz: su, etag: key }; mem.set(key, m); return m; }

  const [logo, picked] = await Promise.all([logoTexture(), pickFront(input.frontImage ? [input.frontImage] : input.images, input.dims.w / input.dims.h, !!input.frontImage, input.dims.h < 0.35 * Math.min(input.dims.w, input.dims.d) ? input.dims.w / input.dims.d : undefined)]);
  // Πάντα συμπαγές στερεό στις διαστάσεις, στο χρώμα του προϊόντος. Η πρόσοψη: η φωτογραφία που διάλεξε ο διαχειριστής
  // (γεμίζει την έδρα) ή η καλύτερη μετωπική· αν υπάρχει μόνο φωτογραφία υπό γωνία, μπαίνει ολόκληρη, χωρίς παραμόρφωση,
  // στο κέντρο της πρόσοψης. (Ο παλιός διαφανής όγκος με τις διάστικτες ακμές έβγαζε 30× βαρύτερο USDZ: 3″ φόρτωση στο iPhone.)
  const solid = true;
  const angled = picked?.mode === "billboard";
  const body = picked ? await bodyColorOf(picked) : ([236, 236, 236] as [number, number, number]);
  const { prims, materials, frontAspect } = buildGeometry({ dims: input.dims, labelAspect: LABEL_ASPECT, logoAspect: logo.aspect, front: { mode: angled ? "face" : picked?.mode ?? "face", aspect: angled ? input.dims.w / input.dims.h : picked?.aspect ?? input.dims.w / input.dims.h }, parts: { labels: withLabels }, style: solid ? "solid" : "volume", bodyColor: body ? toLinear(body) : undefined });
  const [front, lw, lh, ld] = await Promise.all([
    frontTexture(picked, frontAspect, body, angled ? "contain" : "fill"),
    labelTexture("Π", input.dims.w), labelTexture("Υ", input.dims.h), labelTexture("Β", input.dims.d),
  ]);
  const textures = { front, "label-w": lw, "label-h": lh, "label-d": ld, logo: logo.png };
  const glb = writeGlb(prims, materials, textures, input.title);
  const usdz = writeUsdz(prims, materials, textures, input.title, { wall: opts.wall ? { h: input.dims.h / 100, d: input.dims.d / 100 } : null });
  const m = { glb, usdz, etag: key };
  mem.set(key, m);
  if (mem.size > 200) mem.delete(mem.keys().next().value as string);
  persist(key, glb, usdz);
  return m;
}

/** Υποψήφιες φωτογραφίες του προϊόντος: τα cutouts πρώτα, μετά οι κανονικές, χωρίς διπλά. */
export function arCandidates(p: Pick<Product, "image" | "images">): string[] {
  const all = [p.image, ...(p.images ?? [])].filter((x): x is string => !!x);
  const cuts = all.map((x) => cutoutFor(x)).filter((x): x is string => !!x);
  return [...new Set([...cuts, ...all])];
}

/** Η είσοδος της γεννήτριας από την απόφαση `arPlan` — ίδια στη σελίδα προϊόντος και στον server, ώστε να ταιριάζει το κλειδί. */
export function arInputOf(p: Pick<Product, "id" | "brand" | "title" | "image" | "images">, plan: ArPlan, frontImage: string | null): ArInput {
  return { id: p.id, title: `${p.brand} ${p.title}`, dims: plan.dims!, images: arCandidates(p), frontImage, archetype: plan.custom ? undefined : plan.archetype, tv: plan.custom ? undefined : plan.tv };
}
