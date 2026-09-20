import "server-only";
import { db } from "@/lib/db";
import { getAi } from "@/lib/ai/openrouter";
import { getSetting } from "@/lib/settings/store";
import { markupFor, billed } from "@/lib/ai/pricing";
import { usdEurRate } from "@/lib/fx";

/**
 * Embeddings μέσω OpenRouter (`/api/v1/embeddings`). Το ευρετήριο είναι
 * `vector(1536)`, οπότε το μοντέλο πρέπει να δίνει 1536 διαστάσεις — το
 * προεπιλεγμένο `openai/text-embedding-3-small` τις δίνει, και του τις ζητάμε
 * ρητά. Κάθε κλήση γράφεται στο ledger AiUsage (λειτουργία «embed»).
 */
export const EMBED_DIMS = 1536;
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";

export async function embedModel(): Promise<string> {
  const { data } = await getSetting("ai").catch(() => ({ data: {} as Record<string, unknown> }));
  return String(data.embedModel || DEFAULT_EMBED_MODEL);
}

export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; model: string; tokens: number; costUsd: number }> {
  const ai = await getAi();
  if (!ai) throw new Error("Δεν έχει ρυθμιστεί κλειδί OpenRouter (Ρυθμίσεις → AI).");
  const model = await embedModel();
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${ai.apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://www.euronics.gr", "X-Title": "Euronics vector index" },
    body: JSON.stringify({ model, input: texts, ...(model.startsWith("openai/text-embedding-3") ? { dimensions: EMBED_DIMS } : {}) }),
    signal: AbortSignal.timeout(60000),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { embedding: number[]; index: number }[]; usage?: { prompt_tokens?: number; total_tokens?: number; cost?: number }; error?: { message?: string } };
  const ms = Date.now() - t0;
  const ok = res.ok && Array.isArray(j.data) && j.data.length === texts.length;
  const costUsd = j.usage?.cost ?? 0, tokens = j.usage?.total_tokens ?? j.usage?.prompt_tokens ?? 0;
  const [markupPct, fxRate] = await Promise.all([markupFor(model), usdEurRate().catch(() => null)]);
  const billedUsd = billed(costUsd, markupPct);
  await db.aiUsage.create({ data: { day: new Date().toISOString().slice(0, 10), feature: "embed", model, tokensIn: tokens, costUsd, markupPct, billedUsd, fxRate, billedEur: fxRate ? billedUsd * fxRate : null, ms, ok, error: ok ? undefined : `${res.status}: ${j.error?.message ?? "χωρίς διανύσματα"}`.slice(0, 300) } }).catch(() => null);
  if (!ok) throw new Error(`Embeddings ${res.status}: ${j.error?.message ?? "χωρίς διανύσματα στην απάντηση"}`);
  const vectors = [...j.data!].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors[0].length !== EMBED_DIMS) throw new Error(`Το μοντέλο ${model} δίνει ${vectors[0].length} διαστάσεις· το ευρετήριο θέλει ${EMBED_DIMS}. Διάλεξε μοντέλο 1536 διαστάσεων στις Ρυθμίσεις → AI.`);
  return { vectors, model, tokens, costUsd };
}

/** pgvector literal. */
export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
