/** Ελληνικό τηλέφωνο σε 10 ψηφία (χωρίς +30 / 0030 / κενά). */
export const phoneDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^(00)?30(?=\d{10}$)/, "");

/**
 * Ταιριάζει το κινητό ή το email που έγραψε ο επισκέπτης με κάποιο της παραγγελίας; (δημόσιος εντοπισμός)
 * Email: ακριβώς (πεζά)· τηλέφωνο: τα 10 ψηφία, με ή χωρίς +30 / κενά.
 */
export function contactMatches(input: string, emails: unknown[], phones: unknown[]): boolean {
  const c = input.trim().toLowerCase();
  if (c.length < 5) return false;
  if (c.includes("@")) return emails.map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean).includes(c);
  const d = phoneDigits(c);
  return d.length >= 10 && phones.map(phoneDigits).filter((x) => x.length >= 10).includes(d);
}
