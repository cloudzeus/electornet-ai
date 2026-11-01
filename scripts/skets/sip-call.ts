/**
 * Σκετς Ερμή — δοκιμή εξερχόμενης κλήσης (agent ElevenLabs → SIP trunk → κινητό), έξω από τη σκηνή.
 *   npx tsx --conditions=react-server scripts/skets/sip-call.ts [αριθμός]     (προεπιλογή SKETS_TEST_TO)
 *   npx tsx --conditions=react-server scripts/skets/sip-call.ts --setup       (μόνο ενημέρωση agent / αριθμού)
 * Δεν τυπώνει ποτέ κωδικούς.
 */
import "dotenv/config";
import { db } from "../../lib/db";
import { getSetting } from "../../lib/settings/store";
import { ensureAgent, ensurePhone, startCall, callState } from "../../lib/skets/eleven";
import { callItems } from "../../lib/skets/script";
import snapshot from "../../lib/skets/snapshot.json";
import type { Snapshot } from "../../lib/skets/types";

(async () => {
  const { data } = await getSetting("ai");
  const voice = String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb");
  if (process.argv.includes("--setup")) { console.log("agent", await ensureAgent(voice), "· αριθμός", await ensurePhone()); return; }
  const to = process.argv[2] || process.env.SKETS_TEST_TO!;
  const { conversationId } = await startCall(to, { store: (snapshot as Snapshot).stores[0].spoken, customer: (snapshot as Snapshot).presenter.genitive, items: callItems(snapshot as Snapshot) }, voice);
  console.log("κλήση", conversationId);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const c = await callState(conversationId);
    // ζωντανή απομαγνητοφώνηση; πόσες φράσεις έχει ήδη το API όσο η κλήση τρέχει
    process.stdout.write(`[${c.status} ${c.transcript.length}${c.transcript.length ? ` «${c.transcript.at(-1)!.text.slice(0, 30)}»` : ""}]\n`);
    if (c.done) {
      console.log("\nδιάρκεια", c.seconds, "s");
      for (const t of c.transcript) console.log(`${t.who === "hermes" ? "Ερμής" : "Κινητό"}: ${t.text}`);
      return;
    }
  }
})().catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; }).finally(() => db.$disconnect());
