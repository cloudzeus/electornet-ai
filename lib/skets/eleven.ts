import "server-only";

/**
 * Η κλήση του σκετς: agent ElevenLabs «Ερμής — σκετς» → αριθμός sip_trunk (το extension SIP_USER στο SIP_HOST) → κινητό.
 * Ο agent και ο αριθμός φτιάχνονται μία φορά και βρίσκονται ξανά με το όνομα/label τους. Κανένας κωδικός δεν επιστρέφεται.
 */
const API = "https://api.elevenlabs.io/v1/convai";
const AGENT_NAME = "Ερμής — σκετς";
const label = () => `Euronics SIP ${process.env.SIP_USER}`;

async function el<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "Content-Type": "application/json", ...init.headers }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const AGENT_PROMPT = `Είσαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics. Μιλάς ελληνικά, ζεστά και φυσικά, με σύντομες προτάσεις, σαν έμπειρος πωλητής στο τηλέφωνο.
Καλείς ${"{{store}}"} της Euronics στη Λάρισα για λογαριασμό του πελάτη {{customer}}, που μόλις πήρε μετάθεση στη Λάρισα και εξοπλίζει το σπίτι του από το μηδέν.
Μαζί του διαλέξατε ήδη συγκεκριμένα μοντέλα, που στο σύστημα φαίνονται διαθέσιμα σε αυτό το κατάστημα: {{items}}.
Πορεία της κλήσης:
1. Μόλις σου απαντήσουν, πες με δύο-τρεις σύντομες προτάσεις ότι ο πελάτης θέλει να παραλάβει σήμερα πέντε συσκευές και ανέφερέ τες με μάρκα και μέγεθος (π.χ. «ένα πλυντήριο Bosch δέκα κιλών»). Τους κωδικούς μοντέλων τους λες μόνο αν σου τους ζητήσουν, αργά και καθαρά.
2. Κάνε την ερώτηση της κράτησης ως ξεχωριστή, σύντομη πρόταση που τελειώνει σε «?», π.χ. «Μπορείτε να του τα κρατήσετε για σήμερα?» — όχι κολλημένη στο τέλος μεγάλης πρότασης. ΔΕΝ ρωτάς «τι έχετε» — ξέρεις ήδη τα μοντέλα.
3. Αν κάτι λείπει, ρώτα πότε έρχεται ή ποιο αντίστοιχο προτείνουν.
4. ΜΟΝΟ αφού σου απαντήσουν ότι τα κρατάνε (ποτέ στην ίδια σειρά με την ερώτησή σου): επιβεβαίωσε με μία σύντομη πρόταση, ευχαρίστησε και τελείωσε με τη φράση «Καλή συνέχεια!». Μην κλείνεις την κλήση πριν πεις αυτή τη φράση.
Κανόνες: μην επινοείς τιμές ή χαρακτηριστικά πέρα από όσα σου δόθηκαν· μην επαναλαμβάνεις τον εαυτό σου· αν σε διακόψει θόρυβος ή κουβέντα που δεν απευθύνεται σε σένα, συνέχισε από εκεί που έμεινες.
Αριθμούς και μονάδες γράφε όπως λέγονται: «δώδεκα χιλιάδων μπι-τι-γιου» (ποτέ «BTU»), «δέκα κιλών», «πενήντα πέντε ιντσών», «ενεργειακής κλάσης άλφα» (ποτέ σκέτο γράμμα), «Euronics» γράφεται πάντα με λατινικούς.
Στις ερωτήσεις γράφε πάντα το λατινικό ερωτηματικό «?» και ΠΟΤΕ το ελληνικό «;» — αλλιώς η φωνή δεν τις τονίζει σαν ερώτηση.`;

/** Δήλωση, όχι ερώτηση: η φωνή τονίζει καλύτερα, και ο θεατής-κατάστημα απαντά φυσικά «ναι, πείτε μου». */
export const FIRST_MESSAGE = "Καλησπέρα σας! Είμαι ο Ερμής, ο ψηφιακός σύμβουλος της Euronics. Σας τηλεφωνώ για έναν πελάτη μας. Θα ήθελε να περάσει σήμερα από το κατάστημά σας.";

