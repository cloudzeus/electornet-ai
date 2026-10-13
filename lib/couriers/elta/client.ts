import "server-only";
import { PDFDocument } from "pdf-lib";
import { getSetting } from "@/lib/settings/store";
import { AUTH_HEADER, cancelBody, createVoucherBody, eltaDate, credsBody, eltaHost, errorText, isAuthError, isOk, parseCreated, parseTrace, printBody, traceBody, type BaseResponse, type CreateVoucherResponse, type EltaCreds, type EltaEnv, type EltaParty, type EltaTrack, type EltaVoucherInput, type TraceResponse } from "./api";

/**
 * Client του Customer API της ΕΛΤΑ Courier. Στοιχεία σύνδεσης από το .env (ELTA_PELATIS, ELTA_USER, ELTA_PASS — με
 * προτεραιότητα) ή από Ρυθμίσεις → Αποστολές & courier → ΕΛΤΑ Courier· περιβάλλον, αποστολέας και παραλαβή από τις Ρυθμίσεις.
 * Το api_Key του authorization κρατιέται μέχρι τη λήξη του· σε σφάλμα «κλειδί» νέα σύνδεση και μία επανάληψη.
 */
export interface EltaConfig extends EltaCreds { env: EltaEnv; sender: EltaParty; pickup: boolean }

export class EltaError extends Error { constructor(message: string, public code: string | null = null) { super(message); } }

export async function eltaConfig(): Promise<EltaConfig | null> {
  const { data, secrets } = await getSetting("shipping").catch(() => ({ data: {} as Record<string, unknown>, secrets: {} as Record<string, string> }));
  const site = await getSetting("site").then((s) => s.data).catch(() => ({} as Record<string, unknown>));
  const str = (v: unknown) => String(v ?? "").trim();
  const c: EltaConfig = {
    env: (process.env.ELTA_ENV ?? data.eltaEnv) === "production" ? "production" : "stage",
    customerCode: str(process.env.ELTA_PELATIS) || str(data.eltaCustomerCode),
    user: str(process.env.ELTA_USER) || str(data.eltaUser),
    password: str(process.env.ELTA_PASS) || str(secrets.eltaPassword),
    subCode: str(data.eltaSubCode) || null,
    sender: {
      name: str(data.eltaSenderName) || str(site.legalName) || str(site.siteName) || "Euronics",
      address: str(data.eltaSenderAddress), area: str(data.eltaSenderArea), zip: str(data.eltaSenderZip),
      phone: str(data.eltaSenderPhone) || str(site.phone), email: str(site.email) || null,
    },
    pickup: data.eltaPickup === true,
  };
  return c.customerCode && c.user && c.password ? c : null;
}

let auth: { id: string; key: string; until: number } | null = null;
const idOf = (c: EltaConfig) => `${c.env}:${c.customerCode}:${c.user}`;

async function authorize(c: EltaConfig): Promise<string> {
  const r = await fetch(`${eltaHost(c.env)}/authorization`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(30000), headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ customerCode: c.customerCode, customerUser: c.user, customerPassword: c.password }),
  });
  const j = (await r.json().catch(() => null)) as ({ baseResponse?: BaseResponse; api_Key?: string; apiKey?: string; api_key?: string; expiration_date?: string } | null);
  const key = j?.api_Key ?? j?.apiKey ?? j?.api_key;
  if (!r.ok || !j || !isOk(j.baseResponse) || !key) throw new EltaError(`ΕΛΤΑ (σύνδεση): ${j ? errorText(j.baseResponse) : `HTTP ${r.status}`}`, j?.baseResponse?.error_code != null ? String(j.baseResponse.error_code) : null);
  const iso = eltaDate(j.expiration_date ?? "", "2359"); // yyyyMMdd
  const exp = iso ? new Date(iso).getTime() : NaN;
  // 5' περιθώριο πριν τη λήξη· χωρίς (αναγνώσιμη) λήξη: 12 ώρες
  auth = { id: idOf(c), key, until: Number.isFinite(exp) ? exp - 5 * 60_000 : Date.now() + 12 * 3600_000 };
  return key;
}
const keyFor = async (c: EltaConfig) => (auth && auth.id === idOf(c) && auth.until > Date.now() ? auth.key : authorize(c));

