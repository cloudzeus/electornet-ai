/**
 * Καταγραφή κλήσεων SoftOne — καθαρές συναρτήσεις: τι είδους κλήση είναι, τι κρατιέται από την απάντηση, πότε είναι σφάλμα,
 * και το κείμενο του email σφάλματος. Η εγγραφή στη βάση και η αποστολή είναι στο log.ts.
 */
export interface S1Call { service: string; object: string | null; key: string | null; write: boolean; /** κρατιέται ολόκληρη η απάντηση */ full: boolean }
export interface S1Entry extends S1Call { at: string; ok: boolean; errorCode: number | null; error: string | null; http: number | null; ms: number; source: string | null; request: unknown; response: string; bytes: number }

const WRITES = new Set(["setdata", "deldata", "einvoice", "changepassword"]);
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

/** Από το σώμα του αιτήματος (και τη διαδρομή, για το iSite): υπηρεσία, αντικείμενο, κλειδί, αν γράφει στο ERP. */
export function describeCall(body: Record<string, unknown>, path = ""): S1Call {
  const fn = /\/JS\/iSite\/(\w+)/.exec(path)?.[1];
  const service = fn ? `iSite/${fn}` : String(body.service ?? body.SERVICE ?? "άγνωστο");
  const write = fn ? /^(set|del|save|update|insert)/i.test(fn) : WRITES.has(service.toLowerCase());
  return {
    service, write, full: write || service.toLowerCase() === "calculate",
    object: str(body.OBJECT ?? body.object ?? body.TABLE ?? body.SqlName ?? body.MTRL),
    key: str(body.KEY ?? body.key),
  };
}

/** Το αίτημα όπως θα κρατηθεί: χωρίς τον κωδικό του χρήστη και χωρίς το clientID (είναι το κλειδί της σύνδεσης). */
export function redact(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const k of ["PASSWORD", "password"]) if (k in out) out[k] = "***";
  if (typeof out.clientID === "string") out.clientID = `…${out.clientID.slice(-4)}`;
  return out;
}

/** -100 / -101 = έληξε η σύνδεση: ο client ξανασυνδέεται μόνος του, δεν είναι σφάλμα. */
export const isSessionExpired = (data: unknown) => { const c = (data as { errorcode?: unknown } | null)?.errorcode; return c === -100 || c === -101; };
/** Σφάλμα = το SoftOne απάντησε success:false (εκτός λήξης σύνδεσης). Η κλήση που «έσκασε» (δίκτυο, timeout) μετρά χωριστά. */
export const isErrorResponse = (data: unknown) => (data as { success?: unknown } | null)?.success === false && !isSessionExpired(data);

export const FULL_MAX = 500_000, HEAD_MAX = 2_000;
/** Ολόκληρη η απάντηση σε εγγραφές / υπολογισμούς / σφάλματα (έως 500.000 χαρακτήρες)· στις αναγνώσεις οι πρώτοι 2.000. */
export const storedResponse = (text: string, full: boolean) => text.slice(0, full ? FULL_MAX : HEAD_MAX);

/** Ίδιο σφάλμα = ίδια υπηρεσία, αντικείμενο, πηγή και μήνυμα — για να μη στέλνεται το ίδιο email κάθε λεπτό. */
export const errorSignature = (e: Pick<S1Entry, "service" | "object" | "source" | "errorCode" | "error">) => [e.service, e.object, e.source, e.errorCode, (e.error ?? "").replace(/\d+/g, "#").slice(0, 160)].join("|");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pretty = (v: unknown) => { try { return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v, null, 2); } catch { return String(v ?? ""); } };

/** Το email σφάλματος: τι κλήθηκε, από πού, τι απάντησε το SoftOne — με ολόκληρο το αίτημα και την απάντηση. */
export function errorMail(e: S1Entry, o: { env: string; logUrl?: string | null; extra?: [string, string][]; blocks?: [string, string][] }): { subject: string; html: string; text: string } {
  const what = [e.service, e.object].filter(Boolean).join(" ");
  const rows: [string, string][] = [
    ["Πότε", new Date(e.at).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "medium", timeStyle: "medium" })],
    ["Περιβάλλον", o.env], ["Λειτουργία", e.source ?? "δεν δηλώθηκε"], ["Υπηρεσία", e.service], ["Αντικείμενο", e.object ?? "—"], ["Κλειδί", e.key ?? "—"],
    ["Εγγραφή στο ERP", e.write ? "ναι" : "όχι (ανάγνωση / υπολογισμός)"], ["HTTP", e.http == null ? "καμία απάντηση" : String(e.http)], ["Διάρκεια", `${e.ms} ms`],
    ["Κωδικός σφάλματος", e.errorCode == null ? "—" : String(e.errorCode)], ["Μήνυμα", e.error ?? "—"], ...(o.extra ?? []),
    ...(o.logUrl ? [["Καταγραφή", o.logUrl] as [string, string]] : []),
  ];
  const blocks: [string, string][] = [["Αίτημα (χωρίς κωδικό και clientID)", pretty(e.request)], [`Απάντηση SoftOne (${e.bytes} χαρακτήρες${e.bytes > e.response.length ? `, εδώ οι πρώτοι ${e.response.length}` : ""})`, e.response ? pretty(e.response) : "(κενή)"], ...(o.blocks ?? [])];
  const subject = `Σφάλμα SoftOne: ${what} · ${(e.error ?? "χωρίς μήνυμα").slice(0, 110)}`;
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), ...blocks.map(([k, v]) => `\n--- ${k} ---\n${v}`)].join("\n");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:14px;color:#1a1a1a"><h2 style="margin:0 0 12px;font-size:18px;color:#b3261e">Σφάλμα στη σύνδεση με το SoftOne</h2><table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>${blocks.map(([k, v]) => `<h3 style="margin:18px 0 6px;font-size:14px">${esc(k)}</h3><pre style="margin:0;padding:10px;background:#f4f5f7;border:1px solid #dde0e6;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-all">${esc(v)}</pre>`).join("")}</div>`;
  return { subject, html, text };
}
