import { after, NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { sendLive } from "@/lib/skets/bus";
import { clarifyLines, liveSpoken, pickOf, SKETS_VOICE } from "@/lib/skets/script";
import { db } from "@/lib/db";
import { liveAudio, speakParts } from "@/lib/skets/speak-live";
import { liveMemory, resetLiveMemory } from "@/lib/skets/live";
import { smartAdvisor, type Turn } from "@/lib/advisor/engine";
import { getSettings } from "@/lib/cms/settings-server";
import { emailCart } from "@/lib/cart/email";
import { transcribe } from "@/lib/voice/stt";
import snapshot from "@/lib/skets/snapshot.json";
import type { LiveEv, LiveProduct, Snapshot } from "@/lib/skets/types";

export const maxDuration = 60;
const snap = snapshot as Snapshot;
const GREETING = `Καλησπέρα σας, ${snap.presenter.vocative}! Πώς μπορώ να σας βοηθήσω;`;
const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** όλη η ατάκα είναι χαιρετισμός (με ή χωρίς το όνομα του Ερμή, και με τα συνηθισμένα λάθη της αναγνώρισης) */
const GREET = /^[\s,.!;]*((γεια( σου| σας)?|καλησπερα( σας)?|καλημερα( σας)?|χαιρετε|χαιρετω|γεια χαρα|ωραια|ερμη|ερμης|ερμι|ρεμπε|ρι|εμνη)[\s,.!;]*)+$/u;
const SEND = /στειλ|στελν|προωθ/u, MAILISH = /mail|ιμει?λ|μει?λ|ηλεκτρονικ|προσφορ/u;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;

/** Ο Ερμής του eshop ξέρει από την αρχή τι έγινε στη σκηνή: ποιος, πού, τι διαλέξατε. */
function seed(free: boolean): Turn[] {
  // χωρίς σενάριο: ο Ερμής ξέρει μόνο ποιος του μιλά — όλα τα άλλα τα λέει ο παρουσιαστής
  if (free) return [{ role: "user", text: `Είμαι ο ${snap.presenter.full}. Μίλα μου στον πληθυντικό ευγενείας και να με λες «${snap.presenter.vocative}».` }];
  const alts = liveMemory().alts;
  const picks = snap.cats.map((c) => pickOf(c, alts));
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
  let q = "", free = false, mic = "";
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null), f = fd?.get("audio");
    free = fd?.get("free") === "1"; mic = String(fd?.get("mic") ?? "").slice(0, 120);
    if (!(f instanceof File) || f.size < 2000) return fail(n, "", "Δεν ακούστηκε τίποτα — κράτα πατημένο όσο μιλάς.");
    if (f.size > 4 * 1024 * 1024) return fail(n, "", "Πολύ μεγάλη ηχογράφηση.");
    if (!free) sendLive({ n, phase: "thinking", q: "…" });
    const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("ogg") ? "ogg" : "webm";
    const t = await transcribe(Buffer.from(await f.arrayBuffer()), f.type || "audio/webm", `speech.${ext}`);
    const heard = t.ok ? t.text.replace(/[([][^)\]]*[)\]]/g, " ").trim() : "";
    if (free && !/\p{L}{2,}/u.test(heard)) {
      // χωρίς λέξεις: σκέτος θόρυβος → τίποτα· ~1,5 s ήχου → η ηχογραφημένη «δεν σας άκουσα καλά» (ποτέ μήνυμα σφάλματος στην οθόνη)
      log({ route: f.size > 6000 ? "clarify" : "none", why: "unheard", size: f.size, mic });
      const a = clarifyLines(snap).idle;
      if (f.size > 6000 && a && snap.voice[a]) { const ev: LiveEv = { n, phase: "answer", q: "", text: a, products: [], quiet: true }; sendLive({ n, phase: "thinking", q: "", quiet: true }); sendLive(ev); sendLive({ ...ev, phase: "audio", audio: snap.voice[a], part: 0, parts: 1 }); }
      return NextResponse.json({ route: "none" });
    }
    if (!t.ok || !heard) return fail(n, "", "Δεν άκουσα καλά. Ξαναπές το πιο κοντά στο μικρόφωνο.");
    q = heard;
  } else {
    const b = (await req.json().catch(() => ({}))) as { q?: string; reset?: boolean; free?: boolean };
    free = b.free === true;
    if (b.reset) { resetLiveMemory(); return NextResponse.json({ ok: true }); }
    q = (b.q ?? "").trim().slice(0, 300);
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
  }
  sendLive({ n, phase: "thinking", q, quiet: free || undefined });
  const tAsk = Date.now();

  // «στείλτε μου την προσφορά στο email»: οι συσκευές που φάνηκαν στη σκηνή, στο σταθερό email του παρουσιαστή (SKETS_EMAIL)
  if (free && SEND.test(plain(q)) && MAILISH.test(plain(q))) return sendOffer(n, q, mic, req.headers.get("x-skets-key") ?? "");

  // σκέτος χαιρετισμός («Γεια σου Ερμή», «Καλησπέρα»): αμέσως η ηχογραφημένη απάντηση, χωρίς τον κατάλογο
  if (free && GREET.test(plain(q)) && q.split(/\s+/).length <= 6 && snap.voice[GREETING]) {
    const ev: LiveEv = { n, phase: "answer", q, text: GREETING, products: [], quiet: true };
    liveMemory().thread.push({ role: "user", text: q }, { role: "advisor", text: GREETING });
    sendLive(ev); sendLive({ ...ev, phase: "audio", audio: snap.voice[GREETING], part: 0, parts: 1 });
    log({ said: q, route: "ready", say: GREETING, mic });
    return NextResponse.json(ev);
  }

  const mem = liveMemory();
  const settings = await getSettings();
  const r = await smartAdvisor(
    { q, thread: [...seed(free), ...mem.thread].slice(-12), shown: mem.shown, state: mem.state },
    { name: settings.advisor.name, kwhPrice: settings.site.commerce.kwhPrice, commerce: settings.site.commerce, wider: free },
  ).catch((e) => { console.error("[skets ask]", e instanceof Error ? e.message : e); return null; });
  if (!r) { if (free) log({ said: q, route: "error", mic }); return fail(n, q, free ? "Ο κατάλογος δεν απάντησε. Ξαναρωτήστε με, παρακαλώ." : "Ο κατάλογος δεν απάντησε. Πάμε πίσω στο σενάριο."); }

  const products: LiveProduct[] = r.products.slice(0, 3).map((p) => ({ id: p.id, brand: p.brand, title: p.title, price: p.price, image: p.image, why: p.why }));
  const text = liveSpoken(r.text);
  mem.thread.push({ role: "user", text: q }, { role: "advisor", text: r.text, products: products.map((p) => p.id) });
  mem.state = r.state; mem.shown = r.shown;
  mem.products = new Map([...mem.products, ...products.map((p) => [p.id, p] as const)]);
  const ev: LiveEv = { n, phase: "answer", q, text, products, quiet: free || undefined };
  sendLive(ev);

  const tSpeak = Date.now();
  const first = await speakParts(ev, req.headers.get("x-skets-key") ?? "");
  if (free) log({ said: q, route: "free", say: text, mic, ms: { stt: tAsk - n, advisor: tSpeak - tAsk, firstAudio: first } });
  // για την πρόβα: πού πάει ο χρόνος (ms)
  return NextResponse.json({ ...ev, ms: { stt: tAsk - n, advisor: tSpeak - tAsk, firstAudio: first, tts: Date.now() - tSpeak } });
}

