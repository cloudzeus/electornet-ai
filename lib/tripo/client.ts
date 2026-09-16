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
import { getSetting } from "@/lib/settings/store";

const BASE = "https://api.tripo3d.ai/v2/openapi";
/** Κλειδί από Ρυθμίσεις → AI (tripoApiKey), αλλιώς από το .env. */
export async function tripoConfig() {
  const { data, secrets } = await getSetting("ai").catch(() => ({ data: {} as Record<string, unknown>, secrets: {} as Record<string, string> }));
  return { apiKey: secrets.tripoApiKey || process.env.TRIPO3D_API_KEY || "", creditUsd: Number(data.tripoCreditUsd) || 0.01 };
}
export const hasTripoKey = async () => (await tripoConfig()).apiKey.length > 0;

export class TripoError extends Error { constructor(message: string, public status: number, public code?: number) { super(message); this.name = "TripoError"; } }

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const { apiKey } = await tripoConfig();
  if (!apiKey) throw new TripoError("Λείπει το κλειδί Tripo3D (Ρυθμίσεις → AI ή TRIPO3D_API_KEY στο .env).", 0);
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60000), cache: "no-store" });
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

/**
 * Παράμετροι ποιότητας (τεκμηρίωση SDK, docs/API.md):
 * - model_version: η νεότερη έκδοση· η προεπιλογή του API είναι η παλιότερη v2.5
 * - texture_quality "detailed" και texture_alignment "original_image": υφή πιστή στη φωτογραφία
 * - orientation "align_image": η πρόσοψη του μοντέλου όπως στη φωτογραφία (μπροστά = +Z)
 * - auto_size: πραγματικό μέγεθος σε μέτρα, όσο το εκτιμά το μοντέλο· εμείς κλιμακώνουμε ούτως ή άλλως στο δηλωμένο ύψος
 */
export const TRIPO_MODEL_VERSION = "v3.0-20250812";
export interface ImageToModelOpts { modelVersion?: string; texture?: boolean; pbr?: boolean; faceLimit?: number; autoSize?: boolean; textureQuality?: "standard" | "detailed"; textureAlignment?: "original_image" | "geometry"; orientation?: "default" | "align_image" }
export async function tripoImageToModel(fileToken: string, ext: string, opts: ImageToModelOpts = {}): Promise<string> {
  const body: Record<string, unknown> = {
    type: "image_to_model", file: { type: ext, file_token: fileToken },
    model_version: opts.modelVersion ?? TRIPO_MODEL_VERSION,
    texture: opts.texture ?? true, pbr: opts.pbr ?? true,
    texture_quality: opts.textureQuality ?? "detailed",
    geometry_quality: "detailed",
    texture_alignment: opts.textureAlignment ?? "original_image",
    orientation: opts.orientation ?? "align_image",
    auto_size: opts.autoSize ?? true,
  };
  if (opts.faceLimit) body.face_limit = opts.faceLimit;
  const d = await call<{ task_id: string }>("/task", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return d.task_id;
}

/**
 * Πολλαπλές όψεις: [μπροστά, αριστερά, πίσω, δεξιά]· η μπροστινή υποχρεωτική,
 * οι υπόλοιπες {} όταν λείπουν. Δίνει σωστό βάθος και πίσω πλευρά, που από
 * μία φωτογραφία το μοντέλο τα «μαντεύει».
 */
export async function tripoMultiviewToModel(views: { front: { token: string; ext: string }; left?: { token: string; ext: string }; back?: { token: string; ext: string }; right?: { token: string; ext: string } }, opts: ImageToModelOpts = {}): Promise<string> {
  const f = (v?: { token: string; ext: string }) => (v ? { type: v.ext, file_token: v.token } : {});
  const body: Record<string, unknown> = {
    type: "multiview_to_model", files: [f(views.front), f(views.left), f(views.back), f(views.right)],
    model_version: opts.modelVersion ?? TRIPO_MODEL_VERSION, texture: opts.texture ?? true, pbr: opts.pbr ?? true,
    texture_quality: opts.textureQuality ?? "detailed", geometry_quality: "detailed", texture_alignment: opts.textureAlignment ?? "original_image", orientation: opts.orientation ?? "align_image", auto_size: opts.autoSize ?? true,
  };
  if (opts.faceLimit) body.face_limit = opts.faceLimit;
  const d = await call<{ task_id: string }>("/task", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return d.task_id;
}

export interface ConvertOpts { format: "GLTF" | "USDZ" | "FBX" | "OBJ"; faceLimit?: number; textureSize?: number; textureFormat?: "JPEG" | "PNG" | "WEBP"; quad?: boolean; pivotToCenterBottom?: boolean }
export async function tripoConvert(originalTaskId: string, opts: ConvertOpts): Promise<string> {
  const body: Record<string, unknown> = { type: "convert_model", original_model_task_id: originalTaskId, format: opts.format, pivot_to_center_bottom: opts.pivotToCenterBottom ?? true };
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
