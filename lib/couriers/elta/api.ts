/**
 * ΕΛΤΑ Courier — Customer API v3.0 (REST/JSON, «Web Services Manual Elta Courier», 20-10-2025). Καθαρές συναρτήσεις:
 * διευθύνσεις, σώματα αιτημάτων με τα όρια χαρακτήρων του manual, τηλέφωνα, ερμηνεία απαντήσεων και καταστάσεων.
 *
 *   authorization  → api_Key + expiration_date (yyyyMMdd)· στις άλλες κλήσεις header `apiKey: <api_Key>`
 *                    (ΠΡΟΣΟΧΗ: το manual γράφει `api_secret` — δοκιμασμένο στο stage: μόνο το `apiKey` γίνεται δεκτό, αλλιώς 401)
 *   CreateVoucher  → voucher_numbers.voucher_number (+ voucher_child για πολλά τεμάχια)
 *   PrintVoucher   → b64vouchersList (ένα base64 ανά τεμάχιο: master + children)
 *   TraceVoucher   → trace_details[]
 *   CancelVoucher · PundoInfo · StatusInfo
 * Επιτυχία: baseResponse.error_code = "0"· αλλιώς error_remarks.
 */
export type EltaEnv = "stage" | "production";
export const AUTH_HEADER = "apiKey";
export const eltaHost = (env: EltaEnv) => (env === "production" ? "https://ecapi.elta-courier.gr/api" : "https://wsstage.elta-courier.gr/api");

export interface EltaCreds { customerCode: string; user: string; password: string; subCode?: string | null }
export interface BaseResponse { error_code?: string | number | null; error_remarks?: string | null }

