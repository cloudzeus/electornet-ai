import "server-only";
import { getSetting } from "@/lib/settings/store";
import { vivaHosts, type VivaMode, type VivaTransaction } from "./viva-core";

/**
 * Viva Smart Checkout (OAuth2 client credentials). Στοιχεία από Ρυθμίσεις → Πληρωμές (πάροχος «Viva Wallet»):
 * Client ID / Client secret (Smart Checkout credentials), Source code, Merchant ID + API key (για το κλειδί webhook).
 * «Test» = περιβάλλον demo της Viva, καμία πραγματική χρέωση.
 */
export interface VivaConfig { mode: VivaMode; clientId: string; clientSecret: string; sourceCode: string; merchantId: string; apiKey: string; maxInstalments: number }

export async function vivaConfig(): Promise<VivaConfig | null> {
  const s = await getSetting("payments").catch(() => null);
  if (!s || s.data.provider !== "viva") return null;
  const c = {
    mode: (s.data.mode === "live" ? "live" : "test") as VivaMode,
    clientId: String(s.data.clientId ?? "").trim(), clientSecret: String(s.secrets.clientSecret ?? "").trim(),
    sourceCode: String(s.data.sourceCode ?? "").trim(), merchantId: String(s.data.merchantId ?? "").trim(), apiKey: String(s.secrets.apiKey ?? "").trim(),
    maxInstalments: Math.max(0, Math.min(36, Number(s.data.maxInstalments) || 0)),
  };
  return c.clientId && c.clientSecret ? c : null;
}

let token: { key: string; value: string; until: number } | null = null;
async function accessToken(c: VivaConfig): Promise<string> {
  const key = `${c.mode}:${c.clientId}`;
  if (token && token.key === key && Date.now() < token.until) return token.value;
  const r = await fetch(`${vivaHosts(c.mode).accounts}/connect/token`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`Viva: σύνδεση απέτυχε (${r.status}) — έλεγξε Client ID / Client secret και περιβάλλον.`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { key, value: j.access_token, until: Date.now() + Math.max(60, j.expires_in - 120) * 1000 };
  return j.access_token;
}

async function api<T>(c: VivaConfig, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${vivaHosts(c.mode).api}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${await accessToken(c)}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`Viva ${path}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return (await r.json()) as T;
}

export interface VivaOrderInput {
  /** λεπτά */
  amount: number; number: string;
  customer: { email: string; fullName: string; phone?: string | null; countryCode?: string };
  instalments?: number;
}

/**
 * Payment order για μία πληρωμή. Τα στοιχεία του πελάτη (email, ονοματεπώνυμο, τηλέφωνο, χώρα, γλώσσα) συμπληρώνονται
 * στη σελίδα της Viva — και έτσι ο πελάτης που έχει πληρώσει με Viva σε άλλο κατάστημα βλέπει τις αποθηκευμένες κάρτες του.
 */
export async function createVivaOrder(c: VivaConfig, i: VivaOrderInput): Promise<string> {
  const body = {
    amount: i.amount,
    customerTrns: `Euronics · παραγγελία ${i.number}`,
    customer: { email: i.customer.email, fullName: i.customer.fullName, phone: i.customer.phone ?? undefined, countryCode: i.customer.countryCode ?? "GR", requestLang: "el-GR" },
    paymentTimeout: 1800,
    maxInstallments: Math.min(c.maxInstalments, i.instalments && i.instalments > 1 ? i.instalments : c.maxInstalments),
    merchantTrns: i.number,
    tags: ["eshop"],
    ...(c.sourceCode ? { sourceCode: c.sourceCode } : {}),
  };
  const j = await api<{ orderCode: number | string }>(c, "/checkout/v2/orders", { method: "POST", body: JSON.stringify(body) });
  return String(j.orderCode);
}

export const getVivaTransaction = (c: VivaConfig, transactionId: string) =>
  api<VivaTransaction>(c, `/checkout/v2/transactions/${encodeURIComponent(transactionId)}`);

/** Το κλειδί που ζητά η Viva όταν ορίζεται το webhook URL (GET στο endpoint μας πρέπει να το επιστρέψει). */
export async function vivaWebhookKey(c: VivaConfig): Promise<string> {
  if (!c.merchantId || !c.apiKey) throw new Error("Viva: χρειάζονται Merchant ID και API key για το webhook.");
  const r = await fetch(`${vivaHosts(c.mode).web}/api/messages/config/token`, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { authorization: `Basic ${Buffer.from(`${c.merchantId}:${c.apiKey}`).toString("base64")}` } });
  if (!r.ok) throw new Error(`Viva webhook key: ${r.status}`);
  return ((await r.json()) as { Key: string }).Key;
}
