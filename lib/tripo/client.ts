import "server-only";

/**
 * Tripo3D — δημιουργία 3D μοντέλου από φωτογραφία.
 *
 * Βάση `https://api.tripo3d.ai/v2/openapi`, κλειδί `Authorization: Bearer`
 * (TRIPO3D_API_KEY). Ροή, επιβεβαιωμένη με πραγματικές κλήσεις:
 *  1. POST /upload (multipart `file`)            → data.image_token
 *  2. POST /task { type: "image_to_model", file: { type, file_token }, … } → data.task_id
 *  3. GET  /task/{id}                            → status queued|running|success|failed…, progress, output.{model,pbr_model,rendered_image}
 *  4. POST /task { type: "convert_model", original_model_task_id, format, face_limit, texture_size, texture_format } → ελαφριά έκδοση / USDZ
 * Κάθε task κοστίζει credits· χωρίς υπόλοιπο απαντά 403 code 2010.
 */
const BASE = "https://api.tripo3d.ai/v2/openapi";
const key = () => process.env.TRIPO3D_API_KEY ?? "";
export const hasTripoKey = () => key().length > 0;

export class TripoError extends Error { constructor(message: string, public status: number, public code?: number) { super(message); this.name = "TripoError"; } }

async function call<T>(path: string, init: RequestInit): Promise<T> {
  if (!hasTripoKey()) throw new TripoError("Λείπει το TRIPO3D_API_KEY στο .env.", 0);
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${key()}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60000), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string; suggestion?: string; data?: T };
  if (!r.ok || j.code !== 0) {
    const friendly = j.code === 2010 ? "Δεν υπάρχουν credits στον λογαριασμό Tripo3D — αγόρασε credits στο platform.tripo3d.ai." : j.message ?? `Tripo HTTP ${r.status}`;
    throw new TripoError(friendly, r.status, j.code);
  }
  return j.data as T;
}

export const tripoBalance = () => call<{ balance: number; frozen: number }>("/user/balance", { method: "GET" });

export async function tripoUpload(bytes: Buffer, filename: string, mime: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const d = await call<{ image_token: string }>("/upload", { method: "POST", body: fd });
  return d.image_token;
}

export interface ImageToModelOpts { modelVersion?: string; texture?: boolean; pbr?: boolean; faceLimit?: number; autoSize?: boolean }
export async function tripoImageToModel(fileToken: string, ext: string, opts: ImageToModelOpts = {}): Promise<string> {
  const body: Record<string, unknown> = { type: "image_to_model", file: { type: ext, file_token: fileToken }, texture: opts.texture ?? true, pbr: opts.pbr ?? true };
  if (opts.modelVersion) body.model_version = opts.modelVersion;
  if (opts.faceLimit) body.face_limit = opts.faceLimit;
  if (opts.autoSize != null) body.auto_size = opts.autoSize;
  const d = await call<{ task_id: string }>("/task", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return d.task_id;
}

export interface ConvertOpts { format: "GLTF" | "USDZ" | "FBX" | "OBJ"; faceLimit?: number; textureSize?: number; textureFormat?: "JPEG" | "PNG" | "WEBP"; quad?: boolean }
export async function tripoConvert(originalTaskId: string, opts: ConvertOpts): Promise<string> {
  const body: Record<string, unknown> = { type: "convert_model", original_model_task_id: originalTaskId, format: opts.format };
  if (opts.faceLimit) body.face_limit = opts.faceLimit;
  if (opts.textureSize) body.texture_size = opts.textureSize;
  if (opts.textureFormat) body.texture_format = opts.textureFormat;
  if (opts.quad != null) body.quad = opts.quad;
  const d = await call<{ task_id: string }>("/task", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return d.task_id;
}

export interface TripoTask { task_id: string; type: string; status: "queued" | "running" | "success" | "failed" | "cancelled" | "unknown" | "banned" | "expired"; progress?: number; output?: { model?: string; pbr_model?: string; base_model?: string; rendered_image?: string } }
export const tripoTask = (id: string) => call<TripoTask>(`/task/${encodeURIComponent(id)}`, { method: "GET" });

/** Τα αρχεία του Tripo είναι προσωρινοί σύνδεσμοι — τα κατεβάζουμε αμέσως. */
export async function tripoDownload(url: string): Promise<Buffer | null> {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}
