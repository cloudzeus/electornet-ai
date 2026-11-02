import { NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { sendLive } from "@/lib/skets/bus";
import { liveSpoken, SKETS_VOICE } from "@/lib/skets/script";
import { liveAudio, speakParts } from "@/lib/skets/speak-live";
import { liveMemory, resetLiveMemory } from "@/lib/skets/live";
import { smartAdvisor, type Turn } from "@/lib/advisor/engine";
import { getSettings } from "@/lib/cms/settings-server";
import { transcribe } from "@/lib/voice/stt";
import snapshot from "@/lib/skets/snapshot.json";
import type { LiveEv, LiveProduct, Snapshot } from "@/lib/skets/types";

export const maxDuration = 60;
const snap = snapshot as Snapshot;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;

/** Ο Ερμής του eshop ξέρει από την αρχή τι έγινε στη σκηνή: ποιος, πού, τι διαλέξατε. */
function seed(): Turn[] {
  const picks = snap.cats.map((c) => c.candidates.find((p) => p.id === c.pick)!);
  return [
    { role: "user", text: `Είμαι ο ${snap.presenter.full}. Μόλις πήρα μετάθεση στη Λάρισα και εξοπλίζω το σπίτι μου από το μηδέν.` },
    { role: "advisor", text: `Διαλέξαμε μαζί: ${picks.map((p) => `${p.brand} ${p.title} (${eur(p.price)})`).join(", ")}.`, products: picks.map((p) => p.id).slice(0, 4) },
  ];
}

/**
 * Ερώτηση εκτός σεναρίου (από το κοινό), ζωντανά: POST multipart { audio } (push-to-talk) ή JSON { q } (πληκτρολόγηση).
 * Ομιλία → κείμενο → ο πραγματικός Ερμής του eshop (μόνο από τη βάση) → φωνή του Ερμή. Κάθε φάση πάει αμέσως σε σκηνή και
 * τηλεχειριστήριο (SSE): «σκέφτεται» με την ερώτηση, μετά κείμενο + προϊόντα, τέλος ο ήχος. JSON { reset: true } ξεχνά τη συζήτηση.
 */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const n = Date.now();
  let q = "";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const f = (await req.formData().catch(() => null))?.get("audio");
    if (!(f instanceof File) || f.size < 2000) return fail(n, "", "Δεν ακούστηκε τίποτα — κράτα πατημένο όσο μιλάς.");
    if (f.size > 4 * 1024 * 1024) return fail(n, "", "Πολύ μεγάλη ηχογράφηση.");
    sendLive({ n, phase: "thinking", q: "…" });
    const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("ogg") ? "ogg" : "webm";
    const t = await transcribe(Buffer.from(await f.arrayBuffer()), f.type || "audio/webm", `speech.${ext}`);
    if (!t.ok || !t.text.trim()) return fail(n, "", "Δεν άκουσα καλά. Ξαναπές το πιο κοντά στο μικρόφωνο.");
    q = t.text.trim();
  } else {
    const b = (await req.json().catch(() => ({}))) as { q?: string; reset?: boolean };
    if (b.reset) { resetLiveMemory(); return NextResponse.json({ ok: true }); }
    q = (b.q ?? "").trim().slice(0, 300);
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  }
  sendLive({ n, phase: "thinking", q });
  const tAsk = Date.now();

  const mem = liveMemory();
  const settings = await getSettings();
  const r = await smartAdvisor(
    { q, thread: [...seed(), ...mem.thread].slice(-12), shown: mem.shown, state: mem.state },
    { name: settings.advisor.name, kwhPrice: settings.site.commerce.kwhPrice, commerce: settings.site.commerce },
  ).catch((e) => { console.error("[skets ask]", e instanceof Error ? e.message : e); return null; });
  if (!r) return fail(n, q, "Ο κατάλογος δεν απάντησε. Πάμε πίσω στο σενάριο.");

  const products: LiveProduct[] = r.products.slice(0, 3).map((p) => ({ id: p.id, brand: p.brand, title: p.title, price: p.price, image: p.image, why: p.why }));
  const text = liveSpoken(r.text);
  mem.thread.push({ role: "user", text: q }, { role: "advisor", text: r.text, products: products.map((p) => p.id) });
  mem.state = r.state; mem.shown = r.shown;
  mem.products = new Map([...mem.products, ...products.map((p) => [p.id, p] as const)]);
  const ev: LiveEv = { n, phase: "answer", q, text, products };
  sendLive(ev);

  const tSpeak = Date.now();
  const first = await speakParts(ev, req.headers.get("x-skets-key") ?? "");
  // για την πρόβα: πού πάει ο χρόνος (ms)
  return NextResponse.json({ ...ev, ms: { stt: tAsk - n, advisor: tSpeak - tAsk, firstAudio: first, tts: Date.now() - tSpeak } });
}

function fail(n: number, q: string, error: string) {
  sendLive({ n, phase: "error", q, error });
  return NextResponse.json({ error }, { status: 422 });
}

/** GET → οι φράσεις αναμονής / επιστροφής ηχογραφημένες (cache): { "<φράση>": url } · GET ?audio=<id> → ήχος ζωντανής απάντησης. */
export async function GET(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const aid = new URL(req.url).searchParams.get("audio");
  if (aid) { const a = liveAudio(aid); return a ? new Response(new Uint8Array(a.bytes), { headers: { "Content-Type": a.mime, "Cache-Control": "no-store" } }) : new Response("gone", { status: 404 }); }
  const { LIVE_FILLERS, LIVE_BACK, TURN_FILLERS } = await import("@/lib/skets/script");
  const { speak } = await import("@/lib/voice/tts");
  const out: Record<string, string> = {};
  await Promise.all([...LIVE_FILLERS, LIVE_BACK, ...TURN_FILLERS].map(async (t) => { const r = await speak(t, SKETS_VOICE).catch(() => null); if (r) out[t] = r.url; }));
  return NextResponse.json(out);
}
