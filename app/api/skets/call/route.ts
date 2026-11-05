import { NextResponse } from "next/server";
import { sketsReq } from "@/lib/skets/auth";
import { startCall, callState } from "@/lib/skets/eleven";
import { startCall as vapiCall } from "@/lib/skets/vapi";
import { liveCall, type LiveLine } from "@/lib/skets/live";
import { getSetting } from "@/lib/settings/store";
import snapshot from "@/lib/skets/snapshot.json";
import type { Alts, Snapshot } from "@/lib/skets/types";
import { callItems } from "@/lib/skets/script";

export const maxDuration = 30;
const snap = snapshot as Snapshot;

/** Δημόσια διεύθυνση για το webhook του Vapi: SKETS_WEBHOOK_BASE, αλλιώς το tunnel ngrok του laptop, αλλιώς η ίδια η σελίδα αν είναι δημόσια. */
async function webhookBase(req: Request): Promise<string | null> {
  if (process.env.SKETS_WEBHOOK_BASE) return process.env.SKETS_WEBHOOK_BASE.replace(/\/$/, "");
  const ngrok = await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(1500) }).then((r) => r.json() as Promise<{ tunnels: { public_url: string }[] }>).catch(() => null);
  const t = ngrok?.tunnels.find((x) => x.public_url.startsWith("https"))?.public_url;
  if (t) return t;
  // πίσω από το Coolify το req.url είναι η εσωτερική διεύθυνση (http://0.0.0.0:3000): η δημόσια έρχεται στα x-forwarded-*
  const h = req.headers, u = new URL(req.url);
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || u.host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  return /^https:\/\/(?!localhost|127\.|0\.0\.0\.0)/.test(origin) ? origin : null;
}

/** Ό,τι γράφει λάθος η αναγνώριση ομιλίας στους υπότιτλους. */
const FIXES: [RegExp, string][] = [
  [/\b(Uronix|Euronix)\b/gi, "Euronics"], [/Γιουρόνικς/gi, "Euronics"], [/φουτζίτσου/gi, "Fujitsu"], [/μποσκ|ποσγει?ο/gi, "Bosch"], [/Δρυβάκ/g, "Δριβάκ"],
];
const fix = (t: string) => FIXES.reduce((s, [a, b]) => s.replace(a, b), t);
/** Οι φράσεις έρχονται κομμάτια· ενώνονται ανά ομιλητή σε μία «φούσκα» μέχρι να μιλήσει ο άλλος. */
function bubbles(lines: LiveLine[]) {
  const out: { who: LiveLine["who"]; text: string }[] = [];
  for (const l of lines) { const last = out.at(-1); if (last && last.who === l.who) last.text += " " + fix(l.text); else out.push({ who: l.who, text: fix(l.text) }); }
  return out;
}

/**
 * POST { store } → ο Ερμής καλεί το SKETS_CALL_TO (ή το SKETS_TEST_TO σε πρόβα) για το κατάστημα που διάλεξε ο
 * παρουσιαστής, με τα προϊόντα που μπήκαν στο σπίτι (και τα `extras` που πρόσθεσε ζωντανά το κοινό). GET ?id= → κατάσταση και απομαγνητοφώνηση για τους υπότιτλους.
 */
export async function POST(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { store?: number; rehearsal?: boolean; extras?: string[]; alts?: Alts };
  const store = snap.stores[b.store ?? -1];
  const to = (b.rehearsal ? process.env.SKETS_TEST_TO : process.env.SKETS_CALL_TO) || process.env.SKETS_TEST_TO;
  if (!store || !to) return NextResponse.json({ error: !store ? "άγνωστο κατάστημα" : "λείπει SKETS_CALL_TO / SKETS_TEST_TO" }, { status: 400 });
  const { data } = await getSetting("ai");
  const voice = String(data.elevenVoiceId || "JBFqnCBsd6RMkjVDRZzb");
  // ό,τι πρόσθεσε ζωντανά το κοινό (ερώτηση εκτός σεναρίου) μπαίνει στη λίστα της κλήσης
  const extras = (Array.isArray(b.extras) ? b.extras : []).filter((x) => typeof x === "string").map((x) => x.slice(0, 120)).slice(0, 4);
  const vars = { store: store.spoken, customer: snap.presenter.genitive, items: callItems(snap, b.alts && typeof b.alts === "object" ? b.alts : {}) + (extras.length ? `, και επιπλέον ${extras.join(", ")}` : "") };
  // Vapi πρώτα (ζωντανοί υπότιτλοι + ήχος), αν υπάρχει κλειδί και δημόσια διεύθυνση για το webhook· αλλιώς ElevenLabs
  const base = process.env.VAPI_API_KEY ? await webhookBase(req) : null;
  if (process.env.VAPI_API_KEY && !base) console.warn("skets call: Vapi χωρίς δημόσια διεύθυνση webhook → ElevenLabs (βάλε SKETS_WEBHOOK_BASE)");
  if (base) {
    try {
      const c = await vapiCall(to, vars, voice, `${base}/api/skets/vapi`);
      return NextResponse.json({ id: c.id, provider: "vapi", listenUrl: c.listenUrl });
    } catch (e) { console.warn("skets vapi:", (e as Error).message); }
  }
  try {
    const r = await startCall(to, vars, voice);
    return NextResponse.json({ id: r.conversationId, provider: "eleven", listenUrl: null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function GET(req: Request) {
  if (!sketsReq(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  // το τηλεχειριστήριο ελέγχει πριν την παράσταση: χωρίς Vapi η κλήση γίνεται από το ElevenLabs και οι υπότιτλοι έρχονται μόνο στο τέλος
  if (q.has("check")) {
    const env = !!process.env.VAPI_API_KEY && !!process.env.SIP_USER && !!process.env.SIP_HOST;
    const base = env ? await webhookBase(req) : null;
    return NextResponse.json({ live: env && !!base, why: !env ? "λείπουν VAPI_API_KEY / SIP_*" : !base ? "δεν βρέθηκε δημόσια διεύθυνση για το webhook (SKETS_WEBHOOK_BASE)" : null });
  }
  const id = q.get("id");
  if (!id || !/^(conv_[a-z0-9]+|[0-9a-f-]{36})$/i.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  // Vapi: ζωντανή απομαγνητοφώνηση από το webhook
  if (!id.startsWith("conv_")) {
    const c = liveCall(id);
    return NextResponse.json({ status: c?.status ?? "queued", done: c?.status === "ended", seconds: null, transcript: bubbles(c?.lines ?? []) });
  }
  try { return NextResponse.json(await callState(id)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
