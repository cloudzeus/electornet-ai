import "server-only";
import { getSetting } from "@/lib/settings/store";

/**
 * ΑΑΔΕ «Στοιχεία Επιχειρήσεων» (RgWsPublic2) — αναζήτηση ΑΦΜ.
 *
 * SOAP 1.1 σε https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2 με
 * WS-Security UsernameToken (ειδικοί κωδικοί που εκδίδει το TAXISnet για την
 * υπηρεσία, όχι οι κωδικοί TAXISnet του χρήστη). Η απάντηση είναι UTF-8 XML
 * (όχι win-1253 όπως το SoftOne).
 *
 * Επιστρέφει βασικά στοιχεία μητρώου: επωνυμία, ΔΟΥ, διεύθυνση έδρας,
 * κατάσταση (ενεργό/διακοπή), νομική μορφή και ΚΑΔ.
 */
const ENDPOINT = "https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2";

export interface AadeFirmAct { code: string; descr: string; kind: string; kindDescr: string }
export interface AadeCompany {
  afm: string;
  calledBy: string | null;
  /** ΔΟΥ: κωδικός (ίδιος με IRSDATA.CODE στο SoftOne) και περιγραφή */
  doy: string | null;
  doyDescr: string | null;
  onomasia: string | null;
  commerTitle: string | null;
  legalStatusDescr: string | null;
  postalAddress: string | null;
  postalAddressNo: string | null;
  postalZipCode: string | null;
  postalAreaDescription: string | null;
  registDate: string | null;
  stopDate: string | null;
  /** "Α" = ανενεργός, "1" = ενεργός (κατά ΑΑΔΕ) */
  deactivationFlag: string | null;
  deactivationFlagDescr: string | null;
  firmFlagDescr: string | null;
  iNiFlagDescr: string | null;
  firmActs: AadeFirmAct[];
  /** true όταν ο ΑΦΜ είναι ενεργός στο μητρώο */
  active: boolean;
}
export type AadeResult = { ok: true; company: AadeCompany } | { ok: false; code: string; message: string };

export async function getAadeConfig() {
  const { data, secrets } = await getSetting("aade");
  const username = String(data.vatUsername ?? process.env.AADE_USERNAME ?? "");
  const password = secrets.vatPassword ?? process.env.AADE_PASSWORD ?? "";
  return { enabled: data.vatEnabled === true && !!username && !!password, username, password, endpoint: String(data.vatEndpoint || ENDPOINT) };
}

const esc = (v: string) => v.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`));
  if (!m) return null;
  const v = m[1].trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return v === "" ? null : v;
};

/** ΑΦΜ checksum (modulo 11) — φιλτράρει λάθος πληκτρολογήσεις πριν καν φύγει κλήση. */
export function isValidAfm(afm: string): boolean {
  const v = afm.replace(/\D/g, "");
  if (v.length !== 9 || /^0+$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(v[i]) * 2 ** (8 - i);
  return sum % 11 % 10 === Number(v[8]);
}

/**
 * Αναζήτηση ΑΦΜ στο μητρώο της ΑΑΔΕ. `callFor` = ο ΑΦΜ που ψάχνουμε,
 * `calledBy` = ο ΑΦΜ της εταιρείας μας (κενό αν οι κωδικοί είναι προσωπικοί).
 */
export async function lookupAfm(afm: string, opts: { calledBy?: string } = {}): Promise<AadeResult> {
  const v = afm.replace(/\D/g, "");
  if (!isValidAfm(v)) return { ok: false, code: "INVALID_AFM", message: "Μη έγκυρος ΑΦΜ (αποτυγχάνει ο έλεγχος ψηφίου)." };
  const cfg = await getAadeConfig();
  if (!cfg.enabled) return { ok: false, code: "NOT_CONFIGURED", message: "Δεν έχουν οριστεί κωδικοί ΑΑΔΕ (Ρυθμίσεις → ΑΑΔΕ)." };
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://rgwspublic2/RgWsPublic2Service" xmlns:ns2="http://rgwspublic2/RgWsPublic2Params">
 <env:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
   <wsse:UsernameToken>
    <wsse:Username>${esc(cfg.username)}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${esc(cfg.password)}</wsse:Password>
   </wsse:UsernameToken>
  </wsse:Security>
 </env:Header>
 <env:Body>
  <ns1:rgWsPublic2AfmMethod>
   <ns1:INPUT_REC>
    <ns2:afm_called_by>${esc(opts.calledBy ?? "")}</ns2:afm_called_by>
    <ns2:afm_called_for>${esc(v)}</ns2:afm_called_for>
   </ns1:INPUT_REC>
  </ns1:rgWsPublic2AfmMethod>
 </env:Body>
</env:Envelope>`;
  let xml: string;
  try {
    const res = await fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "text/xml;charset=UTF-8", SOAPAction: "" }, body: envelope, signal: AbortSignal.timeout(20000) });
    xml = await res.text();
    if (!res.ok && !xml.includes("Envelope")) return { ok: false, code: `HTTP_${res.status}`, message: `ΑΑΔΕ: HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, code: "NETWORK", message: `ΑΑΔΕ: ${(e as Error).message}` };
  }
  const err = tag(xml, "errorDescr") ?? tag(xml, "faultstring");
  const errCode = tag(xml, "errorCode");
  if (err) return { ok: false, code: errCode ?? "AADE_ERROR", message: err };
  const onomasia = tag(xml, "onomasia");
  if (!onomasia && !tag(xml, "doy")) return { ok: false, code: "NOT_FOUND", message: "Ο ΑΦΜ δεν βρέθηκε στο μητρώο." };
  const firmActs: AadeFirmAct[] = [];
  for (const block of xml.match(/<(?:\w+:)?item>[\s\S]*?<\/(?:\w+:)?item>/g) ?? []) {
    const code = tag(block, "firmActCode");
    if (code) firmActs.push({ code, descr: tag(block, "firmActDescr") ?? "", kind: tag(block, "firmActKind") ?? "", kindDescr: tag(block, "firmActKindDescr") ?? "" });
  }
  const deactivationFlag = tag(xml, "deactivationFlag");
  return {
    ok: true,
    company: {
      afm: tag(xml, "afm") ?? v,
      calledBy: opts.calledBy ?? null,
      doy: tag(xml, "doy"),
      doyDescr: tag(xml, "doyDescr"),
      onomasia,
      commerTitle: tag(xml, "commerTitle"),
      legalStatusDescr: tag(xml, "legalStatusDescr"),
      postalAddress: tag(xml, "postalAddress"),
      postalAddressNo: tag(xml, "postalAddressNo"),
      postalZipCode: tag(xml, "postalZipCode"),
      postalAreaDescription: tag(xml, "postalAreaDescription"),
      registDate: tag(xml, "registDate"),
      stopDate: tag(xml, "stopDate"),
      deactivationFlag,
      deactivationFlagDescr: tag(xml, "deactivationFlagDescr"),
      firmFlagDescr: tag(xml, "firmFlagDescr"),
      iNiFlagDescr: tag(xml, "iNiFlagDescr") ?? tag(xml, "INiFlagDescr"),
      firmActs,
      active: deactivationFlag === "1",
    },
  };
}
