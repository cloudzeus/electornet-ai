import "server-only";
import { getProductsByIds } from "@/lib/data/repo";
import { dimsFor } from "@/lib/data/dims";
import { cutoutFor } from "@/lib/data/cutouts";
import { buildArModel } from "./build";

/** Κοινός κορμός των δύο routes: βρες το προϊόν, τις διαστάσεις του, χτίσε ή διάβασε από cache, σέρβιρε με ETag. */
export async function serveArModel(req: Request, id: string, kind: "glb" | "usdz") {
  const [p] = await getProductsByIds([id]);
  const dims = p ? dimsFor(p) : null;
  if (!p || !dims) return new Response("Δεν υπάρχουν διαστάσεις για αυτό το προϊόν.", { status: 404 });
  const m = await buildArModel({ id: p.id, title: `${p.brand} ${p.title}`, dims, image: p.image, cutout: cutoutFor(p.image) });
  const etag = `"${m.etag}-${kind}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  const body = kind === "glb" ? m.glb : m.usdz;
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": kind === "glb" ? "model/gltf-binary" : "model/vnd.usdz+zip",
      "content-length": String(body.length),
      "content-disposition": `inline; filename="${p.slug}.${kind}"`,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      etag,
      "access-control-allow-origin": "*",
    },
  });
}