async function sendOffer(n: number, q: string, mic: string, key: string) {
  const mem = liveMemory(), to = process.env.SKETS_EMAIL?.trim();
  const shown = [...mem.products.values()].slice(-8);
  const r = !to || !shown.length ? null : await emailCart({ email: to, lines: shown.map((p) => ({ productId: p.id, qty: 1 })), guest: true, template: "advisor-offer", firstName: snap.presenter.vocative, source: "skets", maxPerHour: 30 }).catch((e) => { console.error("[skets offer]", e instanceof Error ? e.message : e); return null; });
  const text = !to ? "Δεν έχω ορισμένο email για να σας τη στείλω, κύριε Δριβάκο. Θα σας την ετοιμάσει το κατάστημα."
    : !shown.length ? "Δεν έχουμε δει ακόμα συσκευές μαζί, κύριε Δριβάκο. Πείτε μου τι χρειάζεστε και θα σας στείλω την προσφορά."
    : r?.ok && r.sent ? `Μόλις σας έστειλα την προσφορά στο email σας: ${r.count === 1 ? "ένα προϊόν" : `${r.count} προϊόντα`}, σύνολο ${eur(r.total)}.`
    : "Δεν μπόρεσα να στείλω το email αυτή τη στιγμή, κύριε Δριβάκο. Θα το ξαναδοκιμάσουμε σε λίγο.";
  const ev: LiveEv = { n, phase: "answer", q, text, products: shown.slice(-3), quiet: true };
  mem.thread.push({ role: "user", text: q }, { role: "advisor", text });
  sendLive(ev);
  const first = await speakParts(ev, key);
  log({ said: q, route: "email", say: text, sent: !!r?.sent, count: r?.ok ? r.count : 0, error: r && !r.ok ? r.error : undefined, mic, ms: { firstAudio: first } });
  return NextResponse.json(ev);
}

/** ατάκες της σκηνής χωρίς σενάριο: στο ίδιο log με τις υπόλοιπες (σελίδα εκπαίδευσης, διάγνωση μικροφώνου) */
function log(o: Record<string, unknown>) {
  after(() => db.auditLog.create({ data: { action: "skets.turn", entity: "SketsTurn", entityId: "free", after: JSON.parse(JSON.stringify({ src: "stage", ...o })) } }).then(() => {}, () => {}));
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
