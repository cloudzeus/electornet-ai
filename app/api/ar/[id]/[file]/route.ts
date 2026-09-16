import { serveArModel } from "@/lib/ar/serve";

/**
 * @dynamic Μοντέλο AR του προϊόντος, χτισμένο από τις διαστάσεις και τη
 * φωτογραφία του: `model.glb` (Android Scene Viewer, WebXR, προεπισκόπηση) ή
 * `model.usdz` (iPhone/iPad AR Quick Look). Η κατάληξη μένει στο URL γιατί
 * το Scene Viewer και το Quick Look κρίνουν από αυτήν.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const kind = file === "model.usdz" ? "usdz" : file === "model.glb" ? "glb" : null;
  if (!kind) return new Response("Not found", { status: 404 });
  return serveArModel(req, id, kind);
}
