/**
 * Σύνδεση διαχείρισης χωρίς OTP από γνωστές διευθύνσεις (π.χ. το γραφείο).
 * Λίστα στο env `ADMIN_TRUSTED_IPS` (χωρισμένες με κόμμα). Κενό = πάντα OTP.
 *
 * Το euronics.gr δεν περνά από Cloudflare, οπότε τα `cf-connecting-ip`,
 * `x-real-ip` και οι πρώτες τιμές του `x-forwarded-for` τα γράφει όποιος
 * θέλει. Μετρά μόνο η ΤΕΛΕΥΤΑΙΑ τιμή του `x-forwarded-for`: αυτή την
 * προσθέτει ο δικός μας proxy (Coolify) από την πραγματική σύνδεση.
 */
export function proxyPeerIp(xff: string | null | undefined): string | null {
  const last = (xff ?? "").split(",").pop()?.trim().replace(/^::ffff:/, "");
  return last || null;
}

export function isTrustedAdminIp(xff: string | null | undefined, list = process.env.ADMIN_TRUSTED_IPS ?? ""): boolean {
  const ip = proxyPeerIp(xff);
  if (!ip) return false;
  return list.split(",").map((s) => s.trim()).filter(Boolean).includes(ip);
}
