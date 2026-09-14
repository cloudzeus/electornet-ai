import "server-only";
import { getSetting } from "@/lib/settings/store";

/**
 * Μητρώο ΑΑΔΕ — στοιχεία επιχείρησης από ΑΦΜ.
 *
 * Δύο πηγές, με την ίδια έξοδο:
 *
 *  1. **proxy `afm2info`** (προεπιλογή, χωρίς κωδικούς) — ο ίδιος που
 *     χρησιμοποιούν ήδη οι άλλες εφαρμογές μας. Μεταφράζει το SOAP της ΑΑΔΕ
 *     σε JSON. **Δεν επιστρέφει τον κωδικό Δ.Ο.Υ., μόνο την περιγραφή.**
 *  2. **απευθείας RgWsPublic2** (SOAP), όταν έχουν οριστεί ειδικοί κωδικοί
 *     TAXISnet. Μόνο αυτή δίνει τον **αριθμητικό κωδικό Δ.Ο.Υ.**, που είναι
 *     το κλειδί σύνδεσης με το `IRSDATA` του SoftOne.
 *
 * Παγίδα του proxy (XML→JSON): τα κενά στοιχεία δεν έρχονται `null` αλλά ως
 * αντικείμενα (`{"@_xsi:nil":"true"}` ή `{}`) — σκέτο `String(v)` δίνει
 * «[object Object]». Κάθε πεδίο περνά από {@link textOf}.
 */
const PROXY = "https://vat.wwa.gr/afm2info";
const SOAP = "https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2";

export interface AadeFirmAct { code: string; descr: string; kind: "PRIMARY" | "SECONDARY" }
export interface AadeCompany {
  afm: string;
  name: string;
  shortName: string | null;
  /** αριθμητικός κωδικός Δ.Ο.Υ. — μόνο από το SOAP· `null` μέσω proxy */
  doyCode: string | null;
  doyDescr: string | null;
  legalForm: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string;
  foundingDate: string | null;
  stopDate: string | null;
  profession: string | null;
  aadeStatus: string | null;
  aadeFirmKind: string | null;
  isActive: boolean;
  activities: AadeFirmAct[];
  source: "proxy" | "soap";
}
export type AadeResult = { ok: true; company: AadeCompany } | { ok: false; code: string; message: string };

export async function getAadeConfig() {
  const { data, secrets } = await getSetting("aade");
  const username = String(data.vatUsername ?? process.env.AADE_USERNAME ?? "");
  const password = secrets.vatPassword ?? process.env.AADE_PASSWORD ?? "";
  const source = String(data.vatSource || (username && password ? "soap" : "proxy")) as "proxy" | "soap";
  return {
    enabled: data.vatEnabled !== false,
    source,
    username, password,
    calledBy: String(data.vatCalledBy ?? ""),
    proxyUrl: String(data.vatProxyUrl || PROXY),
    soapUrl: String(data.vatEndpoint || SOAP),
  };
}

/** Κείμενο από οτιδήποτε γυρίζει ο proxy (string, number, array, ή nil-αντικείμενο). */
export function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (Array.isArray(v)) { for (const i of v) { const t = textOf(i); if (t) return t; } return null; }
  if (typeof v === "object") { for (const k of ["_", "#text", "$t"]) { if (k in (v as Record<string, unknown>)) { const t = textOf((v as Record<string, unknown>)[k]); if (t) return t; } } return null; }
  return null;
}

/** «EL999863881», «99 986 3881» → «999863881». */
export const cleanAfm = (v: string) => v.replace(/\D+/g, "");

