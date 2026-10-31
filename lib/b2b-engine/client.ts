import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { BatchLog, EngineEvent, FieldMap, TestResult } from "./contracts";

/**
 * Client της μηχανής διαθεσιμότητας (b2b.dgsmart.gr). Υπογραφή HMAC όπως στο `lib/auth/hmac.ts` της μηχανής:
 * base64url(HMAC-SHA256(secret, `${ts}\n${nonce}\n${METHOD}\n${path+query}\n${sha256hex(body)}`)).
 * Env: `B2B_ENGINE_URL` (χωρίς / στο τέλος), `B2B_ENGINE_SECRET` (= INTERNAL_HMAC_SECRET της μηχανής, ≥ 32).
 * Όλες οι κλήσεις επιστρέφουν `{ ok, … }` — ποτέ δεν πετούν, ώστε η πύλη να δείχνει μήνυμα αντί για σφάλμα.
 */
export type EngineResult<T> = { ok: true; data: T; ms: number } | { ok: false; status: number; error: string; ms: number };

export const engineConfigured = () => !!process.env.B2B_ENGINE_URL && (process.env.B2B_ENGINE_SECRET ?? "").length >= 32;

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function signHeaders(secret: string, method: string, pathWithQuery: string, body: string, now = Date.now()) {
  const ts = String(now);
  const nonce = randomBytes(16).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${ts}\n${nonce}\n${method.toUpperCase()}\n${pathWithQuery}\n${sha256hex(body)}`).digest("base64url");
  return { "x-b2b-timestamp": ts, "x-b2b-nonce": nonce, "x-b2b-signature": sig };
}

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<EngineResult<T>> {
  const t0 = Date.now();
  if (!engineConfigured()) return { ok: false, status: 503, error: "Η μηχανή διαθεσιμότητας δεν έχει ρυθμιστεί (B2B_ENGINE_URL / B2B_ENGINE_SECRET)", ms: 0 };
  const raw = body === undefined ? "" : JSON.stringify(body);
  const full = `/api/internal/v1${path}`;
  try {
    const res = await fetch(process.env.B2B_ENGINE_URL!.replace(/\/$/, "") + full, {
      method,
      headers: { ...(raw ? { "content-type": "application/json" } : {}), ...signHeaders(process.env.B2B_ENGINE_SECRET!, method, full, raw) },
      body: raw || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    const ms = Date.now() - t0;
    if (!res.ok || !j) return { ok: false, status: res.status, error: j?.error?.message ?? `Η μηχανή απάντησε HTTP ${res.status}`, ms };
    return { ok: true, data: j as T, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, status: 0, error: timeout ? "Η μηχανή δεν απάντησε εγκαίρως" : "Δεν υπάρχει επικοινωνία με τη μηχανή", ms };
  }
}

export type ConnectorInfo = { type: string; label: string; autoTest: boolean; available: boolean; config: unknown; secrets: unknown };
export type UploadPreview = { dryRun: true; format: string; columns: string[]; preview: Record<string, string>[]; suggested: FieldMap; map: FieldMap; sample: TestResult["sample"]; locations: string[]; lines: number; accepted: number; rejected: number };
export type UploadDone = { batchId: string; format: string; columns: string[]; map: FieldMap; lines: number; accepted: number; rejected: number };
export type TestHistory = { connection: { status: string; lastTestAt: string | null; lastOkAt: string | null; secretKeys: string[] }; tests: (Omit<TestResult, "testId" | "connectionId"> & { id: string; requestedBy: string | null })[] };
export type BatchPage = { batches: BatchLog[]; days: { day: string; batches: number; accepted: number; rejected: number; failed: number }[]; next: string | null };

const enc = encodeURIComponent;
export const engine = {
  connectors: () => call<{ connectors: ConnectorInfo[] }>("GET", "/connectors"),
  events: (events: EngineEvent[]) => call<{ applied: number; skipped: number }>("POST", "/events", { events }),
  putSecrets: (id: string, secrets: Record<string, string>) => call<{ secretKeys: string[] }>("PUT", `/connections/${enc(id)}/secrets`, { secrets }),
  test: (id: string, by: string) => call<TestResult>("POST", `/connections/${enc(id)}/test?by=${enc(by)}`, {}, 100_000),
  tests: (id: string, limit = 10) => call<TestHistory>("GET", `/connections/${enc(id)}/tests?limit=${limit}`),
  getLocations: (id: string) => call<{ map: { externalRef: string; storeId: string | null }[] }>("GET", `/connections/${enc(id)}/locations`),
  putLocations: (id: string, map: { externalRef: string; storeId: string | null }[]) => call<{ mapped: number; ignored: number }>("PUT", `/connections/${enc(id)}/locations`, { map }),
  upload: <D extends boolean>(id: string, body: { filename: string; mode: "full" | "delta"; contentBase64: string; map?: FieldMap; dryRun: D }) =>
    call<D extends true ? UploadPreview : UploadDone>("POST", `/connections/${enc(id)}/upload`, body, 60_000),
  batches: (id: string, limit = 50, before?: string) => call<BatchPage>("GET", `/connections/${enc(id)}/batches?limit=${limit}${before ? `&before=${enc(before)}` : ""}`),
};
