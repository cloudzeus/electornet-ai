import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import type { Dims } from "@/lib/data/dims";
import { buildArModel, arInputOf } from "./build";
import { transformGlb, inspectGlb, fitScale, type Box } from "./custom";

/** Αλλάζει όταν αλλάζει ο τρόπος που μετασχηματίζουμε/συμπληρώνουμε τα μοντέλα — μπαίνει στο URL ώστε να μη μείνει παλιό στην cache του browser. */
export const AR_SERVE_VERSION = 12;
import { addFrameToGlb } from "./frame";
import { anchorOf, isSurface } from "./placement";
import { arPlan } from "./plan";
import { getArCategories } from "./categories";

/**
 * Σερβίρισμα μοντέλου AR. Αυτόματα για κάθε προϊόν με πραγματικές διαστάσεις (όχι τυπικές της κατηγορίας)·
 * όπου ο διαχειριστής έχει ρυθμίσει ρητά το προϊόν (ProductAr), ισχύει το enabled του. Με ανεβασμένο GLB σερβίρουμε αυτό
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

export function fitFactor(box: Box | null, dims: Dims | null) {
  if (!box || !dims || !box.h) return 1;
  return dims.h / box.h;
}

/**
 * Προϊόν + ρύθμιση + απόφαση, για 60″ στη μνήμη: ο πελάτης ζητά διαδοχικά προεπισκόπηση, AR και εναλλακτική επιφάνεια —
 * χωρίς αυτό κάθε αρχείο θα περίμενε δύο ερωτήματα στη βάση.
 */
type Lookup = { p: Awaited<ReturnType<typeof getProductsByIds>>[number] | undefined; ar: Awaited<ReturnType<typeof db.productAr.findUnique>>; plan: ReturnType<typeof arPlan> | null };
const looked = new Map<string, { at: number; v: Lookup }>();
async function lookup(id: string): Promise<Lookup> {
  const hit = looked.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const [[p], ar, cats] = await Promise.all([getProductsByIds([id]), db.productAr.findUnique({ where: { productId: id } }), getArCategories()]);
  const v = { p, ar, plan: p ? arPlan(p, ar, cats) : null };
  looked.set(id, { at: Date.now(), v });
  if (looked.size > 500) looked.delete(looked.keys().next().value as string);
  return v;
}

/** Η σελίδα προϊόντος έχει ήδη προϊόν και απόφαση: τα αφήνει εδώ, ώστε και το πρώτο αρχείο να μη ρωτήσει τη βάση. */
export function primeArLookup(id: string, v: Lookup) {
  looked.set(id, { at: Date.now(), v });
}

/** Μετά από αλλαγή στη διαχείριση: η επόμενη αίτηση ξαναδιαβάζει τη βάση. */
export function forgetArLookup(id?: string) {
  if (id) looked.delete(id); else looked.clear();
}

export async function serveArModel(req: Request, id: string, kind: "glb" | "usdz") {
  // Προεπιλογή η ελαφριά έκδοση όταν υπάρχει (η πλήρης του Tripo φτάνει 15 MB / 450 χιλ. τρίγωνα)· ?q=full για την πλήρη
  const wantFull = new URL(req.url).searchParams.get("q") === "full";
  // labels=0: χωρίς ψημένες ετικέτες — η προεπισκόπηση δείχνει ζωντανές HTML ετικέτες που κοιτούν πάντα τον χρήστη
  const labels = new URL(req.url).searchParams.get("labels") !== "0";
  const { p, ar, plan } = await lookup(id);
  if (!p || !plan?.on) return new Response("Το AR δεν είναι ενεργό για αυτό το προϊόν.", { status: 404, headers: { "cache-control": "no-store" } });
  const dims = plan.dims;
  const respond = (body: Buffer, etag: string) => {
    const tag = `"${etag}-${kind}"`;
    if (req.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers: { etag: tag } });
    return new Response(new Uint8Array(body), { headers: { "content-type": kind === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip", "content-length": String(body.length), "content-disposition": `inline; filename="${p.slug}.${kind}"`, "cache-control": "public, max-age=86400, stale-while-revalidate=604800", etag: tag, "access-control-allow-origin": "*" } });
  };

  // Δικό μας μοντέλο
  // Ελαφριά έκδοση για αργές συνδέσεις, όταν υπάρχει και τη ζητά ο browser
  const url = !ar ? null : kind === "glb" ? (!wantFull && ar.glbLightUrl ? ar.glbLightUrl : ar.glbUrl) : ar.usdzUrl;
  if (ar && url) {
    const box = (ar.modelBox as Box | null) ?? null;
    const key = `${url}|${ar.fitToDims ? ar.fitMode : "none"}|${dims ? `${dims.w}x${dims.h}x${dims.d}` : 0}|${ar.rotationY}|${AR_SERVE_VERSION}|${labels ? 1 : 0}`;
    let body = custom.get(key);
    if (!body) {
      const raw = await readAsset(url);
      if (!raw) return new Response("Το αρχείο του μοντέλου δεν βρέθηκε.", { status: 404 });
      // Τα όρια μετριούνται στο αρχείο που σερβίρεται: η ελαφριά έκδοση έχει άλλο pivot από την πλήρη
      const info = kind === "glb" ? inspectGlb(raw) : null;
      const own = info?.ok ? info.box : box;
      const mode = !ar.fitToDims ? "none" : ar.fitMode === "height" ? "height" : "box";
      const f = kind === "glb" ? fitScale(own, dims, ar.rotationY, mode) : 1;
      body = kind === "glb" ? transformGlb(raw, { scale: f, rotationY: ar.rotationY, bounds: own?.min && own.max ? { min: own.min, max: own.max } : null }) : raw;
      // Το πλαίσιο διαστάσεων γύρω από το μοντέλο, όπως στη γεννήτρια
      if (kind === "glb" && dims) body = await addFrameToGlb(body, dims, labels);
      custom.set(key, body);
      if (custom.size > 100) custom.delete(custom.keys().next().value as string);
    }
    return respond(body, `c${ar.updatedAt.getTime().toString(36)}-${AR_SERVE_VERSION}${labels ? "" : "-nl"}`);
  }
  if (kind === "usdz" && ar?.glbUrl) return new Response("Χωρίς USDZ: το model-viewer μετατρέπει το GLB στη συσκευή.", { status: 404 });

  // Γεννήτρια από διαστάσεις + φωτογραφία
  if (!dims) return new Response("Δεν υπάρχουν διαστάσεις για αυτό το προϊόν.", { status: 404 });
  // ?p=floor: ο πελάτης ζήτησε ρητά πάτωμα επειδή το τηλέφωνό του δεν αναγνώρισε τον τοίχο
  // ?p=…: ο πελάτης διάλεξε άλλη επιφάνεια (π.χ. τηλεόραση στον τοίχο, ή πάτωμα επειδή το κινητό δεν έπιασε τον τοίχο)
  const forced = new URL(req.url).searchParams.get("p");
  const wall = anchorOf(isSurface(forced) ? forced : plan.surface) === "wall";
  // τηλεόραση: η επιφάνεια αλλάζει και το ίδιο το μοντέλο (με/χωρίς βάση) — άρα και στο GLB, όχι μόνο στο USDZ
  const m = await buildArModel(arInputOf(p, plan, ar?.frontImage ?? null), { labels: kind === "usdz" ? true : labels, wall: (kind === "usdz" || plan.archetype === "tv") && wall });
  return respond(kind === "glb" ? m.glb : m.usdz, m.etag);
}