/** Έλεγχος ψηφίου ΑΦΜ (modulo 11) — κόβει λάθος πληκτρολογήσεις πριν φύγει κλήση. */
export function isValidAfm(afm: string): boolean {
  const v = cleanAfm(afm);
  if (v.length !== 9 || /^0+$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(v[i]) * 2 ** (8 - i);
  return ((sum % 11) % 10) === Number(v[8]);
}

const actsOf = (raw: unknown): AadeFirmAct[] => {
  const item = (raw as { firm_act_tab?: { item?: unknown } } | null)?.firm_act_tab?.item;
  const list = (Array.isArray(item) ? item : item ? [item] : []).filter((a): a is Record<string, unknown> => !!a && typeof a === "object");
  return list.map((a) => ({ code: textOf(a.firm_act_code) ?? "", descr: textOf(a.firm_act_descr) ?? "", kind: textOf(a.firm_act_kind) === "1" ? ("PRIMARY" as const) : ("SECONDARY" as const) })).filter((a) => a.code || a.descr);
};

/** Πηγή 1: proxy afm2info (JSON, χωρίς κωδικούς). */
async function viaProxy(afm: string, url: string): Promise<AadeResult> {
  let raw: unknown;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ afm }), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { ok: false, code: "AADE_HTTP", message: `Η υπηρεσία ΑΑΔΕ απάντησε ${r.status}.` };
    raw = await r.json();
  } catch (e) {
    return { ok: false, code: "AADE_UNREACHABLE", message: `Η υπηρεσία ΑΑΔΕ δεν είναι προσβάσιμη: ${(e as Error).message}` };
  }
  const rec = (raw as { basic_rec?: unknown } | null)?.basic_rec;
  if (!rec || typeof rec !== "object") return { ok: false, code: "NOT_FOUND", message: "Ο ΑΦΜ δεν βρέθηκε στο μητρώο." };
  const b = rec as Record<string, unknown>;
  const gotAfm = textOf(b.afm), name = textOf(b.onomasia);
  // ξένο ΑΦΜ: όλα τα στοιχεία έρχονται nil
  if (!gotAfm || !name) return { ok: false, code: "NOT_FOUND", message: "Ο ΑΦΜ δεν βρέθηκε στο μητρώο." };
  const activities = actsOf(raw);
  const stopDate = textOf(b.stop_date);
  return { ok: true, company: {
    afm: gotAfm, name, shortName: textOf(b.commer_title),
    doyCode: textOf(b.doy), doyDescr: textOf(b.doy_descr),
    legalForm: textOf(b.legal_status_descr),
    address: [textOf(b.postal_address), textOf(b.postal_address_no)].filter(Boolean).join(" ") || null,
    zip: textOf(b.postal_zip_code), city: textOf(b.postal_area_description), country: "GR",
    foundingDate: textOf(b.regist_date), stopDate,
    profession: (activities.find((a) => a.kind === "PRIMARY") ?? activities[0])?.descr ?? null,
    aadeStatus: textOf(b.deactivation_flag_descr), aadeFirmKind: textOf(b.firm_flag_descr),
    isActive: textOf(b.deactivation_flag) === "1" && !stopDate,
    activities, source: "proxy",
  } };
}

const esc = (v: string) => v.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const xmlTag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  if (!m) return null;
  const v = m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return v || null;
};

