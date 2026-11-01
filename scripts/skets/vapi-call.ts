/**
 * Σκετς Ερμή — δοκιμή κλήσης μέσω Vapi (SIP trunk 589 → κινητό), με έλεγχο ζωντανής απομαγνητοφώνησης και ήχου.
 *   npx tsx --conditions=react-server scripts/skets/vapi-call.ts [αριθμός]   (προεπιλογή SKETS_TEST_TO)
 *   npx tsx --conditions=react-server scripts/skets/vapi-call.ts --setup     (μόνο credentials / αριθμός / assistant)
 *   … --live    ζωντανή απομαγνητοφώνηση μέσω webhook: θέλει `ngrok http 3111` (ανοιχτό από τον χρήστη) και τον dev server στο 3111
 * Τυπώνει πόσες φράσεις έχει το API όσο τρέχει η κλήση και τι στέλνει το listenUrl. Δεν τυπώνει ποτέ κωδικούς.
 */
import "dotenv/config";
import { db } from "../../lib/db";
import { getSetting } from "../../lib/settings/store";
import { ensureAssistant, ensurePhone, startCall, callState } from "../../lib/skets/vapi";
import { callItems } from "../../lib/skets/script";
import snapshot from "../../lib/skets/snapshot.json";
import type { Snapshot } from "../../lib/skets/types";

const snap = snapshot as Snapshot;

(async () => {
  const { data } = await getSetting("ai");
  const voice = String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb");
  if (process.argv.includes("--setup")) { console.log("assistant", await ensureAssistant(voice), "· αριθμός", await ensurePhone()); return; }
  const to = process.argv.slice(2).find((a) => !a.startsWith("--")) || process.env.SKETS_TEST_TO!;
  const live = process.argv.includes("--live");
  const tunnel = live ? ((await (await fetch("http://127.0.0.1:4040/api/tunnels")).json()) as { tunnels: { public_url: string }[] }).tunnels.find((t) => t.public_url.startsWith("https"))?.public_url : undefined;
  if (live && !tunnel) throw new Error("Δεν βρέθηκε tunnel ngrok (ngrok http 3111)");
  const call = await startCall(to, { store: snap.stores[0].spoken, customer: snap.presenter.genitive, items: callItems(snap) }, voice, tunnel ? `${tunnel}/api/skets/vapi` : undefined);
  console.log("κλήση", call.id, call.status, "listenUrl:", call.listenUrl ? "ναι" : "όχι");

  // ζωντανός ήχος: τι έρχεται από το listenUrl (μορφή, ρυθμός)
  let frames = 0, bytes = 0, text = 0, eL = 0, eR = 0; // ενέργεια αριστερού/δεξιού καναλιού: ποιος μιλά σε ποιο

  await new Promise((r) => setTimeout(r, 9000)); // ο ήχος ανοίγει όταν σηκωθεί το τηλέφωνο
  if (call.listenUrl) {
    const ws = new WebSocket(call.listenUrl);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (m) => { if (typeof m.data === "string") { if (text++ < 3) console.log("listen text:", m.data.slice(0, 200)); } else { frames++; bytes += (m.data as ArrayBuffer).byteLength; const p = new Int16Array(m.data as ArrayBuffer); for (let j = 0; j + 1 < p.length; j += 2) { eL += Math.abs(p[j]); eR += Math.abs(p[j + 1]); } } };
    ws.onerror = (e) => console.log("listen error", String((e as ErrorEvent).message ?? e));
  }
  let last = 0;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const c = live
      ? await fetch(`http://localhost:3111/api/skets/call?id=${call.id}`, { headers: { "x-skets-key": process.env.SKETS_KEY! } }).then((r) => r.json()).then((j: { status: string; done: boolean; transcript: { who: "hermes" | "store"; text: string; final?: boolean }[] }) => ({ status: j.status, ended: j.done, endedReason: null, transcript: j.transcript.filter((t) => t.final) }))
      : await callState(call.id);
    const fresh = c.transcript.slice(last);
    last = c.transcript.length;
    console.log(`[${c.status} · ${c.transcript.length} φράσεις · ήχος ${frames} πλαίσια / ${Math.round(bytes / 1024)} KB · L ${Math.round(eL / 1e6)} R ${Math.round(eR / 1e6)}]`);
    eL = eR = 0;
    for (const t of fresh) console.log(`   ${t.who === "hermes" ? "Ερμής" : "Κινητό"}: ${t.text}`);
    if (c.ended) { console.log("τέλος:", c.endedReason); break; }
  }
  process.exit(0);
})().catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; }).finally(() => db.$disconnect());
