import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sketsReq } from "@/lib/skets/auth";
import { sendLive as busLive } from "@/lib/skets/bus";
import { altFor, buildBeats, clarifyLines, pickOf, sceneAt, slotsIn, storeFor, type Beat } from "@/lib/skets/script";
import { liveMemory } from "@/lib/skets/live";
import { speakParts } from "@/lib/skets/speak-live";
import { chat, parseJson } from "@/lib/ai/openrouter";
import { transcribe } from "@/lib/voice/stt";
import { fidelity } from "@/lib/voice/tts";
import snapshot from "@/lib/skets/snapshot.json";
import type { Alts, CatKey, LiveEv, LiveProduct, SkProduct, Snapshot } from "@/lib/skets/types";

export const maxDuration = 60;
const snap = snapshot as Snapshot;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const YES = /^(ναι|ναι ναι|σιγουρα|φυσικα|βεβαιως|ακριβως|ε ναι|ναι φυσικα|ναι σιγουρα|ναι περιπου|περιπου|καπου εκει|μαλλον|οκ|οκει|εντα[ξκ]ει|ναι εντα[ξκ]ει|ναι βεβαια|βεβαια|σωστα|ετσι|ετσι ακριβως)( .{0,24})?$/;
// το \b της JS δεν βλέπει ελληνικά γράμματα: όρια λέξης με \p{L}
// ερώτηση = αρχίζει με ερωτηματική λέξη ή αντίρρηση («γιατί όχι…», «όχι, …») — στη μέση το «γιατί» είναι συνήθως «επειδή»
const QUESTION = /^(?:(?:και|αλλα|ομως|ε|ναι|ερμη|δηλαδη)\s+)*(τι|πως|γιατι|ποσο|ποσα|ποσες|ποιο|ποια|ποιος|ποτε|εχετε|εχεις|μπορεις|μπορειτε|μπορω|μηπως|οχι|αν)(?!\p{L})/u;

/**
 * Ο παρουσιαστής μίλησε ενώ η σκηνή περίμενε την ατάκα του (αυτόματη συνέχεια, components/skets/vad.ts): POST multipart
 * { audio, beat }. Αν είπε την αναμενόμενη απάντηση (ή κάτι ισοδύναμο) → { route: "script" } και η σκηνή παίζει αμέσως την
 * ηχογραφημένη φράση. Αλλιώς (ερώτηση, αντίρρηση, σχόλιο) → ο Ερμής απαντά ζωντανά, ΜΟΝΟ από τα προϊόντα της ομάδας που
 * βλέπουμε (ένα γρήγορο μοντέλο, όχι αναζήτηση στη βάση), με φράση αναμονής μπροστά, και ξαναπιάνει την ερώτηση του σεναρίου.
 * Άλλο μέγεθος από το αναμενόμενο («σαράντα τετραγωνικά») → { route: "alt", cat, alt } και η σκηνή παίζει τη διακλάδωση.
 * Στον χάρτη: «της Ηπείρου» / «το πρώτο» → { route: "store", i }.
 */
/** η ροή του σεναρίου για το μοντέλο: τι λέει ο Ερμής και τι απαντά ο παρουσιαστής σε κάθε βήμα */
const flow = (beats: Beat[], at: number) => beats.flatMap((b, j) => (b.say || b.cue ? [`${j === at ? "►" : "-"} ${b.say ? `Ερμής: «${b.say}»` : ""}${b.wait === "presenter" && b.cue ? ` → παρουσιαστής: ${b.cue}` : b.wait === "store" ? " → παρουσιαστής: διαλέγει κατάστημα" : ""}`] : [])).join("\n");

