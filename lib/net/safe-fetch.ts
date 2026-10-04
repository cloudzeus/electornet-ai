import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Λήψη αρχείου από διεύθυνση που έδωσε τρίτος (π.χ. URL φωτογραφίας στο excel ενός προμηθευτή), χωρίς να μπορεί να
 * χρησιμοποιηθεί για πρόσβαση στο εσωτερικό δίκτυο: μόνο http(s) σε θύρες 80/443, μόνο δημόσιες IP, έλεγχος σε κάθε
 * ανακατεύθυνση, όριο χρόνου και μεγέθους.
 */
function privateIp(ip: string) {
  if (isIP(ip) === 6) { const l = ip.toLowerCase(); return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.") || l.startsWith("::ffff:169.254."); }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Μη έγκυρη διεύθυνση."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Μόνο διευθύνσεις http:// ή https://");
  if (u.username || u.password) throw new Error("Η διεύθυνση δεν μπορεί να έχει κωδικούς.");
  if (u.port && u.port !== "443" && u.port !== "80") throw new Error("Μη επιτρεπτή θύρα.");
  const host = u.hostname;
  if (isIP(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost") || !host.includes(".")) throw new Error("Χρειάζεται δημόσιο domain (όχι IP ή τοπικό όνομα).");
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error(`Το ${host} δεν βρέθηκε.`);
  if (addrs.some((a) => privateIp(a.address))) throw new Error("Η διεύθυνση δεν είναι δημόσια.");
  return u;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 EuronicsMediaImport/1.0";

export async function fetchPublicBytes(url: string, opts: { max: number; accept: string; timeoutMs?: number }): Promise<{ bytes: Buffer; mime: string; url: string }> {
  let u = await assertPublicUrl(url);
  for (let hop = 0; hop < 5; hop++) {
    if (hop) u = await assertPublicUrl(u);
    const r = await fetch(u, { redirect: "manual", headers: { "user-agent": UA, accept: opts.accept }, signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = new URL(r.headers.get("location")!, u); continue; }
    if (!r.ok) throw new Error(`Ο server απάντησε ${r.status}${r.status === 403 ? " (δεν επιτρέπει λήψη)" : r.status === 404 ? " (δεν υπάρχει)" : ""}.`);
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > opts.max) throw new Error(`Το αρχείο είναι ${Math.round(len / 1048576)} MB (έως ${Math.round(opts.max / 1048576)} MB).`);
    const reader = r.body?.getReader();
    if (!reader) throw new Error("Κενή απάντηση.");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > opts.max) { await reader.cancel(); throw new Error(`Το αρχείο ξεπερνά τα ${Math.round(opts.max / 1048576)} MB.`); } chunks.push(value); }
    return { bytes: Buffer.concat(chunks), mime: (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase(), url: u.toString() };
  }
  throw new Error("Πάρα πολλές ανακατευθύνσεις.");
}
