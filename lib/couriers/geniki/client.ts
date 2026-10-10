import "server-only";
import { getSetting } from "@/lib/settings/store";
import { envelope, hostFor, recordXml, resultText, soapFault, tagBlocks, tagText, type GenikiRecord } from "./soap";

/**
 * Client του JobServicesV2 της Γενικής Ταχυδρομικής. Στοιχεία από Ρυθμίσεις → Αποστολές & courier → Γενική Ταχυδρομική.
 * Το κλειδί σύνδεσης (Authenticate) ξαναχρησιμοποιείται μέχρι να λήξει (Result 11) — τότε νέα σύνδεση και επανάληψη.
 */
export interface GenikiConfig { env: "test" | "live"; user: string; password: string; appKey: string; subCode: string | null; label: "Flyer" | "Sticker" | "StickerF6" }

export class GenikiError extends Error { constructor(message: string, public code: number | null = null) { super(message); } }

export async function genikiConfig(): Promise<GenikiConfig | null> {
  const { data, secrets } = await getSetting("shipping").catch(() => ({ data: {} as Record<string, unknown>, secrets: {} as Record<string, string> }));
  const c: GenikiConfig = {
    env: data.genikiEnv === "live" ? "live" : "test",
    user: String(data.genikiUser ?? "").trim(), password: String(secrets.genikiPassword ?? ""), appKey: String(secrets.genikiAppKey ?? ""),
    subCode: String(data.genikiSubCode ?? "").trim() || null,
    label: data.genikiLabel === "Sticker" || data.genikiLabel === "StickerF6" ? data.genikiLabel : "Flyer",
  };
  return c.user && c.password && c.appKey ? c : null;
}

let auth: { id: string; key: string } | null = null;
const idOf = (c: GenikiConfig) => `${c.env}:${c.user}`;

async function post(c: GenikiConfig, method: string, params: [string, unknown][]): Promise<string> {
  const r = await fetch(`${hostFor(c.env)}/JobServicesV2.asmx`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(30000),
    headers: { "content-type": "text/xml; charset=utf-8", soapaction: `"http://voucher.taxydromiki.gr/JobServicesV2.asmx/${method}"` },
    body: envelope(method, params as never),
  });
  const xml = await r.text();
  const fault = soapFault(xml);
  if (fault) throw new GenikiError(`Γενική (${method}): ${fault.slice(0, 200)}`);
  if (!r.ok) throw new GenikiError(`Γενική (${method}): HTTP ${r.status}`);
  return xml;
}

async function authenticate(c: GenikiConfig): Promise<string> {
  const xml = await post(c, "Authenticate", [["sUsrName", c.user], ["sUsrPwd", c.password], ["applicationKey", c.appKey]]);
  const code = Number(tagText(xml, "Result") ?? -1), key = tagText(xml, "Key");
  if (code !== 0 || !key) throw new GenikiError(resultText(code), code);
  auth = { id: idOf(c), key };
  return key;
}
const keyFor = async (c: GenikiConfig) => (auth && auth.id === idOf(c) ? auth.key : authenticate(c));

/** Κλήση με το κλειδί σύνδεσης· σε «κλειδί έληξε» (11) νέα σύνδεση και μία επανάληψη. Επιστρέφει το XML και τον κωδικό. */
async function call(c: GenikiConfig, method: string, keyName: string, params: [string, unknown][], resultTag = "Result"): Promise<{ xml: string; code: number }> {
  for (let i = 0; i < 2; i++) {
    const key = await keyFor(c);
    const xml = await post(c, method, [[keyName, key], ...params]);
    const raw = tagText(xml, resultTag) ?? tagText(xml, `${method}Result`);
    const code = Number(raw ?? 0);
    if (code === 11 && i === 0) { auth = null; continue; }
    return { xml, code };
  }
  throw new GenikiError(resultText(11), 11);
}

