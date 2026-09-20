import "server-only";
import iconv from "iconv-lite";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/store";

/**
 * SoftOne ERP client over the official s1services (softone.gr/ws).
 * - two-step auth: login → authenticate; clientID cached in the DB for the day
 * - every response is Windows-1253 → decoded with iconv-lite, never res.json()
 * - re-auth only on error -101 / -100
 * Credentials come from Settings → «SoftOne ERP» (encrypted), env vars as fallback.
 */
export interface S1Config {
  /** full s1services URL, or just the oncloud serial */
  url: string;
  appId: string;
  username: string;
  password: string;
  company: string;
  branch: string;
  module: string;
  refid: string;
}

export async function getS1Config(): Promise<S1Config | null> {
  const { data, secrets } = await getSetting("softone");
  const cfg: S1Config = {
    url: String(data.url ?? data.serial ?? process.env.S1_URL ?? process.env.S1_SERIAL ?? ""),
    appId: String(data.appId ?? process.env.S1_APP_ID ?? ""),
    username: String(data.username ?? process.env.S1_USERNAME ?? ""),
    password: secrets.password ?? process.env.S1_PASSWORD ?? "",
    company: String(data.company ?? process.env.S1_COMPANY ?? ""),
    branch: String(data.branch ?? process.env.S1_BRANCH ?? ""),
    module: String(data.module ?? process.env.S1_MODULE ?? "0"),
    refid: String(data.refid ?? process.env.S1_REFID ?? ""),
  };
  return cfg.url && cfg.appId && cfg.username && cfg.password ? cfg : null;
}

const baseUrl = (c: S1Config) => (/^https?:\/\//.test(c.url) ? c.url.replace(/\/$/, "") : `https://${c.url}.oncloud.gr/s1services`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function s1Fetch(c: S1Config, body: object): Promise<any> {
  const res = await fetch(baseUrl(c), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
  const buffer = await res.arrayBuffer();
  // Όταν η υπηρεσία web services του SoftOne δεν τρέχει, ο server απαντά 404/5xx με άδειο σώμα:
  // το λέμε καθαρά, αντί να σκάσει το JSON.parse με «Unexpected end of JSON input».
  if (!buffer.byteLength) throw new Error(`Οι web services του SoftOne απάντησαν HTTP ${res.status} χωρίς περιεχόμενο — η υπηρεσία δεν τρέχει στον server. Χρειάζεται έλεγχος ή επανεκκίνηση από τον πάροχο του SoftOne cloud.`);
  const text = iconv.decode(Buffer.from(buffer), "win1253");
  try { return JSON.parse(text); } catch { throw new Error(`Το SoftOne απάντησε HTTP ${res.status} με μη έγκυρο JSON: ${text.slice(0, 120)}`); }
}

const SESSION_KEY = "softone.session";
const today = () => new Date().toISOString().slice(0, 10);

async function loadSession(serial: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { section: SESSION_KEY } });
  const s = row?.data as { clientID?: string; date?: string; serial?: string } | null;
  return s?.date === today() && s.serial === serial && s.clientID ? s.clientID : null;
}
async function saveSession(serial: string, clientID: string | null) {
  const data = clientID ? { clientID, date: today(), serial } : {};
  await db.setting.upsert({ where: { section: SESSION_KEY }, update: { data }, create: { section: SESSION_KEY, data } });
}

export interface S1LoginObj { COMPANY: string; COMPANYNAME?: string; BRANCH: string; BRANCHNAME?: string; MODULE: string; MODULENAME?: string; REFID: string; REFIDNAME?: string }

/** Step 1 only: login → temporary clientID + the company/branch/module/refid combinations available to this user. */
export async function s1Login(c: S1Config): Promise<{ clientID: string; objs?: S1LoginObj[]; ver?: string; sn?: string }> {
  const login = await s1Fetch(c, { SERVICE: "Login", USERNAME: c.username, PASSWORD: c.password, APPID: c.appId, VERSION: "2" });
  if (!login.success) throw new Error(`S1 Login: ${login.error ?? "failed"}`);
  return login;
}

/** Two-step auth. Returns the session clientID plus what the ERP told us about the login (for the test button).
 *  Company / branch / module / refid default to the first combination the login offers when not configured. */
export async function authenticate(c: S1Config) {
  const login = await s1Login(c);
  const first = login.objs?.[0];
  const pick = { COMPANY: c.company || first?.COMPANY, BRANCH: c.branch || first?.BRANCH, MODULE: c.module || first?.MODULE || "0", REFID: c.refid || first?.REFID };
  const auth = await s1Fetch(c, { service: "authenticate", clientID: login.clientID, ...pick, VERSION: "2" });
  if (!auth.success) throw new Error(`S1 Auth: ${auth.error ?? "failed"}`);
  await saveSession(c.url, auth.clientID);
  return { clientID: auth.clientID as string, login: { objs: login.objs, ver: login.ver, sn: login.sn } };
}

async function getClientId(c: S1Config) {
  return (await loadSession(c.url)) ?? (await authenticate(c)).clientID;
}

/** Call any official service with the cached session; re-auth once on -100/-101. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function s1(service: string, params: Record<string, unknown> = {}): Promise<any> {
  const c = await getS1Config();
  if (!c) throw new Error("SoftOne: δεν έχουν οριστεί στοιχεία σύνδεσης (Ρυθμίσεις → SoftOne ERP)");
  const clientID = await getClientId(c);
  const data = await s1Fetch(c, { service, clientID, appId: c.appId, VERSION: "2", ...params });
  if (!data.success && (data.errorcode === -101 || data.errorcode === -100)) {
    await saveSession(c.url, null);
    const fresh = await authenticate(c);
    return s1Fetch(c, { service, clientID: fresh.clientID, appId: c.appId, VERSION: "2", ...params });
  }
  return data;
}

/** Connection test used by the settings page: full login → authenticate → getSystemParams. */
export async function testSoftone(c: S1Config) {
  const t0 = Date.now();
  const { clientID, login } = await authenticate(c);
  const params = await s1Fetch(c, { service: "getSystemParams", clientID, appId: c.appId, VERSION: "2" }).catch(() => null);
  const obj = login.objs?.find((o) => String(o.COMPANY) === c.company && String(o.BRANCH) === c.branch) ?? login.objs?.[0];
  return {
    ms: Date.now() - t0,
    company: obj?.COMPANYNAME ?? c.company,
    branch: obj?.BRANCHNAME ?? c.branch,
    user: obj?.REFIDNAME ?? c.refid,
    version: login.ver ?? null,
    serial: login.sn ?? c.url,
    systemParams: params?.success ? Object.keys(params).length - 1 : null,
  };
}
