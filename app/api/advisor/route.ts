import { NextResponse } from "next/server";
import { advisorAnswer } from "@/lib/advisor/answer";
import { smartAdvisor, type AdvisorState, type Turn } from "@/lib/advisor/engine";
import { advisorCompose } from "@/lib/ai/tasks";
import { getSettings } from "@/lib/cms/settings";
import type { MySpace } from "@/lib/space/fit";

export const maxDuration = 45;

/**
 * @dynamic Advisor endpoint. Με κατάλογο στη βάση απαντά ο πραγματικός Ερμής (lib/advisor/engine.ts): το LLM καταλαβαίνει
 * τη ΣΥΖΗΤΗΣΗ, ερευνά και τεκμηριώνει· προϊόντα / τιμές / απόθεμα / χαρακτηριστικά μόνο από τη βάση. Χωρίς βάση ή σε
 * σφάλμα: οι παλιοί κανόνες πάνω στα δειγματικά προϊόντα. Ίδιο σχήμα JSON, συν `state` και `shown` που ο πελάτης ξαναστέλνει.
 *   POST { q, thread:[{role,text,products?}], shown:[ids], state, pid?, door?, niche?:[w,h,d] }
 *   GET  ?q=…&prev=…&pid=…&door=…&niche=w,h,d   (παλιοί καλούντες: το κουτί αναζήτησης)
 */
interface Body { q?: string; thread?: Turn[]; shown?: string[]; state?: AdvisorState | null; pid?: string; prev?: string; door?: number; niche?: number[] }

async function answer(b: Body) {
  const q = (b.q ?? "").trim().slice(0, 500);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const door = Number(b.door);
  const n = Array.isArray(b.niche) ? b.niche.map(Number) : [];
  const space: MySpace | null = door > 0 ? { door, lift: true, ...(n.length === 3 && n.every((x) => x > 0) ? { niche: { w: n[0], h: n[1], d: n[2] } } : {}) } : null;
  const thread = (Array.isArray(b.thread) ? b.thread : []).filter((t) => (t.role === "user" || t.role === "advisor") && typeof t.text === "string").slice(-12).map((t) => ({ role: t.role, text: t.text.slice(0, 600), products: Array.isArray(t.products) ? t.products.filter((x) => typeof x === "string").slice(0, 4) : undefined }));
  const settings = await getSettings();
  const smart = await smartAdvisor({ q, thread, shown: Array.isArray(b.shown) ? b.shown.filter((x) => typeof x === "string").slice(-12) : [], state: b.state && typeof b.state === "object" ? b.state : null, prev: typeof b.prev === "string" ? b.prev.slice(0, 300) : undefined, pid: typeof b.pid === "string" ? b.pid : undefined, space }, { name: settings.advisor.name, kwhPrice: settings.site.commerce.kwhPrice, commerce: settings.site.commerce }).catch((e) => { console.error("[advisor]", e instanceof Error ? e.message : e); return null; });
  if (smart) return NextResponse.json(smart, { headers: { "cache-control": "no-store" } });
  const base = advisorAnswer(q, space);
  const out = await advisorCompose(base, { name: settings.advisor.name, context: door ? `πόρτα ${door} εκ.` : undefined }).catch(() => base);
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  return answer(b);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const niche = (u.searchParams.get("niche") ?? "").split(",").map(Number).filter((x) => x > 0);
  return answer({ q: u.searchParams.get("q") ?? "", prev: u.searchParams.get("prev") ?? undefined, pid: u.searchParams.get("pid") ?? undefined, door: Number(u.searchParams.get("door")) || undefined, niche: niche.length === 3 ? niche : undefined });
}
