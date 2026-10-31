import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage } from "./openrouter";
import { CLAUDE_DEFAULT } from "./anthropic-models";

/**
 * Claude API (Anthropic) ως πάροχος για το κοινό `chat()` — Ρυθμίσεις → AI → «Πάροχος AI». Επίσημο SDK, ίδια
 * σύμβαση με το OpenRouter (μηνύματα με system/user/assistant, εικόνες ως image_url), ώστε καμία λειτουργία να μη
 * χρειάζεται αλλαγή. Το κόστος υπολογίζεται εδώ από τα tokens (το Anthropic δεν το επιστρέφει).
 */

/** $ ανά 1M tokens: είσοδος, έξοδος, ανάγνωση cache (τιμές Anthropic) */
const PRICE: Record<string, [number, number, number]> = {
  "claude-fable-5-1": [10, 50, 0.25], "claude-fable-5": [10, 50, 1],
  "claude-opus-5-5": [4, 20, 0.2], "claude-opus-5": [5, 25, 0.5], "claude-opus-4-8": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2], "claude-sonnet-5": [2, 10, 0.2],
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
};
const priceOf = (model: string) => PRICE[model] ?? PRICE[Object.keys(PRICE).find((k) => model.startsWith(k)) ?? ""] ?? PRICE[CLAUDE_DEFAULT];
// μοντέλα όπου ισχύει το server-side fallback σε άρνηση (opt-in, «default» = δρομολόγηση ανά κατηγορία)
const FALLBACK_OK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

let client: { key: string; c: Anthropic } | null = null;
const clientFor = (apiKey: string) => {
  if (client?.key !== apiKey) client = { key: apiKey, c: new Anthropic({ apiKey, maxRetries: 1 }) };
  return client.c;
};

type Block = Anthropic.Beta.BetaTextBlockParam | Anthropic.Beta.BetaImageBlockParam;
const IMG_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** image_url (data: ή https) → μπλοκ εικόνας του Claude */
function toBlocks(content: ChatMessage["content"]): Block[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((c): Block => {
    if (c.type === "text") return { type: "text", text: c.text };
    const url = c.image_url.url;
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(url);
    if (m && IMG_TYPES.has(m[1])) return { type: "image", source: { type: "base64", media_type: m[1] as "image/png", data: m[2] } };
    return { type: "image", source: { type: "url", url } };
  });
}

export interface ClaudeResult { text: string; model: string; tokensIn: number; tokensOut: number; costUsd: number }

export async function claudeChat(opts: {
  apiKey: string; model: string; messages: ChatMessage[]; maxTokens: number; json?: boolean;
  reasoning?: "low" | "medium" | "high"; timeoutMs: number;
}): Promise<ClaudeResult> {
  const system = opts.messages.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : m.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"))).join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role as "user" | "assistant", content: toBlocks(m.content) }));
  // Το OpenRouter δέχεται json_object· εδώ η οδηγία μπαίνει στο system και το parseJson των καλούντων κάνει το υπόλοιπο
  const sys = [system, opts.json ? "Απάντησε ΜΟΝΟ με ένα έγκυρο αντικείμενο JSON, χωρίς κείμενο πριν ή μετά." : ""].filter(Boolean).join("\n\n");
  const fallback = FALLBACK_OK.has(opts.model);
  const r = await clientFor(opts.apiKey).beta.messages.create({
    model: opts.model,
    // η σκέψη (πάντα ενεργή στα τρέχοντα μοντέλα) μετρά στο max_tokens: περιθώριο ώστε να μην κόβεται η απάντηση
    max_tokens: Math.max(opts.maxTokens, 8000),
    ...(sys ? { system: sys } : {}),
    messages,
    output_config: { effort: opts.reasoning ?? "medium" },
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  }, { timeout: Math.max(opts.timeoutMs, 60_000) });
  if (r.stop_reason === "refusal") throw new Error(`Claude: άρνηση απάντησης${r.stop_details?.category ? ` (${r.stop_details.category})` : ""}`);
  const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const u = r.usage;
  const [pin, pout, pcache] = priceOf(r.model);
  const cacheWrite = u.cache_creation_input_tokens ?? 0, cacheRead = u.cache_read_input_tokens ?? 0;
  const costUsd = ((u.input_tokens + cacheWrite * 1.25) * pin + cacheRead * pcache + u.output_tokens * pout) / 1e6;
  return { text, model: r.model, tokensIn: u.input_tokens + cacheWrite + cacheRead, tokensOut: u.output_tokens, costUsd };
}

/** Ο έλεγχος κλειδιού των ρυθμίσεων: λίστα μοντέλων (χωρίς κόστος). */
export async function claudeKeyCheck(apiKey: string) {
  const page = await clientFor(apiKey).models.list({ limit: 20 });
  return page.data.map((m) => m.id);
}

/** Σφάλμα του SDK → σύντομο ελληνικό μήνυμα για τη διαχείριση */
export function claudeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Claude: μη έγκυρο κλειδί API.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Claude: το κλειδί δεν έχει πρόσβαση σε αυτό το μοντέλο.";
  if (e instanceof Anthropic.NotFoundError) return "Claude: το μοντέλο δεν βρέθηκε.";
  if (e instanceof Anthropic.RateLimitError) return "Claude: όριο αιτημάτων — δοκίμασε σε λίγο.";
  if (e instanceof Anthropic.BadRequestError) return `Claude: άκυρο αίτημα — ${e.message.slice(0, 160)}`;
  if (e instanceof Anthropic.APIError) return `Claude ${e.status ?? ""}: ${e.message.slice(0, 160)}`;
  return e instanceof Error ? e.message : String(e);
}
