/**
 * Σκετς Ερμή — έτοιμες απαντήσεις: για κάθε ομάδα προϊόντων (και για τη γενική κουβέντα) γράφει τι μπορεί να πει ή να ρωτήσει
 * ο παρουσιαστής και τι απαντά ο Ερμής, από τα στοιχεία του snapshot, και τις ηχογραφεί. Στη σκηνή (/api/skets/turn) ό,τι
 * μοιάζει με έτοιμη ερώτηση απαντιέται αμέσως με ηχογραφημένη φράση — ο ζωντανός διάλογος χωρίς καθυστέρηση.
 *   npx tsx --conditions=react-server scripts/skets/qa.ts
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../../lib/db";
import { chat } from "../../lib/ai/openrouter";
import { speak } from "../../lib/voice/tts";
import { forVoice, SKETS_VOICE } from "../../lib/skets/script";
import type { CatKey, SkQA, Snapshot } from "../../lib/skets/types";

const snap = JSON.parse(readFileSync("lib/skets/snapshot.json", "utf8")) as Snapshot;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
const STYLE = `Ο Ερμής είναι ο ψηφιακός σύμβουλος της Euronics σε ζωντανή παρουσίαση. Σενάριο: ο παρουσιαστής ξεκινά νέα δουλειά στη Λάρισα και εξοπλίζει από την αρχή ένα σπίτι (πλυντήριο, ψυγείο, τηλεόραση, κλιματιστικό, κουζίνα). Μιλά στον παρουσιαστή (${snap.presenter.full}) ανθρώπινα αλλά με επαγγελματική απόσταση: πληθυντικός ευγενείας, τον λέει πάντα «${snap.presenter.vocative}». Απαντήσεις 1–3 σύντομες προτάσεις, μόνο από τα στοιχεία που δίνονται (ποτέ τιμές ή χαρακτηριστικά που δεν δίνονται — αν δεν ξέρει, το λέει ειλικρινά). Αριθμούς και μονάδες ολογράφως όπως λέγονται («εννιά κιλά», «πενήντα πέντε ίντσες», «δώδεκα χιλιάδες μονάδες»), μάρκες με λατινικά, ενεργειακή κλάση «κλάσης άλφα».`;

async function gen(cat: CatKey | null, brief: string, n: number, start = false): Promise<SkQA[]> {
  const r = await chat({
    feature: "skets-qa", model: "main", json: true, maxTokens: 2500, temperature: 0.5, reasoning: "low", timeoutMs: 90000,
    messages: [
      { role: "system", content: `${STYLE}\nΓράψε ${n} πιθανές παρεμβάσεις του παρουσιαστή (ερωτήσεις, απορίες, αντιρρήσεις, αστεία, σχόλια) σε αυτό το σημείο και την απάντηση του Ερμή. Για κάθε μία δώσε 3–4 διαφορετικές διατυπώσεις όπως θα τις έλεγε προφορικά. Η απάντηση τελειώνει ξαναπιάνοντας φυσικά τη ροή (την ερώτηση του σεναρίου, αν υπάρχει).\nJSON: {"items":[{"q":["..."],"a":"...","ids":["κωδικοί προϊόντων που αναφέρει, 0–2"]}]}` },
      { role: "user", content: brief },
    ],
  });
  // το μοντέλο μπορεί να τυλίξει το JSON σε ```json … ``` ή να βάλει κείμενο γύρω του
  const raw = r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1);
  const j = JSON.parse(raw) as { items?: { q?: string[]; a?: string; ids?: string[] }[] };
  return (j.items ?? []).filter((x) => x.a && x.q?.length).map((x) => ({ cat, q: x.q!.slice(0, 5), a: x.a!.trim(), ids: (x.ids ?? []).slice(0, 2), ...(start ? { start } : {}) }));
}

(async () => {
  const picks = snap.cats.map((c) => c.candidates.find((p) => p.id === c.pick)!);
  const qa: SkQA[] = [];
  qa.push(...await gen(null, `ΕΝΑΡΞΗ της παρουσίασης: ο παρουσιαστής μόλις ήρθε στη σκηνή και μιλά πρώτος στον Ερμή (χαιρετισμοί, «πώς είσαι», «ποιος είσαι», «με ακούς;», «είσαι έτοιμος;», αστεία). Ο Ερμής ΔΕΝ ξέρει ακόμα τίποτα: ούτε για Λάρισα, ούτε για δουλειά, ούτε για σπίτι — ΜΗΝ τα αναφέρεις και ΜΗΝ δίνεις συγχαρητήρια. Κάθε απάντηση τελειώνει ρωτώντας φυσικά τι νέα έχει / πώς μπορεί να βοηθήσει, ώστε ο παρουσιαστής να πει τα νέα του.`, 8, true));
  qa.push(...await gen(null, `Γενική κουβέντα, έξω από συγκεκριμένη συσκευή: χαιρετισμοί («καλημέρα», «πώς είσαι»), «ποιος είσαι;», «τι μπορείς να κάνεις;», «είσαι άνθρωπος;», «από πού τα ξέρεις αυτά;», ευχαριστίες, αστεία. Ο παρουσιαστής μόλις πήρε μετάθεση στη Λάρισα και εξοπλίζει σπίτι από το μηδέν. Ο Ερμής ξέρει τον κατάλογο της Euronics και τα καταστήματα. Είμαστε ήδη μέσα στην επιλογή των συσκευών.`, 10));
  for (const c of snap.cats) {
    const steps = [c.lines.ask, c.lines.follow?.ask, c.lines.verdict, c.lines.verdict2].filter(Boolean).join(" / ");
    qa.push(...await gen(c.key, `Ομάδα: ${c.label}. Ο Ερμής λέει σε αυτό το σημείο: ${steps}\nΥποψήφια (κωδικός, μάρκα, τίτλος, μέγεθος, τιμή, χαρακτηριστικά):\n${c.candidates.map((p) => `[${p.id}] ${p.brand} ${p.title} · ${p.key} · ${eur(p.price)} · ${p.chips.join(", ")}`).join("\n")}\nΑπορρίπτονται: ${c.reject.concat(c.reject2).map((r) => `${r.id} (${r.reason})`).join(", ")}. Επιλογή: ${c.pick}.\nΉδη στο σπίτι (με τη σειρά): ${picks.map((p) => `${p.brand} ${p.key}`).join(", ")}.`, 8));
    process.stdout.write(`${c.label} ✓ `);
  }
  snap.qa = qa;
  let rec = 0;
  for (const x of qa) { const v = await speak(forVoice(x.a), SKETS_VOICE); if (v) { snap.voice[x.a] = v.url; rec++; } }
  writeFileSync("lib/skets/snapshot.json", JSON.stringify(snap, null, 1));
  console.log(`\n→ ${qa.length} έτοιμες απαντήσεις, ${rec} ηχογραφημένες`);
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
