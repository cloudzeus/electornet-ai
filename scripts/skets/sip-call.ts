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

(async () => {
  const { data } = await getSetting("ai");
  const voice = String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb");
  if (process.argv.includes("--setup")) { console.log("agent", await ensureAgent(voice), "· αριθμός", await ensurePhone()); return; }
  const to = process.argv[2] || process.env.SKETS_TEST_TO!;
  const { conversationId } = await startCall(to, { store: "το κατάστημα της Ηπείρου", customer: "Γιάννη Κοζύρη", items: "ένα πλυντήριο ρούχων 9 κιλών και ένα ψυγείο" }, voice);
  console.log("κλήση", conversationId);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const c = await callState(conversationId);
    process.stdout.write(`[${c.status}] `);
    if (c.done) {
      console.log("\nδιάρκεια", c.seconds, "s");
      for (const t of c.transcript) console.log(`${t.who === "hermes" ? "Ερμής" : "Κινητό"}: ${t.text}`);
      return;
    }
  }
})().catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; }).finally(() => db.$disconnect());
