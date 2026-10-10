/**
 * Αυτόματη πρόταση ονόματος για τα μέλη ενός set «εξαρτημάτων», όταν η διαχείριση δεν έχει ορίσει δικό της:
 * κλιματιστικά → «Εσωτερική μονάδα <μοντέλο>» / «Εξωτερική μονάδα <μοντέλο>» από τον κωδικό του ERP:
 * -I / -O, IN / OUT, INDOOR / OUTDOOR, και κωδικοί κατασκευαστών (Fujitsu ASY / AOY, Daikin FTX / RX, Samsung …NEU / …XEU).
 * Αν δεν αναγνωρίζεται: σε κλιματιστικό δύο μελών, το κύριο είδος είναι η εσωτερική και το άλλο η εξωτερική.
 */
const INDOOR = /(-I\b|\bIN\b|\bINDOOR\b|ΕΣΩΤ|^AS[A-Z]|^F[A-Z]{2}\d|NEU\b)/i;
const OUTDOOR = /(-O\b|\bOUT\b|\bOUTDOOR\b|ΕΞΩΤ|^AO[A-Z]|^R[XKZ][A-Z]?\d|XEU\b)/i;

export function suggestSetLabel(memberName: string, setName: string, ctx?: { isMain: boolean; members: number }): string | null {
  if (!/κλιματιστ|air ?condition|inverter/i.test(setName)) return null;
  const model = memberName.trim().split(/\s+/)[0] ?? "";
  const out = OUTDOOR.test(memberName), inn = INDOOR.test(memberName);
  if (out && !inn) return `Εξωτερική μονάδα ${model}`.trim();
  if (inn && !out) return `Εσωτερική μονάδα ${model}`.trim();
  if (ctx?.members === 2) return `${ctx.isMain ? "Εσωτερική" : "Εξωτερική"} μονάδα ${model}`.trim();
  return null;
}