/** Το κόψιμο στο μέγιστο μήκος του manual (το API απορρίπτει μεγαλύτερες τιμές). */
export const cut = (v: string | null | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** OK όταν error_code = 0 (ή λείπει). */
export const isOk = (b: BaseResponse | null | undefined) => !b || b.error_code == null || String(b.error_code).trim() === "" || Number(b.error_code) === 0;
export const errorText = (b: BaseResponse | null | undefined) => (b?.error_remarks ?? "").trim() || `Κωδικός σφάλματος ${b?.error_code ?? "?"}`;
/** Σφάλματα που σημαίνουν «το κλειδί έληξε / δεν ισχύει» → νέα σύνδεση και μία επανάληψη. */
export const isAuthError = (status: number, b?: BaseResponse | null) => status === 401 || status === 403 || /api.?key|api_secret|token|expir|unauthori|λήξ|ληξ|μη εξουσιοδ/i.test(b?.error_remarks ?? "");

/** Ελληνικό τηλέφωνο σε 10 ψηφία (χωρίς +30/0030)· ξένο → όπως είναι (έως 15). */
export function phoneOf(raw: string | null | undefined): { mobile: string; telefon: string; foreign: string } {
  const d = (raw ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "00");
  const gr = d.replace(/^0030/, "").replace(/^30(?=\d{10}$)/, "");
  if (/^69\d{8}$/.test(gr)) return { mobile: gr, telefon: "", foreign: "" };
  if (/^2\d{9}$/.test(gr)) return { mobile: "", telefon: gr, foreign: "" };
  return { mobile: "", telefon: "", foreign: d.slice(0, 15) };
}
export const zip5 = (z: string | null | undefined) => (z ?? "").replace(/\D/g, "").slice(0, 5);
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

export interface EltaParty { name: string; address: string; area: string; zip: string; phone?: string | null; email?: string | null; remarks?: string | null }
export interface EltaVoucherInput {
  sender: EltaParty; receiver: EltaParty;
  pieces: number; weightKg: number; insurance?: number; dims?: { x: number; y: number; z: number } | null;
  /** 1 Door to Door (προεπιλογή) · 2 Office to Door · 3 Office to Office · 4 Door to Office · 7 PUDO · 8 FPC Κύπρος */
  service?: 1 | 2 | 3 | 4 | 7 | 8; pudoCode?: string | null;
  cod?: number; refs?: [string?, string?, string?]; additionalServices?: string[];
  /** παραγγελία παραλαβής μαζί με το voucher (order_flag=1) για την ημερομηνία αυτή */
  pickup?: { date: Date; from?: string; to?: string } | null;
}

function party(p: EltaParty, receiver: boolean) {
  const ph = phoneOf(p.phone);
  return {
    cust_title: cut(p.name, 30), cust_address: cut(p.address, 50),
    // το manual γράφει «Max 4» για την περιοχή παραλήπτη — προφανές τυπογραφικό (αποστολέας: 40)
    cust_area: cut(p.area, 40), cust_postal_code: cut(zip5(p.zip) || p.zip, 10),
    cust_telefon: ph.telefon, cust_mobile: ph.mobile, cust_mobileExoterikou: ph.foreign,
    cust_email: cut(p.email, receiver ? 40 : 50), cust_remarks: cut(p.remarks, 150),
  };
}

/** Το σώμα του CreateVoucher. Χωρίς voucher_number → η ΕΛΤΑ δίνει νέο. */
export function createVoucherBody(c: EltaCreds, v: EltaVoucherInput) {
  const cod = Math.round((v.cod ?? 0) * 100) / 100;
  return {
    userCode: cut(c.user, 12), userPassword: c.password, pelCode: cut(c.customerCode, 12), pelType: 1, pelSubCode: cut(c.subCode, 10), ARSubCode: "", recCode: "",
    voucher_numbers: { voucher_number: "", voucher_child: [], epitagi_number: "", ar_number: "" },
    sender_details: party(v.sender, false),
    receiver_details: party(v.receiver, true),
    voucher_details: {
      voucher_service: v.service ?? 1, voucher_charge: 1,
      voucher_packages: Math.max(1, Math.round(v.pieces)), voucher_actual_weight: Math.round(Math.max(0.1, v.weightKg) * 100) / 100,
      voucher_insurance_amount: Math.round((v.insurance ?? 0) * 100) / 100,
      dim_x: Math.min(999, Math.round(v.dims?.x ?? 0)), dim_y: Math.min(999, Math.round(v.dims?.y ?? 0)), dim_z: Math.min(999, Math.round(v.dims?.z ?? 0)),
      additional_services: v.additionalServices ?? [], pudo_code: v.service === 7 ? cut(v.pudoCode, 20) : "",
      reference1: cut(v.refs?.[0], 50), reference2: cut(v.refs?.[1], 50), reference3: cut(v.refs?.[2], 50),
    },
    cod_details: cod > 0 ? { cod_type: 1, cod_amount: cod, cod_date: "" } : { cod_type: 0, cod_amount: 0, cod_date: "" },
    order_details: v.pickup ? { order_flag: 1, pickup_date: ymd(v.pickup.date), pickup_start_time: v.pickup.from ?? "", pickup_end_time: v.pickup.to ?? "" } : { order_flag: 0, pickup_date: "", pickup_start_time: "", pickup_end_time: "" },
  };
}

export interface CreateVoucherResponse { baseResponse?: BaseResponse; voucher_numbers?: { voucher_number?: string; voucher_child?: { child_number?: string }[] | null }; print_fields?: Record<string, string>; orderNumber?: string }
export function parseCreated(r: CreateVoucherResponse) {
  const voucher = (r.voucher_numbers?.voucher_number ?? "").trim();
  return { voucher, children: (r.voucher_numbers?.voucher_child ?? []).map((x) => (x.child_number ?? "").trim()).filter(Boolean), pickupOrder: (r.orderNumber ?? "").trim() || null, print: r.print_fields ?? null };
}

/** Ακύρωση: τα flags/type/id με τις προεπιλογές του manual. */
export const cancelBody = (c: EltaCreds, voucher: string, comments = "") => ({ pelCode: cut(c.customerCode, 12), pelUserCode: c.user, flag1: "0", flag2: "0", type: "2", voucher, id: 0, cancelComments: cut(comments, 150) });
export const traceBody = (c: EltaCreds, voucher: string) => ({ userCode: c.user, userPassword: c.password, pelCode: c.customerCode, voucher, voucherNum: voucher, dateFrom: "", dateTo: "", paralCode: "", statusFlag: "" });
export const printBody = (c: EltaCreds, voucher: string) => ({ userCode: c.user, userPassword: c.password, pelCode: c.customerCode, voucherNum: voucher });
export const credsBody = (c: EltaCreds) => ({ userCode: c.user, userPassword: c.password, pelCode: c.customerCode });

/** Ημερομηνία της ΕΛΤΑ (dd/MM/yyyy, yyyyMMdd ή ISO, με ώρα HH:mm / HHmm) → ISO· άγνωστη μορφή → null. */
export function eltaDate(date?: string | null, time?: string | null): string | null {
  const d = (date ?? "").trim(), t = (time ?? "").trim().replace(/\D/g, "").padEnd(6, "0").slice(0, 6); // HH:mm, HHmm ή HHmmss
  let y: string, m: string, day: string;
  let mm = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (mm) [day, m, y] = [mm[1], mm[2], mm[3]];
  else if ((mm = d.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) [y, m, day] = [mm[1], mm[2], mm[3]];
  else return null;
  const iso = `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export type ShipState = "in-transit" | "out-for-delivery" | "attempted" | "on-hold" | "returning" | "returned" | "delivered";

/**
 * Κωδικοί του StatusInfo (stage, 10/2026) → κατάσταση. null = δεν αλλάζει κατάσταση (δημιουργία voucher, SMS, λάθος
 * σκαναρίσματος 91xx). Ό,τι δεν είναι εδώ: από το κείμενο (stateOf), αλλιώς «σε μεταφορά».
 */
const DELIVERED = ["9950", "9951", "9953", "9961", "702"];
const RETURNED = ["9920", "9940"];
const RETURNING = ["142", "148", "9802", "9805", "9959", "9965", "9966", "265"];
const OUT = ["9909", "9910", "9915", "9975"];
const HOLD = ["125", "147", "707", "9840", "9944", "9945", "9946", "9958", "9957", "9972", "9973"];
const PROBLEM = ["127", "710", "711", "712", "713", "9896", "9971"];
const NEUTRAL = ["9200", "9811", "9813", "9814", "9815", "9816", "9817", "9818", "9810", "9825", "9829", "9850", "9300", "9952"];
export function stateOfCode(code: string | null | undefined, text?: string | null): ShipState | null {
  const c = (code ?? "").trim();
  if (DELIVERED.includes(c)) return "delivered";
  if (RETURNED.includes(c)) return "returned";
  if (RETURNING.includes(c)) return "returning";
  if (OUT.includes(c)) return "out-for-delivery";
  if (HOLD.includes(c)) return "on-hold";
  if (PROBLEM.includes(c)) return "attempted";
  if (NEUTRAL.includes(c) || /^91\d\d$/.test(c)) return null;
  // 110–149, 199, 399: λόγοι μη επίδοσης (λάθος διεύθυνση, απουσία, άρνηση…)
  if (/^1[1-4]\d$|^199$|^399$/.test(c)) return "attempted";
  return text ? stateOf(text) : c ? "in-transit" : null;
}

/** Από το κείμενο (ελληνικά/αγγλικά), για κωδικούς εκτός πίνακα. */
export function stateOf(text: string | null | undefined): ShipState {
  const s = (text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/ΕΠΙΔΟΣΗ ΣΤΟΝ ΑΠΟΣΤΟΛΕΑ|ΕΧΕΙ ΕΠΙΣΤΡΑΦΕΙ|ΕΠΕΣΤΡΑΦ|RETURNED TO SENDER|DELIVERED TO SENDER/.test(s)) return "returned";
  if (/ΕΠΙΣΤΡΟΦ|ΑΖΗΤΗΤ|RETURN/.test(s)) return "returning";
  if (/ΠΑΡΑΔΟΘΗΚΕ|ΕΠΙΔΟΘΗΚΕ|ΕΠΙΔΟΣΗ|DELIVERED/.test(s)) return "delivered";
  if (/ΑΠΟΥΣ|ΑΝΕΠΙΤΥΧ|ΔΕΝ ΕΝΤΟΠΙΖ|ΑΡΝΗΣ|ΛΑΘΟΣ ΔΙΕΥΘ|ΕΛΛΕΙΠ|FAILED|ABSENT|REFUS|NOT FOUND|WRONG ADDRESS|LOST|MISSING|DAMAGED/.test(s)) return "attempted";
  if (/ΠΡΟΣ ΠΑΡΑΔΟΣΗ|ΔΙΑΝΟΜΗ|OUT FOR DELIVERY|ON DELIVERY/.test(s)) return "out-for-delivery";
  if (/ΘΥΡΙΔ|POSTBOX|ΕΙΔΟΠΟΙΗ|ΑΝΑΜΟΝΗ|HOLD|AWAITING|READY FOR PICK/.test(s)) return "on-hold";
  return "in-transit";
}

export interface TraceResponse {
  baseResponse?: BaseResponse; voucher?: string; delivery_date?: string; delivery_time?: string; delivery_remarks?: string;
  trace_details?: { trace_Status_code?: string; trace_Status_gr?: string; trace_Status_en?: string; trace_Station_gr?: string; trace_Station_en?: string; trace_date?: string; trace_time?: string; trace_remarks?: string }[] | null;
}
export interface EltaTrack { state: ShipState | null; deliveredAt: string | null; checkpoints: { code: string; text: string; at: string | null; shop: string | null }[] }
/** Τα σημεία με χρονολογική σειρά και η τρέχουσα κατάσταση (null = δεν έχει σκαναριστεί ακόμη). */
export function parseTrace(r: TraceResponse): EltaTrack {
  const checkpoints = (r.trace_details ?? []).map((t) => ({ code: (t.trace_Status_code ?? "").trim(), text: (t.trace_Status_gr || t.trace_Status_en || "").trim(), at: eltaDate(t.trace_date, t.trace_time), shop: (t.trace_Station_gr || t.trace_Station_en || "").trim() || null }))
    .filter((c) => c.code || c.text)
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const d = eltaDate(r.delivery_date, r.delivery_time);
  const deliveredAt = d && d >= "2000" ? d : null; // κενές ημερομηνίες έρχονται ως 01/01/1900
  // η τελευταία κίνηση που λέει κάτι για την κατάσταση (όχι δημιουργία voucher, SMS, λάθος σκαναρίσματος)
  const state = [...checkpoints].reverse().map((c) => stateOfCode(c.code, c.text)).find((x) => x !== null) ?? null;
  return { state: deliveredAt && state !== "returned" && state !== "returning" ? "delivered" : state, deliveredAt, checkpoints };
}
