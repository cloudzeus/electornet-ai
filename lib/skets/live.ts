import "server-only";

/**
 * Ζωντανή απομαγνητοφώνηση της κλήσης όπως τη στέλνει το Vapi (webhook /api/skets/vapi), στη μνήμη της διεργασίας ανά κλήση.
 * Οι πρόχειρες φράσεις (partial) αντικαθιστούν η μία την άλλη μέχρι να έρθει η τελική — έτσι ο υπότιτλος «γράφεται» ζωντανά.
 */
export interface LiveLine { who: "hermes" | "store"; text: string; final: boolean }
interface LiveCall { lines: LiveLine[]; status: string; endedReason: string | null; at: number }

const g = globalThis as unknown as { __sketsLive?: Map<string, LiveCall> };
const calls = (g.__sketsLive ??= new Map());
const get = (id: string) => { let c = calls.get(id); if (!c) { c = { lines: [], status: "queued", endedReason: null, at: Date.now() }; calls.set(id, c); if (calls.size > 50) calls.delete(calls.keys().next().value!); } return c; };

export function addTranscript(id: string, who: LiveLine["who"], text: string, final: boolean) {
  const c = get(id), last = c.lines.at(-1);
  if (last && last.who === who && !last.final) { last.text = text; last.final = final; }
  else c.lines.push({ who, text, final });
  c.at = Date.now();
}
export function setStatus(id: string, status: string, endedReason?: string | null) { const c = get(id); c.status = status; if (endedReason) c.endedReason = endedReason; c.at = Date.now(); }
export const liveCall = (id: string) => calls.get(id) ?? null;