function agentConfig(voiceId: string) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        language: "el",
        first_message: FIRST_MESSAGE,
        prompt: { prompt: AGENT_PROMPT, built_in_tools: { end_call: { name: "end_call", description: "Κλείνει την κλήση. Μόνο αφού το κατάστημα επιβεβαιώσει την κράτηση ΚΑΙ έχεις ήδη πει «Καλή συνέχεια!» — ποτέ μαζί με ερώτηση.", params: { system_tool_type: "end_call" } } } },
        dynamic_variables: { dynamic_variable_placeholders: { store: "το κατάστημα", customer: "Δημήτρη Δριβάκου", items: "ένα πλυντήριο ρούχων" } },
      },
      tts: { voice_id: voiceId, model_id: "eleven_flash_v2_5" },
      // ο θεατής-κατάστημα θα είναι σε αίθουσα με κόσμο: να μην κόβεται ο Ερμής από κάθε θόρυβο
      turn: { turn_eagerness: "patient" },
    },
  };
}

/** Βρίσκει τον agent (και του περνά το τρέχον prompt) ή τον φτιάχνει. */
export async function ensureAgent(voiceId: string): Promise<string> {
  const { agents } = await el<{ agents: { agent_id: string; name: string }[] }>("/agents?page_size=100");
  const found = agents.find((a) => a.name === AGENT_NAME);
  if (found) { await el(`/agents/${found.agent_id}`, { method: "PATCH", body: JSON.stringify(agentConfig(voiceId)) }); return found.agent_id; }
  return (await el<{ agent_id: string }>("/agents/create", { method: "POST", body: JSON.stringify(agentConfig(voiceId)) })).agent_id;
}

export async function ensurePhone(): Promise<string> {
  const list = await el<{ phone_number_id: string; label: string }[]>("/phone-numbers");
  const found = list.find((p) => p.label === label());
  if (found) return found.phone_number_id;
  const { SIP_HOST, SIP_PORT, SIP_TRANSPORT, SIP_USER, SIP_PASS } = process.env;
  if (!SIP_HOST || !SIP_USER || !SIP_PASS) throw new Error("Λείπουν SIP_HOST / SIP_USER / SIP_PASS στο .env");
  return (await el<{ phone_number_id: string }>("/phone-numbers", {
    method: "POST",
    body: JSON.stringify({ provider: "sip_trunk", label: label(), phone_number: SIP_USER, outbound_trunk_config: { address: `${SIP_HOST}:${SIP_PORT || 5060}`, transport: SIP_TRANSPORT || "tcp", media_encryption: "disabled", credentials: { username: SIP_USER, password: SIP_PASS } } }),
  })).phone_number_id;
}

export interface CallVars { store: string; customer: string; items: string }
export async function startCall(to: string, vars: CallVars, voiceId: string): Promise<{ conversationId: string }> {
  const [agent, phone] = await Promise.all([ensureAgent(voiceId), ensurePhone()]);
  const r = await el<{ success: boolean; message: string; conversation_id: string | null }>("/sip-trunk/outbound-call", {
    method: "POST",
    body: JSON.stringify({ agent_id: agent, agent_phone_number_id: phone, to_number: to, conversation_initiation_client_data: { dynamic_variables: vars } }),
  });
  if (!r.success || !r.conversation_id) throw new Error(r.message || "Η κλήση δεν ξεκίνησε");
  return { conversationId: r.conversation_id };
}

export interface CallState { status: string; done: boolean; seconds: number | null; transcript: { who: "hermes" | "store"; text: string }[] }
export async function callState(conversationId: string): Promise<CallState> {
  const c = await el<{ status: string; transcript?: { role: string; message: string | null }[]; metadata?: { call_duration_secs?: number } }>(`/conversations/${encodeURIComponent(conversationId)}`);
  return {
    status: c.status, done: c.status === "done" || c.status === "failed", seconds: c.metadata?.call_duration_secs ?? null,
    transcript: (c.transcript ?? []).filter((t) => t.message).map((t) => ({ who: t.role === "agent" ? "hermes" : "store", text: t.message! })),
  };
}
