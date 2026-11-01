import "server-only";
import { AGENT_PROMPT, FIRST_MESSAGE } from "./eleven";

/**
 * Η κλήση του σκετς μέσω Vapi (εναλλακτικά του ElevenLabs Agents): δίνει ζωντανή απομαγνητοφώνηση και ζωντανό ήχο
 * (`monitor.listenUrl`) χωρίς Enterprise. Ίδια φωνή Ερμή (ElevenLabs, με το δικό μας κλειδί), ίδιος SIP trunk (extension SIP_USER).
 * Η φωνή περνά από τον λογαριασμό ElevenLabs του Vapi (το δικό μας κλειδί είναι περιορισμένο και το Vapi δεν το δέχεται):
 * δουλεύει γιατί η φωνή του Ερμή είναι από τη δημόσια βιβλιοθήκη.
 * Τα credentials, ο αριθμός και ο assistant φτιάχνονται μία φορά και βρίσκονται ξανά με το όνομά τους.
 */
const API = "https://api.vapi.ai";
const NAME = "Ερμής — σκετς";

async function vapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY ?? ""}`, "Content-Type": "application/json", ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
type Named = { id: string; name?: string; provider?: string };
const find = async (path: string, name: string, provider?: string) => (await vapi<Named[]>(path)).find((x) => x.name === name && (!provider || x.provider === provider));

async function ensureTrunk(): Promise<string> {
  const name = `${NAME} · SIP ${process.env.SIP_USER}`;
  const found = await find("/credential", name, "byo-sip-trunk");
  if (found) return found.id;
  const { SIP_HOST, SIP_PORT, SIP_TRANSPORT, SIP_USER, SIP_PASS, SIP_HOST_IP } = process.env;
  if (!SIP_HOST || !SIP_USER || !SIP_PASS) throw new Error("Λείπουν SIP_HOST / SIP_USER / SIP_PASS στο .env");
  return (await vapi<Named>("/credential", {
    method: "POST",
    body: JSON.stringify({
      provider: "byo-sip-trunk", name,
      gateways: [{ ip: SIP_HOST_IP || SIP_HOST, port: Number(SIP_PORT || 5060), outboundEnabled: true, inboundEnabled: false, outboundProtocol: SIP_TRANSPORT || "tcp" }],
      outboundAuthenticationPlan: { authUsername: SIP_USER, authPassword: SIP_PASS },
      outboundLeadingPlusEnabled: false,
    }),
  })).id;
}

export async function ensurePhone(): Promise<string> {
  const name = `${NAME} · ${process.env.SIP_USER}`;
  const found = await find("/phone-number", name);
  if (found) return found.id;
  const credentialId = await ensureTrunk();
  return (await vapi<Named>("/phone-number", { method: "POST", body: JSON.stringify({ provider: "byo-phone-number", name, number: process.env.SIP_USER, numberE164CheckEnabled: false, credentialId }) })).id;
}

function assistantConfig(voiceId: string) {
  return {
    name: NAME,
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    // Vapi: μεταβλητές με {{…}} (Liquid) — ίδιες με του ElevenLabs agent
    model: { provider: "openai", model: "gpt-4.1", temperature: 0.4, messages: [{ role: "system", content: AGENT_PROMPT }] },
    voice: { provider: "11labs", voiceId, model: "eleven_flash_v2_5", stability: 0.5, similarityBoost: 0.8 },
    transcriber: { provider: "deepgram", model: "nova-3", language: "el" },
    // ο θεατής-κατάστημα θα είναι σε αίθουσα με κόσμο: όχι διακοπή από κάθε θόρυβο
    stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.5, backoffSeconds: 1 },
    monitorPlan: { listenEnabled: true, controlEnabled: true },
    // όχι εργαλείο endCall: το μοντέλο το καλούσε μαζί με την ερώτηση και έκλεινε πριν απαντήσει το κατάστημα.
    // Η κλήση κλείνει αφού ειπωθεί ολόκληρη η φράση αποχαιρετισμού.
    endCallFunctionEnabled: false,
    endCallPhrases: ["Καλή συνέχεια"],
    maxDurationSeconds: 300,
  };
}

export async function ensureAssistant(voiceId: string): Promise<string> {
  const found = await find("/assistant", NAME);
  if (found) { await vapi(`/assistant/${found.id}`, { method: "PATCH", body: JSON.stringify(assistantConfig(voiceId)) }); return found.id; }
  return (await vapi<Named>("/assistant", { method: "POST", body: JSON.stringify(assistantConfig(voiceId)) })).id;
}

export interface VapiCall { id: string; status: string; listenUrl: string | null; controlUrl: string | null }
/** `webhook`: δημόσια διεύθυνση του /api/skets/vapi (σε παρουσίαση από laptop: tunnel ngrok) για ζωντανή απομαγνητοφώνηση. */
export async function startCall(to: string, vars: { store: string; customer: string; items: string }, voiceId: string, webhook?: string): Promise<VapiCall> {
  const [assistantId, phoneNumberId] = await Promise.all([ensureAssistant(voiceId), ensurePhone()]);
  const c = await vapi<{ id: string; status: string; monitor?: { listenUrl?: string; controlUrl?: string } }>("/call", {
    method: "POST",
    body: JSON.stringify({ assistantId, phoneNumberId, customer: { number: to, numberE164CheckEnabled: false }, assistantOverrides: { variableValues: vars, ...(webhook ? { server: { url: webhook, secret: process.env.SKETS_KEY }, serverMessages: ["transcript", "status-update", "end-of-call-report"] } : {}) } }),
  });
  return { id: c.id, status: c.status, listenUrl: c.monitor?.listenUrl ?? null, controlUrl: c.monitor?.controlUrl ?? null };
}

export interface VapiState { status: string; ended: boolean; endedReason: string | null; transcript: { who: "hermes" | "store"; text: string }[] }
export async function callState(id: string): Promise<VapiState> {
  const c = await vapi<{ status: string; endedReason?: string; messages?: { role: string; message?: string }[]; artifact?: { messages?: { role: string; message?: string }[] } }>(`/call/${encodeURIComponent(id)}`);
  const msgs = c.artifact?.messages ?? c.messages ?? [];
  return {
    status: c.status, ended: c.status === "ended", endedReason: c.endedReason ?? null,
    transcript: msgs.filter((m) => (m.role === "bot" || m.role === "assistant" || m.role === "user") && m.message).map((m) => ({ who: m.role === "user" ? "store" : "hermes", text: m.message! })),
  };
}