/** POST με το κλειδί (header apiKey)· σε σφάλμα κλειδιού νέα σύνδεση και μία επανάληψη. Σφάλμα του API → EltaError. */
async function call<T extends { baseResponse?: BaseResponse }>(c: EltaConfig, op: string, body: unknown): Promise<T> {
  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${eltaHost(c.env)}/${op}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(45000),
      headers: { "content-type": "application/json", accept: "application/json", [AUTH_HEADER]: await keyFor(c) },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => null)) as T | null;
    if (i === 0 && isAuthError(r.status, j?.baseResponse)) { auth = null; continue; }
    if (!j) throw new EltaError(`ΕΛΤΑ (${op}): HTTP ${r.status}`);
    if (!isOk(j.baseResponse)) throw new EltaError(`ΕΛΤΑ (${op}): ${errorText(j.baseResponse)}`, String(j.baseResponse?.error_code ?? ""));
    return j;
  }
  throw new EltaError(`ΕΛΤΑ (${op}): το κλειδί σύνδεσης δεν έγινε δεκτό.`);
}

/** Δοκιμή σύνδεσης: νέο κλειδί. */
export async function eltaPing(c: EltaConfig) { auth = null; await authorize(c); return true; }

export async function eltaCreateVoucher(c: EltaConfig, v: Omit<EltaVoucherInput, "sender"> & { sender?: EltaParty }) {
  const r = await call<CreateVoucherResponse>(c, "CreateVoucher", createVoucherBody(c, { ...v, sender: v.sender ?? c.sender }));
  const out = parseCreated(r);
  if (!out.voucher) throw new EltaError("ΕΛΤΑ: δεν επέστρεψε αριθμό voucher.");
  return out;
}

export async function eltaCancel(c: EltaConfig, voucher: string, comments = "") {
  await call(c, "CancelVoucher", cancelBody(c, voucher, comments));
}

export async function eltaTrack(c: EltaConfig, voucher: string): Promise<EltaTrack> {
  return parseTrace(await call<TraceResponse>(c, "TraceVoucher", traceBody(c, voucher)));
}

/** Οι ετικέτες ενός voucher (master + children) ως base64 όπως τις δίνει η ΕΛΤΑ. */
export async function eltaPrint(c: EltaConfig, voucher: string): Promise<string[]> {
  const r = await call<{ baseResponse?: BaseResponse; b64vouchersList?: string[] | null }>(c, "PrintVoucher", printBody(c, voucher));
  return (r.b64vouchersList ?? []).filter(Boolean);
}

/** Ετικέτες πολλών vouchers σε ένα PDF (PDF ή εικόνες PNG/JPEG από την ΕΛΤΑ — οι εικόνες μπαίνουν σε σελίδα A6). */
export async function eltaLabels(c: EltaConfig, vouchers: string[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const v of vouchers) for (const b64 of await eltaPrint(c, v)) await appendLabel(out, Buffer.from(b64.replace(/^data:[^,]+,/, ""), "base64"));
  if (!out.getPageCount()) throw new EltaError("ΕΛΤΑ: δεν επέστρεψε ετικέτες.");
  return Buffer.from(await out.save());
}
export async function appendLabel(out: PDFDocument, bytes: Buffer) {
  const head = bytes.subarray(0, 4).toString("latin1");
  if (head === "%PDF") { const src = await PDFDocument.load(bytes); for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p); return; }
  const img = head.startsWith("\x89PNG") ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const W = 297.6, H = 419.5, s = Math.min(W / img.width, H / img.height); // A6 σε pt
  out.addPage([W, H]).drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
}

export interface EltaStatus { codes: string; title_gr: string; title_en: string; remarks: string }
export async function eltaStatusInfo(c: EltaConfig): Promise<EltaStatus[]> {
  return (await call<{ baseResponse?: BaseResponse; statusInfoDetails?: EltaStatus[] }>(c, "StatusInfo", credsBody(c))).statusInfoDetails ?? [];
}
export interface EltaPudo { codes: string; postal_code: string; type_flag: string; titles_gr: string; addres_gr: string; city_gr: string; latitude: string; longitude: string; telefon: string; [k: string]: string }
export async function eltaPudos(c: EltaConfig): Promise<EltaPudo[]> {
  return (await call<{ baseResponse?: BaseResponse; pundo_Info_details?: EltaPudo[] }>(c, "PundoInfo", credsBody(c))).pundo_Info_details ?? [];
}
