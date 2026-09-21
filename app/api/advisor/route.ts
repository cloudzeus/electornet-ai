import { NextResponse } from "next/server";
import { advisorAnswer } from "@/lib/advisor/answer";
import { smartAdvisor } from "@/lib/advisor/engine";
import { advisorCompose } from "@/lib/ai/tasks";
import { getSettings } from "@/lib/cms/settings";
import type { MySpace } from "@/lib/space/fit";

export const maxDuration = 45;

/**
 * @dynamic Advisor endpoint. Με κατάλογο στη βάση απαντά ο πραγματικός Ερμής (lib/advisor/engine.ts): το LLM καταλαβαίνει
 * την ερώτηση και τεκμηριώνει, τα προϊόντα / τιμές / απόθεμα / χαρακτηριστικά έρχονται μόνο από τη βάση. Χωρίς βάση
 * (καθαρό demo) ή σε σφάλμα: οι παλιοί κανόνες πάνω στα δειγματικά προϊόντα. Ίδιο σχήμα JSON και στις δύο περιπτώσεις.
 *   ?q=…  &prev=προηγούμενη ερώτηση  &pid=προϊόν που βλέπει  &door=80  &niche=60,85,60
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 500);
  if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  const door = Number(u.searchParams.get("door"));
  const n = (u.searchParams.get("niche") ?? "").split(",").map(Number);
  const space: MySpace | null = door > 0 ? { door, lift: true, ...(n.length === 3 && n.every((x) => x > 0) ? { niche: { w: n[0], h: n[1], d: n[2] } } : {}) } : null;
  const settings = await getSettings();
  const smart = await smartAdvisor({ q, prev: u.searchParams.get("prev")?.trim().slice(0, 300) || undefined, pid: u.searchParams.get("pid") || undefined, space }, { name: settings.advisor.name, commerce: settings.site.commerce }).catch((e) => { console.error("[advisor]", e instanceof Error ? e.message : e); return null; });
  if (smart) return NextResponse.json(smart, { headers: { "cache-control": "no-store" } });
  const base = advisorAnswer(q, space);
  const answer = await advisorCompose(base, { name: settings.advisor.name, context: door ? `πόρτα ${door} εκ.` : undefined }).catch(() => base);
  return NextResponse.json(answer, { headers: { "cache-control": "no-store" } });
}
