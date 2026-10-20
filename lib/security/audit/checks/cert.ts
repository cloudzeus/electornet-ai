import tls from "node:tls";
import type { Check } from "../types";
import { certOutcome, issuerName, type CertInfo } from "./cert-core";
import { siteOrigin } from "./site-origin";

/**
 * Πιστοποιητικό TLS του δημόσιου URL: σύνδεση node:tls στο host:443 με SNI, χωρίς απόρριψη (ώστε να διαβαστεί και ένα
 * άκυρο πιστοποιητικό) — η εγκυρότητα κρίνεται από το `authorized` όπως θα την έκρινε ο browser.
 */
function peerCert(host: string, signal?: AbortSignal): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("ακύρωση (χρονικό όριο)"));
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 15_000 });
    const done = (fn: () => void) => { signal?.removeEventListener("abort", onAbort); sock.destroy(); fn(); };
    const onAbort = () => done(() => reject(new Error("ακύρωση (χρονικό όριο)")));
    signal?.addEventListener("abort", onAbort, { once: true });
    sock.once("secureConnect", () => {
      const c = sock.getPeerCertificate();
      if (!c || !c.valid_to) return done(() => reject(new Error(`ο ${host} δεν έδωσε πιστοποιητικό`)));
      const err = sock.authorizationError;
      const info: CertInfo = {
        host, validTo: c.valid_to, validFrom: c.valid_from, issuer: issuerName(c.issuer as unknown as Record<string, string>),
        subject: c.subject?.CN ? String(c.subject.CN) : undefined, authorized: sock.authorized,
        authError: err ? String((err as Error & { code?: string }).code ?? err) : null,
      };
      done(() => resolve(info));
    });
    sock.once("timeout", () => done(() => reject(new Error(`ο ${host}:443 δεν απάντησε σε 15″`))));
    sock.once("error", (e) => done(() => reject(e)));
  });
}

export const certCheck: Check = {
  key: "cert",
  title: "Πιστοποιητικό HTTPS",
  modes: ["full"],
  timeoutMs: 30_000,
  async run({ now, signal }) {
    const { origin, source } = await siteOrigin();
    const host = new URL(origin).hostname;
    let info: CertInfo;
    try { info = await peerCert(host, signal); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: "error", summary: `Η σύνδεση TLS στο ${host}:443 απέτυχε — το πιστοποιητικό δεν ελέγχθηκε.`, findings: [{ severity: "error", title: "Το πιστοποιητικό δεν ελέγχθηκε", detail: `${host}:443 (πηγή URL: ${source}): ${msg}`, evidence: host }] };
    }
    const r = certOutcome(info, now);
    return { ...r, summary: `${r.summary} · URL: ${origin} (πηγή: ${source})` };
  },
};