export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const t0 = Date.now();
  const fd = await req.formData().catch(() => null);
  const f = fd?.get("audio"), id = String(fd?.get("beat") ?? "");
  // δοκιμή από τη σελίδα εκπαίδευσης (/ermis-live/train): κείμενο αντί για ήχο, η σκηνή δεν ακούει/μιλά, η μνήμη της παράστασης μένει ανέγγιχτη
  const tryMode = fd?.get("mode") === "try", textIn = String(fd?.get("text") ?? "").trim().slice(0, 500);
  const src = tryMode ? "try" : String(fd?.get("src") ?? "stage").slice(0, 20); // «test» = συνθετικές δοκιμές, δεν μετράνε ως πρόβα
  const sendLive = (e: LiveEv) => { if (!tryMode) busLive(e); };
  const M = tryMode ? structuredClone(liveMemory()) : liveMemory();
  const alts = (() => { try { return JSON.parse(String(fd?.get("alts") ?? "{}")) as Alts; } catch { return {}; } })();
  const ahead = (() => { try { return (JSON.parse(String(fd?.get("ahead") ?? "[]")) as CatKey[]).filter((k) => snap.cats.some((c) => c.key === k)); } catch { return []; } })();
  M.alts = alts;
  const beats = buildBeats(snap, alts, ahead);
  const bi = beats.findIndex((b) => b.id === id), beat = beats[bi];
  // σιωπή, θόρυβος ή βήχας ΔΕΝ είναι απάντηση: η σκηνή μένει στο βήμα και ξανακούει (ο χειριστής προχωρά με Enter αν χρειαστεί)
  const size = f instanceof File ? f.size : 0;
  if (!beat || (!textIn && (!(f instanceof File) || size < 2000))) return NextResponse.json({ route: "none", why: "no audio" });
  // κάθε ατάκα από πρόβες/παράσταση κρατιέται (AuditLog «skets.turn»): τι ειπώθηκε σε ποιο βήμα και πού πήγε — υλικό για λέξεις-κλειδιά και έτοιμες απαντήσεις (scripts/skets/turns.ts)
  const done = (o: Record<string, unknown>) => {
    after(() => db.auditLog.create({ data: { action: "skets.turn", entity: "SketsTurn", entityId: beat.id, after: JSON.parse(JSON.stringify({ ...o, src })) } }).then(() => {}, () => {}));
    return NextResponse.json(o);
  };
  const a = textIn ? null : (f as File), buf = a ? Buffer.from(await a.arrayBuffer()) : null;
  const t = !a || !buf ? { ok: true as const, text: textIn } : await transcribe(buf, a.type || "audio/webm", `turn.${a.type.includes("mp4") ? "m4a" : a.type.includes("ogg") ? "ogg" : "webm"}`);
  // ήχος χωρίς λέξεις: κρατάμε την ηχογράφηση στο log (μικρή, base64) για να ακουστεί τι έπιασε το μικρόφωνο της σκηνής
  const clip = buf && size < 80000 ? { size, mime: a?.type, clip: buf.toString("base64") } : { size };
  // ήχοι σε παρενθέσεις («(μουσική)», «[γέλια]») και οι γνωστές «φαντασιώσεις» της αναγνώρισης πάνω σε θόρυβο δεν είναι λόγια
  const heardText = (t.ok ? t.text : "").replace(/[([][^)\]]*[)\]]/g, " ").trim();
  // δεν καταλάβαμε: μία φορά ανά βήμα ο Ερμής ρωτά κάτι έτοιμο που βοηθά τον παρουσιαστή (ποτέ σιωπή που τον κάνει να το ξαναπεί)
  const clarify = (why: string) => {
    const a = clarifyLines(snap)[beat.id], m = M;
    if (!a || !snap.voice[a] || m.clarified === beat.id) return null;
    m.clarified = beat.id;
    const ev = { n: Date.now(), phase: "thinking", q: heardText, quiet: true } as LiveEv;
    const ans: LiveEv = { ...ev, phase: "answer", text: a, products: [] };
    sendLive(ev); sendLive(ans); sendLive({ ...ans, phase: "audio", audio: snap.voice[a], part: 0, parts: 1 });
    return done({ route: "free", ready: true, say: a, why, heard: heardText, ms: Date.now() - t0 });
  };
  // μιλούσε αρκετά (>3 s) αλλά δεν βγήκε λέξη: δεν τον ακούσαμε καλά
  // ~1,5 s ήχου χωρίς λέξεις: δεν τον ακούσαμε καλά — ο Ερμής το λέει (μία φορά ανά βήμα) αντί να μένει σιωπηλός
  if (!/\p{L}{2,}/u.test(heardText) && size > 6000) { const c = clarify("unheard"); if (c) { after(() => db.auditLog.create({ data: { action: "skets.clip", entity: "SketsTurn", entityId: beat.id, after: JSON.parse(JSON.stringify(clip)) } }).then(() => {}, () => {})); return c; } }
  if (!/\p{L}{2,}/u.test(heardText) || /amara|υποτιτλ|subtitle|ευχαριστω πολυ που (μας )?(παρακολουθ|ακου)/.test(norm(heardText))) { after(() => db.auditLog.create({ data: { action: "skets.clip", entity: "SketsTurn", entityId: beat.id, after: JSON.parse(JSON.stringify(clip)) } }).then(() => {}, () => {})); return done({ route: "none", why: "noise", heard: heardText, size, ms: Date.now() - t0 }); }
  const said = heardText, cue = (beat.cue ?? "").replace(/[«»]/g, ""), n = norm(said);
  const msStt = Date.now() - t0;
  console.info("[skets turn]", beat.id, `${msStt}ms`, JSON.stringify(said)); // στα logs του server: τι άκουσε σε κάθε βήμα
  if (beat.wait === "store") {
    const i = storeFor(snap, said);
    if (i !== null) return done({ route: "store", i, said, ms: msStt });
    // ό,τι δεν είναι ερώτηση («ναι, αυτό», σχόλιο) δεν περνά από το μοντέλο (3–10 s): η σκηνή συνεχίζει να ακούει αμέσως
    // ό,τι δεν είναι ερώτηση («ναι», «εκεί», «όποιο είναι κοντά») = το πιο κοντινό· η σκηνή δεν μένει να περιμένει σιωπηλή
    if (!QUESTION.test(n) && !/[;;?]\s*$/.test(said)) return done({ route: "store", i: snap.stores.reduce((b, st, j) => (st.km < snap.stores[b].km ? j : b), 0), said, why: "nearest", ms: msStt });
  }
  // αντίρρηση («προτιμώ επαγωγική», «δεν θέλω τόσο μεγάλο») θέλει απάντηση, όχι να προχωρήσει το σενάριο σαν να είπε «ναι»
  const asked = QUESTION.test(n) || /[;;?]\s*$/.test(said) || beat.id === "idle" || /(?<!\p{L})(προτιμ|δεν θελ|δεν μου αρεσ|καλυτερα|δεν χρειαζ|οχι)/u.test(n);
  // ό,τι είπε για τις επόμενες ομάδες κρατιέται: όταν φτάσουμε εκεί, ο Ερμής δεν το ξαναρωτά
  const askAt = (k: CatKey) => beats.findIndex((b) => b.id === `${k}-ask`);
  const slots = beat.wait === "presenter" ? slotsIn(snap, said) : [];
  const learned = { ahead: slots.filter((x) => askAt(x.cat) > bi).map((x) => x.cat), alts: Object.fromEntries(slots.filter((x) => askAt(x.cat) > bi && x.alt).map((x) => [x.cat, x.alt])) as Alts };
  if (learned.ahead.length) M.alts = { ...alts, ...learned.alts };
  const reply = (o: Record<string, unknown>) => done({ ...o, ...(learned.ahead.length ? { learned } : {}) });
  // απάντησε ήδη και στο «γιατί ρωτάω» της τρέχουσας ομάδας (π.χ. «μεγάλος κάδος, για παπλώματα» πριν τη διευκρίνιση) → κατευθείαν στην απόφαση
  const cur = slots.find((x) => beat.id === `${x.cat}-ask` || beat.id === `${x.cat}-ask2`);
  if (cur && (!asked || (cur.alt && !QUESTION.test(n.replace(/^οχι\s*/, "")) && !/[;;?]\s*$/.test(said)))) { if (cur.alt) M.alts = { ...M.alts, [cur.cat]: cur.alt }; return reply({ route: "jump", to: `${cur.cat}-verdict`, cat: cur.cat, alt: cur.alt, said, ms: msStt }); }
  // στην αρχή ο παρουσιαστής μπορεί να πει μαζί τα νέα ΚΑΙ το «εξόπλισέ μου το σπίτι» → κατευθείαν στο «Ευχαρίστως, ας ξεκινήσουμε»
  // «συγχαρητήρια» μόνο αν είπε και τα νέα (Λάρισα/μετάθεση/θέση)· σκέτο «βοήθησέ με να εξοπλίσω» → «Ευχαρίστως, ας ξεκινήσουμε»
  if (beat.id === "idle" && /σπιτι|εξοπλ|βοηθ/.test(n) && beats.some((b) => b.id === "start")) return reply({ route: "jump", to: "start", both: /λαρισ|μεταθεσ|μετατεθ|θεση|νεα|μετακομ/.test(n), said, ms: msStt });
  // η απάντηση ορίζει μέγεθος (τ.μ., μέτρα): ο αριθμός που ακούστηκε διαλέγει διακλάδωση — πριν από το «ναι», γιατί «ναι, σαράντα» ≠ «ναι»
  const vc = snap.cats.find((c) => beats[bi + 1]?.id === `${c.key}-verdict`);
  // προτίμηση («θέλω επαγωγική», «όχι, επαγωγική», «έχετε τη Hisense;») = επιλογή → η διακλάδωση· μόνο η ερώτηση πληροφορίας
  // («γιατί όχι επαγωγική;», «τι διαφορά έχει;») πάει στην απάντηση, εκτός αν λέει μέγεθος με μονάδα
  const info = /^(?:(?:και|αλλα|ομως|ε|ναι|ερμη|δηλαδη)\s+)*(τι|πως|γιατι|ποσο|ποσα|ποσες|ποια ειναι|ποιο ειναι|ποτε)(?!\p{L})/u.test(n);
  const alt = vc && !(info && !/μετρ|τετραγων|τ μ|εκατοστ|ιντσ|χιλιαδ/.test(n)) ? altFor(vc, said) : null;
  if (vc && alt !== null) { M.alts = { ...M.alts, [vc.key]: alt || undefined }; return reply({ route: "alt", cat: vc.key, alt, said, ms: msStt }); }
  // οι «βαριές» λέξεις της ατάκας (νέα, Λάρισα, θέση…): αν ακούστηκαν οι μισές, είπε την ατάκα με δικά του λόγια
  const words = norm(cue).split(" ").filter((w) => w.length > 3), heard = new Set(n.split(" "));
  const content = words.length ? words.filter((w) => heard.has(w)).length / words.length : 0;
  // ο Ερμής περιμένει διευκρινιστική ερώτηση («Τι εννοείς;»): ό,τι σύντομο πει ο παρουσιαστής («δηλαδή;», «μεγάλο κάδο;», «πόσο μεγάλο;»)
  // οδηγεί στην εξήγηση του σεναρίου — όχι σε έτοιμη απάντηση για τα κιλά, που δεν έχουν ειπωθεί ακόμα
  // «βοήθησέ με με το σπίτι» με οποιαδήποτε λόγια (και ως ερώτηση: «τι χρειάζομαι για το σπίτι;») = η ατάκα
  if (beat.id === "hello" && /σπιτι|εξοπλ|βοηθ|χρειαζ/.test(n)) return reply({ route: "script", said, ms: msStt });
  // απάντησε κατευθείαν στο «πόσο μεγάλο κάδο;» («ναι», «μεγάλο», «ναι, μεγάλο») → χωρίς τη διευκρίνιση, στην απόφαση
  const fc = snap.cats.find((c) => c.lines.follow && beat.id === `${c.key}-ask`);
  if (fc && !asked && !/[;;?]\s*$/.test(said) && !/μικρ/.test(n) && !/(?<!\p{L})(δεν|οχι|μονο)(?!\p{L})/u.test(n) && (YES.test(n) || /μεγαλ|παπλωμ|κιλ|οικογεν|πολλ/.test(n))) return reply({ route: "jump", to: `${fc.key}-verdict`, cat: fc.key, alt: "", said, ms: msStt });
  const ev0: LiveEv = { n: Date.now(), phase: "thinking", q: said, quiet: true };
  const scene = sceneAt(beats, bi), cat = scene.cat ? snap.cats.find((c) => c.key === scene.cat) ?? null : null;
  const all = snap.cats.flatMap((c) => c.candidates);
  const toLive = (ids: string[]): LiveProduct[] => ids.flatMap((pid) => all.filter((p) => p.id === pid)).slice(0, 2).map((p) => ({ id: p.id, brand: p.brand, title: p.title, price: p.price, image: p.image, why: p.key }));
  const mem = M;
  // έτοιμες απαντήσεις (scripts/skets/qa.ts) που ταιριάζουν σε αυτό το σημείο: της ομάδας είτε πριν την επιλογή (pre) είτε για το προϊόν που ήδη διαλέξαμε
  // noready (μόνο σε δοκιμή): χωρίς έτοιμες απαντήσεις — για να γράψουμε νέες από το ζωντανό μοντέλο
  const here = tryMode && fd?.get("noready") === "1" ? [] : (snap.qa ?? []).filter((x) => !(x.cat && (x.cat !== scene.cat || !!x.pre === !!scene.picked[x.cat])) && !!x.start === (beat.id === "idle") && !!snap.voice[x.a]);
  const play = (best: { a: string; ids: string[]; score: number }, why?: string) => {
    const products = toLive(best.ids);
    products.forEach((p) => mem.products.set(p.id, p));
    mem.thread.push({ role: "user", text: said }, { role: "advisor", text: best.a });
    sendLive(ev0);
    const ev: LiveEv = { ...ev0, phase: "answer", text: best.a, products };
    sendLive(ev);
    sendLive({ ...ev, phase: "audio", audio: snap.voice[best.a], part: 0, parts: 1 });
    return reply({ route: "free", ready: true, said, say: best.a, score: Math.round(best.score * 100) / 100, why, ms: Date.now() - t0 });
  };
  const ready = () => {
    // σχεδόν ίδια διατύπωση → παίζει αμέσως, χωρίς μοντέλο· αλλιώς το μοντέλο διαλέγει από το νόημα (παρακάτω)
    let best: { a: string; ids: string[]; score: number } | null = null;
    for (const x of here) { const score = Math.max(...x.q.map((v) => fidelity(v, said))); if (!best || score > best.score) best = { a: x.a, ids: x.ids, score }; }
    return best && best.score >= 0.7 ? play(best) : null; // κάτω από 0.7 η ομοιότητα λέξεων μπερδεύει («τι διαστάσεις έχει» ≈ «τι διαφορά έχει») — αποφασίζει το μοντέλο από το νόημα
  };
  const qa = asked ? ready() : null;
  if (qa) return qa;
  if (beat.wait === "presenter" && /εννοει/.test(norm(cue)) && (n.split(" ").length <= 5 || /εννο|δηλαδ|διευκριν|εξηγ/.test(n))) return reply({ route: "script", said, ms: msStt });
  if (beat.wait === "presenter" && (fidelity(cue, said) >= 0.5 || content >= 0.5 || (YES.test(n) && !QUESTION.test(n.replace(/^(ναι|οκ)\s*/, ""))))) return reply({ route: "script", said, ms: msStt });

  // οι συσκευές και τα βήματα είναι σταθερά: ό,τι δεν είναι ερώτηση είναι η ατάκα του παρουσιαστή με δικά του λόγια → συνέχεια, αμέσως, χωρίς μοντέλο
  // σύντομο ή ξεκάθαρο (ναι/ατάκα) → συνέχεια αμέσως· μεγάλη πρόταση που δεν ταιριάζει με τίποτα → το μοντέλο αποφασίζει (μπορεί να είναι αντίρρηση ή άλλη επιλογή)
  const fid = fidelity(cue, said);
  if (!asked && (YES.test(n) || n.split(" ").length <= 2 || fid >= 0.3 || content >= 0.3 || beat.wait !== "presenter" || !/^«/.test(beat.cue ?? ""))) return reply({ route: "script", said, ms: msStt });
  // κάτι απρόβλεπτο: ο Ερμής απαντά ζωντανά από ό,τι ξέρουμε ήδη (σύντομη φράση αναμονής μόνο αν αργήσει)
  sendLive(ev0);
  const picks = snap.cats.flatMap((c) => (scene.picked[c.key] ? [pickOf(c, alts)] : []));
  // με τα τεχνικά χαρακτηριστικά: «πόσο νερό;», «πόσο θορυβεί;», «πόσες στροφές;» απαντιούνται από τα στοιχεία, όχι «δεν έχω στοιχεία»
  const line = (p: SkProduct) => `[${p.id}] ${p.brand} ${p.title} · ${p.key} · ${eur(p.price)} · ${p.chips.join(", ")}${p.summary ? `\n    ${p.summary}` : ""}${p.specs?.length ? `\n    ${p.specs.join(" · ")}` : ""}`;
  const ctx = [
    `Παρουσιαστής: ${snap.presenter.full}· εξοπλίζει σπίτι από το μηδέν.`,
    picks.length ? `Ήδη στο σπίτι:\n${picks.map(line).join("\n")}` : "",
    cat ? `Τώρα διαλέγουμε: ${cat.label}. Υποψήφια:\n${cat.candidates.map(line).join("\n")}` : "",
    "Τεχνικά (νερό, ρεύμα, θόρυβος, στροφές, διαστάσεις, Hz κ.λπ.): απάντα από τα χαρακτηριστικά κάθε προϊόντος, με αριθμούς ολογράφως· αν κάτι δεν υπάρχει εκεί, πες ότι δεν το έχεις μπροστά σου.",
    "Δόσεις, τρόποι πληρωμής, παράδοση, εγκατάσταση, εγγύηση: ΔΕΝ έχεις στοιχεία — πες ειλικρινά ότι θα τα επιβεβαιώσει στο κατάστημα, χωρίς να υπόσχεσαι τίποτα.",
    beat.wait === "store" ? `Στον χάρτη: ${snap.stores.map((x, n) => `${n + 1}. ${x.street} (${x.km.toLocaleString("el-GR", { maximumFractionDigits: 1 })} km)`).join(", ")}. Ο παρουσιαστής πρέπει να διαλέξει ένα (με το όνομα της οδού ή «το πρώτο»).` : "",
    cat && cat.candidates.some((p) => scene.rejected[p.id]) ? `Έχουν ήδη απορριφθεί: ${cat.candidates.filter((p) => scene.rejected[p.id]).map((p) => `${p.id} (${scene.rejected[p.id]})`).join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  // οι διακλαδώσεις του επόμενου βήματος απόφασης, για να τις διαλέξει το μοντέλο όταν οι λέξεις-κλειδιά δεν τις έπιασαν
  const vcM = vc ?? snap.cats.find((c) => beat.id === `${c.key}-ask` || beat.id === `${c.key}-ask2`);
  const altMenu = vcM ? [`"" = ${vcM.label} ${pickOf(vcM, {}).brand} ${pickOf(vcM, {}).key} (βασική πρόταση)`, ...(vcM.alts ?? []).map((a) => `"${a.key}" = ${pickOf(vcM, { [vcM.key]: a.key }).brand} ${pickOf(vcM, { [vcM.key]: a.key }).key} (${a.pickLine})`)].join("· ") : "";
  const r = await chat({
    feature: "skets-turn", model: "google/gemini-3.8-flash", json: true, maxTokens: 400, temperature: 0.4, reasoning: "low", accounting: "background", timeoutMs: 12000,
    messages: [
      { role: "system", content: `Είσαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics, σε ζωντανή παρουσίαση μπροστά σε κοινό. Το θέμα της παρουσίασης: εξοπλίζετε μαζί ένα σπίτι (πλυντήριο, ψυγείο, τηλεόραση, κλιματιστικό, κουζίνα) — αλλά ο παρουσιαστής μπορεί να μιλήσει και για οτιδήποτε άλλο· απάντα σε αυτό που είπε, χωρίς να γυρνάς συνέχεια στο σενάριο, στη μετακόμιση ή στην πόλη. Μιλάς με τον παρουσιαστή ευγενικά, ανθρώπινα αλλά με επαγγελματική απόσταση (πληθυντικός ευγενείας — δεν είστε φίλοι)· όταν τον προσφωνείς, πάντα «${snap.presenter.vocative}».
${beat.say ? `Ο Ερμής μόλις είπε: «${beat.say}»` : "Η παρουσίαση μόλις ξεκινά: ο Ερμής περιμένει τον παρουσιαστή να του μιλήσει πρώτος."}
Όλη η ροή (σταθερή — ίδια βήματα, ίδιες συσκευές· ΤΩΡΑ είμαστε στο βήμα με ►):
${flow(beats, bi)}
Η ατάκα που περιμένει το σενάριο από τον παρουσιαστή: «${cue}»
Μην προλαβαίνεις αποφάσεις του σεναρίου: μην προτείνεις συγκεκριμένο προϊόν ή μέγεθος πριν το πει ο Ερμής στο αντίστοιχο βήμα.
Οι συσκευές είναι σταθερές: μόνο όσες βλέπουμε στην οθόνη. Όταν ο παρουσιαστής διαλέγει ρητά κάτι από αυτές (π.χ. επαγωγική, άλλο μέγεθος), το σενάριο το ακολουθεί μόνο του — εσύ εδώ απαντάς σε ερωτήσεις: εξήγησε τίμια τη διαφορά από τα στοιχεία, πες ποια ταιριάζει και γιατί, και ρώτα τι προτιμά. Αν ζητήσει κάτι που δεν είναι στην οθόνη, πες το ευγενικά και πρότεινε το πιο κοντινό από τα υποψήφια.
Η ατάκα έρχεται από αναγνώριση ομιλίας και μπορεί να έχει λάθη ήχου: «Ρεμπέ», «Έρμη», «Ερμί» = «Ερμή»· κρίνε από το νόημα, όχι από τις λέξεις.
Αποφάσισε:
- route "script": αν ο παρουσιαστής ουσιαστικά απάντησε όπως περιμένει το σενάριο (ίδιο νόημα, με άλλα λόγια).${altMenu ? `
- route "alt": αν η απάντησή του ουσιαστικά διαλέγει ή υπονοεί μία από αυτές τις επιλογές (βάλε το "alt"· "" = η βασική): ${altMenu}. Π.χ. «μένουμε δύο, λίγα ρούχα» = μικρότερο, «το σαλόνι είναι τεράστιο» = μεγαλύτερο. Όταν η απάντηση δείχνει ήδη την επιλογή, διάλεξέ τη — ΜΗΝ ξαναρωτάς κάτι που ουσιαστικά απάντησε.` : ""}${beat.wait === "store" ? `
- route "store": αν διάλεξε κατάστημα (βάλε "store": 1, 2 ή 3· αν συμφωνεί χωρίς να πει ποιο → 1, το πιο κοντινό).` : ""}
${here.length ? `- route "ready": αν μία από αυτές τις έτοιμες (ηχογραφημένες) απαντήσεις απαντά σε αυτό που ΕΝΝΟΕΙ — ακόμα κι αν το είπε με άλλα λόγια ή η αναγνώριση ομιλίας έκανε λάθη· βάλε τον αριθμό στο "qa". Προτίμησέ τη από το "free" όταν ταιριάζει:
${here.map((x, j) => `  ${j + 1}. ερώτηση π.χ. «${x.q[0]}» → «${x.a}»`).join("\n")}
` : ""}- route "clarify": ΜΟΝΟ αν η ατάκα είναι τόσο μπερδεμένη (λάθη αναγνώρισης, μισές λέξεις) που δεν καταλαβαίνεις καθόλου τι εννοεί.
- route "free": αν ρώτησε κάτι, διαφώνησε, ζήτησε διευκρίνιση, χαιρέτησε ή είπε κάτι άλλο. Τότε γράψε στο "say" τι λέει ο Ερμής: 1–3 σύντομες, φυσικές προτάσεις (σε χαιρετισμό: χαιρέτα πίσω με το όνομά του, π.χ. «Καλησπέρα σας, ${snap.presenter.vocative}! Πώς μπορώ να σας βοηθήσω;» — ΠΟΤΕ μην προλαβαίνεις το σενάριο, π.χ. συγχαρητήρια πριν σου πει τα νέα), μόνο από τα στοιχεία παρακάτω (ποτέ τιμές/χαρακτηριστικά που δεν δίνονται). Πρώτα απάντησε πραγματικά σε αυτό που είπε (1–2 προτάσεις), μετά γύρνα ομαλά στο σενάριο: αν ο Ερμής είχε κάνει ερώτηση, ξαναθέσε την με άλλα λόγια (όχι αυτολεξεί), αλλιώς οδήγησε προς το επόμενο βήμα. Το όνομά του όχι σε κάθε απάντηση. Αριθμούς και μονάδες ολογράφως όπως λέγονται («εννιά κιλά», «πενήντα πέντε ίντσες»), μάρκες με λατινικά.
Στο "ids" βάλε 0–2 κωδικούς προϊόντων από τη λίστα που αναφέρεις (για να φανούν στην οθόνη).
JSON μόνο: {"route":"script"|"ready"|"free"|"alt"|"store"|"clarify","qa":1,"say":"...","ids":["..."],"alt":"...","store":1}
Στοιχεία:
${ctx}` },
      ...mem.thread.slice(-6).map((x) => ({ role: x.role === "user" ? ("user" as const) : ("assistant" as const), content: x.text })),
      { role: "user", content: said },
    ],
  }).catch((e) => { console.error("[skets turn]", e instanceof Error ? e.message : e); return null; });
  const out = parseJson<{ route?: string; say?: string; ids?: string[]; alt?: string; store?: number; qa?: number }>(r?.text ?? "");
  const pick = out?.route === "ready" ? here[(out.qa ?? 0) - 1] : undefined;
  if (pick) return play({ a: pick.a, ids: pick.ids, score: 0 }, "model");
  if (out?.route === "alt" && vcM && (out.alt === "" || vcM.alts?.some((a) => a.key === out.alt))) {
    sendLive({ ...ev0, phase: "resume" });
    M.alts = { ...M.alts, [vcM.key]: out.alt || undefined };
    // κατευθείαν στην απόφαση (και από το «Τι εννοείτε;» της ερώτησης): δεν ξαναρωτάμε ό,τι ήδη απάντησε
    return reply({ route: "jump", to: `${vcM.key}-verdict`, cat: vcM.key, alt: out.alt ?? "", said, why: "model", ms: Date.now() - t0 });
  }
  if (!out || out.route === "clarify") { const c = clarify(out ? "model-unclear" : "model-failed"); if (c) return c; }
  if (out?.route === "store" && beat.wait === "store" && snap.stores[(out.store ?? 0) - 1]) {
    sendLive({ ...ev0, phase: "resume" });
    // «1» = το πιο κοντινό στη σειρά του χάρτη
    return reply({ route: "store", i: (out.store ?? 1) - 1, said, why: "model", ms: Date.now() - t0 });
  }
  if (!out || out.route !== "free" || !out.say?.trim()) {
    sendLive({ ...ev0, phase: "resume" });
    // στον χάρτη το «σενάριο» είναι επιλογή καταστήματος: χωρίς κατάστημα δεν προχωράμε
    return reply({ route: beat.wait === "store" ? "none" : "script", said, ms: Date.now() - t0 });
  }
  const products = toLive(out.ids ?? []);
  products.forEach((p) => mem.products.set(p.id, p));
  mem.thread.push({ role: "user", text: said }, { role: "advisor", text: out.say });
  const ev: LiveEv = { ...ev0, phase: "answer", text: out.say.trim(), products };
  sendLive(ev);
  const msLlm = Date.now() - t0;
  const first = tryMode ? 0 : await speakParts(ev, req.headers.get("x-skets-key") ?? "");
  return reply({ route: "free", said, say: ev.text, ms: { stt: msStt, llm: msLlm - msStt, firstAudio: first } });
}
