import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Προσωπικός σύνδεσμος συσκευής (SMS / email υπενθύμισης): /eg/<deviceId>.<υπογραφή>. Ανοίγει τη σελίδα της επέκτασης
 * χωρίς σύνδεση — οι πελάτες καταστημάτων δεν έχουν λογαριασμό στο site. Δείχνει μόνο τη συσκευή και την εγγύησή της·
 * οι ενέργειες (δωρεάν επέκταση, πληρωμή, διακοπή υπενθυμίσεων) ελέγχονται ξανά στον server.
 */
const secret = () => process.env.SETTINGS_KEY || process.env.AUTH_SECRET || "dev-only";
const sign = (deviceId: string) => createHmac("sha256", secret()).update(`eg:${deviceId}`).digest("base64url").slice(0, 12);

export const deviceToken = (deviceId: string) => `${deviceId}.${sign(deviceId)}`;
export const devicePath = (deviceId: string, extra = "") => `/eg/${deviceToken(deviceId)}${extra}`;

/** Το deviceId αν η υπογραφή είναι σωστή, αλλιώς null. */
export function verifyDeviceToken(token: string | null | undefined): string | null {
  const [id, k] = decodeURIComponent(token ?? "").split(".");
  if (!id || !k || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const a = Buffer.from(sign(id)), b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