/** Πηγή 2: RgWsPublic2 (SOAP + WS-Security). Η μόνη που δίνει τον κωδικό Δ.Ο.Υ. */
async function viaSoap(afm: string, cfg: Awaited<ReturnType<typeof getAadeConfig>>): Promise<AadeResult> {
  if (!cfg.username || !cfg.password) return { ok: false, code: "NOT_CONFIGURED", message: "Δεν έχουν οριστεί ειδικοί κωδικοί ΑΑΔΕ." };
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://rgwspublic2/RgWsPublic2Service" xmlns:ns2="http://rgwspublic2/RgWsPublic2Params">
 <env:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${esc(cfg.username)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${esc(cfg.password)}</wsse:Password></wsse:UsernameToken></wsse:Security></env:Header>
 <env:Body><ns1:rgWsPublic2AfmMethod><ns1:INPUT_REC><ns2:afm_called_by>${esc(cfg.calledBy)}</ns2:afm_called_by><ns2:afm_called_for>${esc(afm)}</ns2:afm_called_for></ns1:INPUT_REC></ns1:rgWsPublic2AfmMethod></env:Body>
</env:Envelope>`;
  let xml: string;
  try {
    const res = await fetch(cfg.soapUrl, { method: "POST", headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" }, body, signal: AbortSignal.timeout(20000) });
    xml = await res.text();
    if (!res.ok && !xml.includes("Envelope")) return { ok: false, code: "AADE_HTTP", message: `ΑΑΔΕ: HTTP ${res.status}` };
  } catch (e) { return { ok: false, code: "AADE_UNREACHABLE", message: `ΑΑΔΕ: ${(e as Error).message}` }; }
  const err = xmlTag(xml, "errorDescr") ?? xmlTag(xml, "faultstring");
  if (err) return { ok: false, code: xmlTag(xml, "errorCode") ?? "AADE_ERROR", message: err };
  const name = xmlTag(xml, "onomasia");
  if (!name) return { ok: false, code: "NOT_FOUND", message: "Ο ΑΦΜ δεν βρέθηκε στο μητρώο." };
  const activities: AadeFirmAct[] = [];
  for (const block of xml.match(/<(?:\w+:)?item>[\s\S]*?<\/(?:\w+:)?item>/g) ?? []) {
    const code = xmlTag(block, "firmActCode");
    if (code) activities.push({ code, descr: xmlTag(block, "firmActDescr") ?? "", kind: xmlTag(block, "firmActKind") === "1" ? "PRIMARY" : "SECONDARY" });
  }
  const stopDate = xmlTag(xml, "stopDate");
  return { ok: true, company: {
    afm: xmlTag(xml, "afm") ?? afm, name, shortName: xmlTag(xml, "commerTitle"),
    doyCode: xmlTag(xml, "doy"), doyDescr: xmlTag(xml, "doyDescr"),
    legalForm: xmlTag(xml, "legalStatusDescr"),
    address: [xmlTag(xml, "postalAddress"), xmlTag(xml, "postalAddressNo")].filter(Boolean).join(" ") || null,
    zip: xmlTag(xml, "postalZipCode"), city: xmlTag(xml, "postalAreaDescription"), country: "GR",
    foundingDate: xmlTag(xml, "registDate"), stopDate,
    profession: (activities.find((a) => a.kind === "PRIMARY") ?? activities[0])?.descr ?? null,
    aadeStatus: xmlTag(xml, "deactivationFlagDescr"), aadeFirmKind: xmlTag(xml, "firmFlagDescr"),
    isActive: xmlTag(xml, "deactivationFlag") === "1" && !stopDate,
    activities, source: "soap",
  } };
}

/** Αναζήτηση ΑΦΜ. Με κωδικούς → SOAP (δίνει κωδικό Δ.Ο.Υ.)· αλλιώς proxy, με πτώση στον proxy αν το SOAP αποτύχει. */
export async function lookupAfm(afmRaw: string): Promise<AadeResult> {
  const afm = cleanAfm(afmRaw);
  if (!isValidAfm(afm)) return { ok: false, code: "INVALID_AFM", message: "Μη έγκυρος ΑΦΜ (αποτυγχάνει ο έλεγχος ψηφίου)." };
  const cfg = await getAadeConfig();
  if (!cfg.enabled) return { ok: false, code: "DISABLED", message: "Η αναζήτηση ΑΦΜ είναι απενεργοποιημένη." };
  if (cfg.source === "soap" && cfg.username && cfg.password) {
    const r = await viaSoap(afm, cfg);
    if (r.ok || r.code === "NOT_FOUND" || r.code === "INVALID_AFM") return r;
    const fallback = await viaProxy(afm, cfg.proxyUrl);
    return fallback.ok ? fallback : r;
  }
  return viaProxy(afm, cfg.proxyUrl);
}
