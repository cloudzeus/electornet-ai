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
  serial: string;
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
    serial: String(data.serial ?? process.env.S1_SERIAL ?? ""),
    appId: String(data.appId ?? process.env.S1_APP_ID ?? ""),
    username: String(data.username ?? process.env.S1_USERNAME ?? ""),
    password: secrets.password ?? process.env.S1_PASSWORD ?? "",
    company: String(data.company ?? process.env.S1_COMPANY ?? ""),
    branch: String(data.branch ?? process.env.S1_BRANCH ?? ""),
    module: String(data.module ?? process.env.S1_MODULE ?? "0"),
    refid: String(data.refid ?? process.env.S1_REFID ?? ""),
  };
  return cfg.serial && cfg.appId && cfg.username && cfg.password ? cfg : null;
}

const baseUrl = (c: S1Config) => `https://${c.serial}.oncloud.gr/s1services`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function s1Fetch(c: S1Config, body: object): Promise<any> {
  const res = await fetch(baseUrl(c), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
  const buffer = await res.arrayBuffer();
  return JSON.parse(iconv.decode(Buffer.from(buffer), "win1253"));
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

/** Two-step auth. Returns the session clientID plus what the ERP told us about the login (for the test button). */
export async function authenticate(c: S1Config) {
  const login = await s1Fetch(c, { SERVICE: "Login", USERNAME: c.username, PASSWORD: c.password, APPID: c.appId, VERSION: "2" });
  if (!login.success) throw new Error(`S1 Login: ${login.error ?? "failed"}`);
  const auth = await s1Fetch(c, { service: "authenticate", clientID: login.clientID, COMPANY: c.company, BRANCH: c.branch, MODULE: c.module, REFID: c.refid, VERSION: "2" });
  if (!auth.success) throw new Error(`S1 Auth: ${auth.error ?? "failed"}`);
  await saveSession(c.serial, auth.clientID);
  return { clientID: auth.clientID as string, login: { objs: login.objs as { COMPANY: string; COMPANYNAME?: string; BRANCH: string; BRANCHNAME?: string; MODULE: string; REFID: string; REFIDNAME?: string }[] | undefined, ver: login.ver as string | undefined, sn: login.sn as string | undefined } };
}

async function getClientId(c: S1Config) {
  return (await loadSession(c.serial)) ?? (await authenticate(c)).clientID;
}

/** Call any official service with the cached session; re-auth once on -100/-101. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function s1(service: string, params: Record<string, unknown> = {}): Promise<any> {
  const c = await getS1Config();
  if (!c) throw new Error("SoftOne: δεν έχουν οριστεί στοιχεία σύνδεσης (Ρυθμίσεις → SoftOne ERP)");
  const clientID = await getClientId(c);
  const data = await s1Fetch(c, { service, clientID, appId: c.appId, VERSION: "2", ...params });
  if (!data.success && (data.errorcode === -101 || data.errorcode === -100)) {
    await saveSession(c.serial, null);
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
    serial: login.sn ?? c.serial,
    systemParams: params?.success ? Object.keys(params).length - 1 : null,
  };
}
