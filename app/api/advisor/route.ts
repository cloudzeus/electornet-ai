import { NextResponse } from "next/server";
import { advisorAnswer } from "@/lib/advisor/answer";
import { advisorCompose } from "@/lib/ai/tasks";
import { getSettings } from "@/lib/cms/settings";

/**
 * @dynamic Advisor endpoint. Rules pick the candidates (catalogue, budget,
 * door width, noise…); when OpenRouter is configured the LLM writes the
 * answer and the per-product «why» in the same JSON shape. Any AI failure
 * or budget stop falls back silently to the rule text.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  const door = Number(u.searchParams.get("door"));
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const base = advisorAnswer(q, door ? { door, lift: true } : null);
  const settings = await getSettings();
  const answer = await advisorCompose(base, { name: settings.advisor.name, context: door ? `πόρτα ${door} εκ.` : undefined }).catch(() => base);
  return NextResponse.json(answer, { headers: { "cache-control": "no-store" } });
}