/** Δοκιμή σύνδεσης (για τη διαχείριση): νέο κλειδί. */
export async function genikiPing(c: GenikiConfig) { auth = null; await authenticate(c); return true; }

export async function genikiCreateVoucher(c: GenikiConfig, rec: GenikiRecord) {
  const { xml, code } = await call(c, "CreateJob", "sAuthKey", [["oVoucher", recordXml({ ...rec, SubCode: rec.SubCode ?? c.subCode ?? undefined })], ["eType", "Voucher"]]);
  if (code !== 0) throw new GenikiError(resultText(code), code);
  return { jobId: tagText(xml, "JobId")!, voucher: tagText(xml, "Voucher")!, subVouchers: tagBlocks(xml, "Record").map((b) => tagText(b, "VoucherNo")).filter((x): x is string => !!x) };
}

/** Ακύρωση (bCancel=true) ή επανενεργοποίηση. 4 = έχει ήδη κλείσει (δεν ακυρώνεται πια από εδώ). */
export async function genikiCancel(c: GenikiConfig, jobId: string, cancel = true) {
  const { code } = await call(c, "CancelJob", "sAuthKey", [["nJobId", jobId], ["bCancel", cancel]], "CancelJobResult");
  if (code !== 0) throw new GenikiError(resultText(code), code);
}

/** Κλείσιμο ημέρας: στέλνει στο κατάστημα της Γενικής όσα vouchers εκδόθηκαν από `from` έως `to`. */
export async function genikiClose(c: GenikiConfig, from: Date, to: Date) {
  const { code } = await call(c, "ClosePendingJobsByDate", "sAuthKey", [["dFr", from], ["dTo", to]], "ClosePendingJobsByDateResult");
  if (code !== 0) throw new GenikiError(resultText(code), code);
}

/** Ετικέτα(ες) PDF — η Γενική απαντά application/pdf ή text/plain με κωδικό σφάλματος. */
export async function genikiLabels(c: GenikiConfig, vouchers: string[]): Promise<Buffer> {
  for (let i = 0; i < 2; i++) {
    const key = await keyFor(c);
    const q = new URLSearchParams({ authKey: key, format: c.label, extraInfoFormat: "None" });
    for (const v of vouchers) q.append("voucherNumbers", v);
    const r = await fetch(`${hostFor(c.env)}/JobServicesV2.asmx/GetVouchersPdf?${q}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if ((r.headers.get("content-type") ?? "").includes("pdf")) return Buffer.from(await r.arrayBuffer());
    const code = Number((await r.text()).replace(/\D/g, "") || -1);
    if (code === 11 && i === 0) { auth = null; continue; }
    throw new GenikiError(`Ετικέτα: ${resultText(code)}`, code);
  }
  throw new GenikiError(resultText(11), 11);
}

export interface GenikiTrack { status: string | null; deliveredAt: string | null; consignee: string | null; checkpoints: { code: string; text: string; at: string; shop: string | null }[] }
export async function genikiTrack(c: GenikiConfig, voucher: string): Promise<GenikiTrack> {
  const { xml, code } = await call(c, "TrackAndTrace", "authKey", [["voucherNo", voucher], ["language", "el"]]);
  if (code !== 0) throw new GenikiError(resultText(code), code);
  // η γενική κατάσταση έξω από τα Checkpoints (που έχουν κι αυτά <Status>)
  const top = xml.replace(/<(?:\w+:)?Checkpoints>[\s\S]*?<\/(?:\w+:)?Checkpoints>/, "");
  const delivered = tagText(top, "DeliveryDate");
  return {
    status: tagText(top, "Status"), consignee: tagText(top, "Consignee"),
    deliveredAt: delivered && !delivered.startsWith("0001") ? delivered : null,
    checkpoints: tagBlocks(xml, "Checkpoint").map((b) => ({ code: tagText(b, "StatusCode") ?? "", text: tagText(b, "Status") ?? "", at: tagText(b, "StatusDate") ?? "", shop: tagText(b, "Shop") })),
  };
}
