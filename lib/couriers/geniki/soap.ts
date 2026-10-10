/**
 * Γενική Ταχυδρομική — JobServicesV2 (SOAP 1.1, ASMX). Καθαρές συναρτήσεις: φάκελος αιτήματος με τη σειρά πεδίων του
 * WSDL, ανάγνωση απάντησης χωρίς βιβλιοθήκη XML, κωδικοί αποτελέσματος και σημείων (checkpoints).
 * Τεκμηρίωση: https://voucher.taxydromiki.gr/help/jobservicesapiv2.pdf · WSDL: <host>/JobServicesV2.asmx?WSDL
 */
export const NS = "http://voucher.taxydromiki.gr/JobServicesV2.asmx";
export const hostFor = (env: "test" | "live") => (env === "live" ? "https://voucher.taxydromiki.gr" : "https://testvoucher.taxydromiki.gr");

export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

type Val = string | number | boolean | null | undefined | Date | Val[] | { [k: string]: Val };
/** Τιμή → XML. Πίνακες χορδών (ArrayOfString) ως <string>…</string>. Τα null/undefined παραλείπονται. */
function toXml(name: string, v: Val): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `<${name}>${v.toISOString().slice(0, 19)}</${name}>`;
  if (Array.isArray(v)) return `<${name}>${v.map((x) => toXml("string", x)).join("")}</${name}>`;
  if (typeof v === "object") return `<${name}>${Object.entries(v).map(([k, x]) => toXml(k, x)).join("")}</${name}>`;
  return `<${name}>${xmlEscape(String(v))}</${name}>`;
}

/** Ο φάκελος SOAP 1.1 για μια μέθοδο· οι παράμετροι με τη σειρά του WSDL (το ASMX διαβάζει τα πεδία με σειρά). */
export function envelope(method: string, params: [string, Val][]): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="${NS}">${params.map(([k, v]) => toXml(k, v)).join("")}</${method}></soap:Body></soap:Envelope>`;
}

/** Το Record του WSDL, με τη σειρά των πεδίων του. */
export interface GenikiRecord {
  OrderId: string; Name: string; Address: string; Email?: string; City: string; Telephone: string; Zip: string;
  Pieces: number; Weight: number; Comments?: string; Services?: string; CodAmount: number; InsAmount: number; SubCode?: string; ReceivedDate: Date;
}
const RECORD_ORDER = ["OrderId", "Name", "Address", "Email", "Country", "CountryIso", "City", "Telephone", "Zip", "Destination", "Courier", "Pieces", "Weight", "Comments", "Services", "CodAmount", "InsAmount", "VoucherNo", "SubCode", "BelongsTo", "DeliverTo", "ReceivedDate", "ContentsDescription", "SendAndReturnRecipient", "ExtraInfo"] as const;
export function recordXml(r: GenikiRecord): { [k: string]: Val } {
  const src = r as unknown as Record<string, Val>;
  const out: { [k: string]: Val } = {};
  for (const k of RECORD_ORDER) if (src[k] !== undefined && src[k] !== "") out[k] = k === "Weight" || k === "CodAmount" || k === "InsAmount" ? Number(src[k]).toFixed(2) : src[k];
  return out;
}

// ---------- ανάγνωση απάντησης ----------
const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** Η πρώτη τιμή του στοιχείου `tag` (χωρίς namespace) μέσα στο `xml`. */
export function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m ? unescape(m[1].trim()) : null;
}
/** Όλα τα στοιχεία `tag` (π.χ. Checkpoint) ως ακατέργαστο XML. */
export function tagBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "g"))].map((m) => m[1]);
}
/** SOAP fault → μήνυμα, αλλιώς null. */
export const soapFault = (xml: string) => (/<(?:\w+:)?Fault>/.test(xml) ? tagText(xml, "faultstring") ?? "SOAP fault" : null);

/** Κωδικοί αποτελέσματος (Result) της τεκμηρίωσης. */
export const RESULT: Record<number, string> = {
  0: "OK", 1: "Αποτυχία σύνδεσης (όνομα χρήστη / κωδικός / app key)", 3: "Δεν υπάρχουν δεδομένα", 4: "Μη επιτρεπτή ενέργεια (π.χ. ακύρωση κλεισμένου voucher)",
  5: "Εξαντλήθηκαν οι αριθμοί voucher", 6: "Εξαντλήθηκαν οι αριθμοί subvoucher", 700: "Λείπουν υποχρεωτικά πεδία (ονοματεπώνυμο, διεύθυνση, πόλη)",
  701: "Αντικαταβολή χωρίς ποσό", 702: "Ποσό αντικαταβολής χωρίς την υπηρεσία", 703: "Υπέρβαση ορίου αντικαταβολής", 704: "Ασφάλιση χωρίς ποσό",
  705: "Ποσό ασφάλισης χωρίς την υπηρεσία", 706: "Ημερομηνία παραλαβής στο παρελθόν", 710: "Μη έγκυρη τιμή", 711: "Παραλήπτης επιστροφής χωρίς την υπηρεσία",
  712: "Ο παραλήπτης επιστροφής δεν υπάρχει", 8: "Εσωτερικό σφάλμα (SQL) της Γενικής", 9: "Δεν υπάρχει", 10: "Χωρίς δικαίωμα πρόσβασης",
  11: "Το κλειδί σύνδεσης έληξε", 12: "Σφάλμα εκτέλεσης στη Γενική", 13: "Η αποστολή έχει ακυρωθεί", 14: "Η Γενική είναι προσωρινά απασχολημένη", 15: "Όριο αιτημάτων",
};
export const resultText = (code: number) => RESULT[code] ?? `Κωδικός ${code}`;

/** Checkpoint → κατάσταση αποστολής για εμάς. */
export type ShipState = "created" | "in-transit" | "out-for-delivery" | "delivered" | "attempted" | "returning" | "returned" | "cancelled" | "on-hold";
export function stateFromCheckpoint(code: string | null | undefined): ShipState | null {
  const c = (code ?? "").toUpperCase();
  if (!c) return null;
  if (c === "C_W2" || c === "C_W3" || c === "C_S2") return "delivered";
  if (c === "C_A3" || c === "C_S0") return "out-for-delivery";
  if (c.startsWith("C_EA_")) return c === "C_EA_EP" ? "returning" : "attempted";
  if (c === "C_E1" || c === "C_S3") return "returning";
  if (c === "C_P4" || c === "C_S5" || c === "C_S8") return "cancelled";
  if (c === "C_D2" || c === "C_S4" || c === "C_S9") return "on-hold";
  if (c === "C_NW" || c === "C_SC" || c === "C_KK") return "created";
  return "in-transit";
}

/** Ελληνικό ΤΚ / τηλέφωνο για το Record: 5 ψηφία, τηλέφωνο E.164 για κινητά (SMS/Viber της Γενικής). */
export const zip5 = (z: string | null | undefined) => (z ?? "").replace(/\D/g, "").slice(0, 5);
export function e164(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^30(?=\d{10}$)/, "");
  return /^69\d{8}$/.test(d) ? `+30${d}` : d;
}
