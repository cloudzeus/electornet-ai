import "server-only";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";
import { markupFor, billed } from "./pricing";
import { usdEurRate } from "@/lib/fx";

/**
 * One OpenRouter key for every AI feature (Άρης advisor, alt text, copy,
 * agent steps). OpenAI-compatible chat completions with usage accounting
 * (cost from OpenRouter) and a daily budget guard from Settings → AI.
 */
export interface AiConfig {
  apiKey: string;
  model: string;
  modelFast: string;
  modelVision: string;
  maxTokens: number;
  temperature: number;
  dailyBudgetUsd: number;
  siteTitle: string;
  advisorEnabled: boolean;
  /** "auto": openrouter/auto picks per prompt; "task": the configured model per task */
  routing: "auto" | "task";
  providerSort: "" | "price" | "throughput" | "latency";
  fallbackModels: string[];
}
export const AUTO = "openrouter/auto";

export async function getAi(): Promise<AiConfig | null> {
  const { data, secrets } = await getSetting("ai");
  const apiKey = secrets.openrouterApiKey ?? process.env.OPENROUTER_API_KEY ?? "";
  if (!apiKey) return null;
  const model = String(data.model || process.env.OPENROUTER_MODEL || AUTO);
  const modelFast = String(data.modelFast || "google/gemini-2.5-flash");
  return {
    apiKey,
    model,
    modelFast,
    modelVision: String(data.modelVision || modelFast),
    maxTokens: Number(data.maxTokens) || 600,
    temperature: data.temperature === "" || data.temperature === undefined ? 0.4 : Number(data.temperature),
    dailyBudgetUsd: Number(data.dailyBudgetUsd) || 0,
    siteTitle: String(data.siteTitle || "euronics.gr"),
    advisorEnabled: data.advisorEnabled !== false,
    routing: data.routing === "task" ? "task" : "auto",
    providerSort: (["price", "throughput", "latency"].includes(String(data.providerSort)) ? String(data.providerSort) : "") as AiConfig["providerSort"],
    fallbackModels: String(data.fallbackModels ?? "").split(",").map((m) => m.trim()).filter(Boolean),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

/** raw OpenRouter spend today (budget guard) */
export async function spentToday(): Promise<number> {
  const r = await db.aiUsage.aggregate({ where: { day: today() }, _sum: { costUsd: true } }).catch(() => null);
  return r?._sum.costUsd ?? 0;
}
/** billed (with markup) today in EUR — dashboard tile */
export async function billedTodayEur(): Promise<number> {
  const r = await db.aiUsage.aggregate({ where: { day: today() }, _sum: { billedEur: true } }).catch(() => null);
  return r?._sum.billedEur ?? 0;
}

/** true when a daily budget is set and already exhausted */
export async function overBudget(cfg: AiConfig): Promise<boolean> {
  if (!cfg.dailyBudgetUsd) return false;
  return (await spentToday()) >= cfg.dailyBudgetUsd;
}

export type ChatContent = string | { type: "text"; text: string }[] | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface ChatMessage { role: "system" | "user" | "assistant"; content: ChatContent }

export interface ChatResult { text: string; model: string; tokensIn: number; tokensOut: number; costUsd: number; ms: number }

export async function chat(opts: {
  feature: string;
  messages: ChatMessage[];
  model?: "main" | "fast" | "vision" | (string & {});
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  /** Reasoning budget for thinking models ("low" keeps short JSON answers from being eaten by hidden reasoning tokens). */
  reasoning?: "low" | "medium" | "high";
  override?: { apiKey: string; model: string };
}): Promise<ChatResult> {
  const cfg = opts.override ? null : await getAi();
  const apiKey = opts.override?.apiKey ?? cfg?.apiKey;
  if (!apiKey) throw new Error("OpenRouter: δεν έχει οριστεί κλειδί (Ρυθμίσεις → AI & υπηρεσίες)");
  if (cfg && (await overBudget(cfg))) throw new Error("AI: εξαντλήθηκε το ημερήσιο όριο κόστους");
  const { model, fallbacks } = resolveModel(cfg, opts.model, opts.override?.model, opts.messages);
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.AUTH_URL ?? "https://euronics.gr", "X-Title": (cfg?.siteTitle ?? "euronics.gr").replace(/[^\x20-\x7e]/g, "").trim() || "euronics.gr" },
    body: JSON.stringify({
      model,
      ...(fallbacks.length ? { models: [model, ...fallbacks] } : {}),
      ...(cfg?.providerSort ? { provider: { sort: cfg.providerSort } } : {}),
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? cfg?.maxTokens ?? 600,
      temperature: opts.temperature ?? cfg?.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.reasoning ? { reasoning: { effort: opts.reasoning } } : {}),
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  const ms = Date.now() - t0;
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string }; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; model?: string };
  if (!res.ok || j.error) {
    await db.aiUsage.create({ data: { day: today(), feature: opts.feature, model, ms, ok: false } }).catch(() => null);
    throw new Error(`OpenRouter ${res.status}: ${j.error?.message ?? res.statusText}`);
  }
  const out: ChatResult = { text: j.choices?.[0]?.message?.content ?? "", model: j.model ?? model, tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0, costUsd: j.usage?.cost ?? 0, ms };
  // pricing snapshot at call time: markup of the model actually used + FX of the day
  const [markupPct, fxRate] = await Promise.all([markupFor(out.model), usdEurRate()]);
  const billedUsd = billed(out.costUsd, markupPct);
  await db.aiUsage.create({ data: { day: today(), feature: opts.feature, model: out.model, tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd, markupPct, billedUsd, fxRate, billedEur: billedUsd * fxRate, ms } }).catch(() => null);
  return out;
}

/** Parse a JSON object out of a model reply (tolerates code fences). */
export function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

/**
 * Automatic routing: with routing="auto" every text task goes to
 * openrouter/auto (OpenRouter picks the model per prompt); the task models
 * become fallbacks. Image prompts always use the vision model first (the
 * auto router is not guaranteed to pick a multimodal model). With
 * routing="task" the configured model per task is used, then fallbacks.
 */
export function resolveModel(cfg: AiConfig | null, task: string | undefined, override: string | undefined, messages: ChatMessage[]): { model: string; fallbacks: string[] } {
  if (override) return { model: override, fallbacks: [] };
  if (!cfg) return { model: AUTO, fallbacks: [] };
  const hasImage = messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "image_url"));
  const taskModel = task === "fast" ? cfg.modelFast : task === "vision" || hasImage ? cfg.modelVision : task && task !== "main" ? task : cfg.model;
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  if (hasImage) return { model: cfg.modelVision, fallbacks: uniq([...cfg.fallbackModels, cfg.modelFast]).filter((m) => m !== cfg.modelVision) };
  if (cfg.routing === "auto") return { model: AUTO, fallbacks: uniq([taskModel, ...cfg.fallbackModels]).filter((m) => m !== AUTO) };
  return { model: taskModel, fallbacks: uniq(cfg.fallbackModels).filter((m) => m !== taskModel) };
}
