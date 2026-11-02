import { NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { sendLive } from "@/lib/skets/bus";
import { buildBeats, sceneAt } from "@/lib/skets/script";
import { liveMemory } from "@/lib/skets/live";
import { speakParts } from "@/lib/skets/speak-live";
import { chat } from "@/lib/ai/openrouter";
import { transcribe } from "@/lib/voice/stt";
import { fidelity } from "@/lib/voice/tts";
import snapshot from "@/lib/skets/snapshot.json";
import type { LiveEv, LiveProduct, SkProduct, Snapshot } from "@/lib/skets/types";

export const maxDuration = 60;
const snap = snapshot as Snapshot;
const beats = buildBeats(snap);
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const YES = /^(ναι|ναι ναι|σιγουρα|φυσικα|βεβαιως|ακριβως|ε ναι|ναι φυσικα|ναι σιγουρα|ναι περιπου|περιπου|καπου εκει|μαλλον|οκ|οκει|εντα[ξκ]ει|ναι εντα[ξκ]ει|ναι βεβαια|βεβαια|σωστα|ετσι|ετσι ακριβως)( .{0,24})?$/;
const QUESTION = /\b(τι|πως|γιατι|ποσο|ποσα|ποσες|ποιο|ποια|ποιος|ποτε|που|εχετε|εχεις|μπορεις|μπορειτε|μηπως|αν|ομως|αλλα|οχι)\b/;

/**
 * Ο παρουσιαστής μίλησε ενώ η σκηνή περίμενε την ατάκα του (αυτόματη συνέχεια, components/skets/vad.ts): POST multipart
 * { audio, beat }. Αν είπε την αναμενόμενη απάντηση (ή κάτι ισοδύναμο) → { route: "script" } και η σκηνή παίζει αμέσως την
 * ηχογραφημένη φράση. Αλλιώς (ερώτηση, αντίρρηση, σχόλιο) → ο Ερμής απαντά ζωντανά, ΜΟΝΟ από τα προϊόντα της ομάδας που
 * βλέπουμε (ένα γρήγορο μοντέλο, όχι αναζήτηση στη βάση), με φράση αναμονής μπροστά, και ξαναπιάνει την ερώτηση του σεναρίου.
 */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t0 = Date.now();
  const fd = await req.formData().catch(() => null);
  const f = fd?.get("audio"), id = String(fd?.get("beat") ?? "");
  const bi = beats.findIndex((b) => b.id === id), beat = beats[bi];
  if (!beat || !(f instanceof File) || f.size < 2000) return NextResponse.json({ route: "script", why: "no audio" });
  const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("ogg") ? "ogg" : "webm";
  const t = await transcribe(Buffer.from(await f.arrayBuffer()), f.type || "audio/webm", `turn.${ext}`);
  // αν δεν ακούστηκε καθαρά, το σενάριο συνεχίζει — ποτέ κόλλημα στη σκηνή
  if (!t.ok || !t.text.trim()) return NextResponse.json({ route: "script", why: "stt", ms: Date.now() - t0 });
  const said = t.text.trim(), cue = (beat.cue ?? "").replace(/[«»]/g, ""), n = norm(said);
  const msStt = Date.now() - t0;
  if (fidelity(cue, said) >= 0.5 || (YES.test(n) && !QUESTION.test(n.replace(/^(ναι|οκ)\s*/, "")))) return NextResponse.json({ route: "script", said, ms: msStt });

  // κάτι άλλο: φράση αναμονής στη σκηνή αμέσως (thinking), και ο Ερμής απαντά από ό,τι ξέρουμε ήδη
  const ev0: LiveEv = { n: Date.now(), phase: "thinking", q: said, quiet: true };
  sendLive(ev0);
  const scene = sceneAt(beats, bi), cat = scene.cat ? snap.cats.find((c) => c.key === scene.cat) ?? null : null;
  const picks = snap.cats.flatMap((c) => (scene.picked[c.key] ? [c.candidates.find((p) => p.id === scene.picked[c.key])!] : []));
  const line = (p: SkProduct) => `[${p.id}] ${p.brand} ${p.title} · ${p.key} · ${eur(p.price)} · ${p.chips.join(", ")}`;
  const ctx = [
    `Παρουσιαστής: ${snap.presenter.full}, μόλις πήρε μετάθεση στη Λάρισα και εξοπλίζει σπίτι από το μηδέν.`,
    picks.length ? `Ήδη στο σπίτι: ${picks.map((p) => `${p.brand} ${p.key} (${eur(p.price)})`).join(", ")}.` : "",
    cat ? `Τώρα διαλέγουμε: ${cat.label}. Υποψήφια:\n${cat.candidates.map(line).join("\n")}` : "",
    cat && cat.candidates.some((p) => scene.rejected[p.id]) ? `Έχουν ήδη απορριφθεί: ${cat.candidates.filter((p) => scene.rejected[p.id]).map((p) => `${p.id} (${scene.rejected[p.id]})`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  const mem = liveMemory();
  const r = await chat({
    feature: "skets-turn", model: "fast", json: true, maxTokens: 260, temperature: 0.4, reasoning: "off", accounting: "background", timeoutMs: 12000,
    messages: [
      { role: "system", content: `Είσαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics, σε ζωντανή παρουσίαση μπροστά σε κοινό. Μιλάς με τον παρουσιαστή ευγενικά, ανθρώπινα αλλά με επαγγελματική απόσταση (πληθυντικός ευγενείας — δεν είστε φίλοι).
Ο Ερμής μόλις είπε: «${beat.say ?? ""}»
Η απάντηση που περιμένει το σενάριο: «${cue}»
Αποφάσισε:
- route "script": αν ο παρουσιαστής ουσιαστικά απάντησε όπως περιμένει το σενάριο (ίδιο νόημα, με άλλα λόγια).
- route "free": αν ρώτησε κάτι, διαφώνησε, ζήτησε διευκρίνιση ή είπε κάτι άλλο. Τότε γράψε στο "say" τι λέει ο Ερμής: 1–3 σύντομες προτάσεις, μόνο από τα στοιχεία παρακάτω (ποτέ τιμές/χαρακτηριστικά που δεν δίνονται), και τελείωσε ξαναθέτοντας ήπια την ερώτηση του σεναρίου ώστε να συνεχίσουμε. Αριθμούς και μονάδες ολογράφως όπως λέγονται («εννιά κιλά», «πενήντα πέντε ίντσες»), μάρκες με λατινικά.
Στο "ids" βάλε 0–2 κωδικούς προϊόντων από τη λίστα που αναφέρεις (για να φανούν στην οθόνη).
JSON μόνο: {"route":"script"|"free","say":"...","ids":["..."]}
Στοιχεία:
${ctx}` },
      ...mem.thread.slice(-6).map((x) => ({ role: x.role === "user" ? ("user" as const) : ("assistant" as const), content: x.text })),
      { role: "user", content: said },
    ],
  }).catch((e) => { console.error("[skets turn]", e instanceof Error ? e.message : e); return null; });
  const out = (() => { try { return JSON.parse(r?.text ?? "") as { route?: string; say?: string; ids?: string[] }; } catch { return null; } })();
  if (!out || out.route !== "free" || !out.say?.trim()) {
    sendLive({ ...ev0, phase: "resume" });
    return NextResponse.json({ route: "script", said, ms: Date.now() - t0 });
  }
  const all = snap.cats.flatMap((c) => c.candidates);
  const products: LiveProduct[] = (out.ids ?? []).flatMap((pid) => all.filter((p) => p.id === pid)).slice(0, 2).map((p) => ({ id: p.id, brand: p.brand, title: p.title, price: p.price, image: p.image, why: p.key }));
  products.forEach((p) => mem.products.set(p.id, p));
  mem.thread.push({ role: "user", text: said }, { role: "advisor", text: out.say });
  const ev: LiveEv = { ...ev0, phase: "answer", text: out.say.trim(), products };
  sendLive(ev);
  const msLlm = Date.now() - t0;
  const first = await speakParts(ev, req.headers.get("x-skets-key") ?? "");
  return NextResponse.json({ route: "free", said, say: ev.text, ms: { stt: msStt, llm: msLlm - msStt, firstAudio: first } });
}
