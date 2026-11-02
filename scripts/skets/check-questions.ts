/** Μετά από ηχογράφηση (prep.ts --voice-only): ελέγχει ότι κάθε ερώτηση του Ερμή ακούγεται ως ερώτηση.
 *   npx tsx --conditions=react-server scripts/skets/check-questions.ts */
import { transcribe } from "../../lib/voice/stt";
import snapshot from "../../lib/skets/snapshot.json";
import type { Snapshot } from "../../lib/skets/types";
// έλεγχος τόνου: κάθε ηχογραφημένη ερώτηση πρέπει να απομαγνητοφωνείται με «;» στο τέλος (το STT βάζει στίξη από τον τόνο)
const s = snapshot as Snapshot;
(async () => {
  const qs = Object.entries(s.voice).filter(([t]) => /[;?]»?$/.test(t.trim()));
  let bad = 0;
  for (let i = 0; i < qs.length; i += 4) await Promise.all(qs.slice(i, i + 4).map(async ([t, url]) => {
    const b = Buffer.from(await (await fetch(url)).arrayBuffer());
    const r = await transcribe(b, "audio/mpeg", "q.mp3");
    if (!r.ok) { console.log("?", t.slice(-60), "(STT απέτυχε)"); return; }
    const ok = /[;?;]\s*$/.test(r.text.trim());
    if (!ok) bad++;
    console.log(ok ? "✓" : "✗", t.slice(-60), "→", r.text.trim().slice(-40));
  }));
  console.log(`${qs.length - bad}/${qs.length} ερωτήσεις ακούγονται ως ερωτήσεις`);
  process.exit(0);
})();
