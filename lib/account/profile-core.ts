import { SignJWT, jwtVerify } from "jose";
import { isEmail } from "@/lib/newsletter/core";

/**
 * Καθαρή λογική της σελίδας «Τα στοιχεία μου» (χωρίς βάση / server-only, ώστε να δοκιμάζεται με node:test):
 * έλεγχος των στοιχείων του PATCH /api/account/profile, έλεγχος νέου email, το υπογεγραμμένο token αλλαγής email
 * και ένα απλό όριο αιτημάτων ανά κλειδί.
 */

export type CustomerType = "individual" | "business";

export interface ProfileInput { firstName?: unknown; lastName?: unknown; phone?: unknown; birthday?: unknown; vat?: unknown; type?: unknown; company?: unknown; doy?: unknown; profession?: unknown }
export interface ProfileData { firstName: string; lastName: string; mobile: string | null; birthday: string | null; vatNumber: string | null; type: CustomerType; company: string | null; doy: string | null; profession: string | null }

const str = (v: unknown) => (typeof v === "string" ? v : "").trim();

/** Έλεγχος + κανονικοποίηση. Επιχείρηση: επωνυμία και ΑΦΜ 9 ψηφίων υποχρεωτικά. Ιδιώτης: ΑΦΜ προαιρετικός, χωρίς επαγγελματικά πεδία. */
export function validateProfile(b: ProfileInput, now = new Date()): { ok: true; data: ProfileData } | { ok: false; error: string } {
  const firstName = str(b.firstName), lastName = str(b.lastName);
  const phone = str(b.phone).replace(/[\s-]/g, ""), vat = str(b.vat).replace(/\s/g, ""), birthday = str(b.birthday);
  const type: CustomerType = b.type === "business" ? "business" : "individual";
  const company = str(b.company).replace(/\s+/g, " "), doy = str(b.doy).replace(/\s+/g, " "), profession = str(b.profession).replace(/\s+/g, " ");
  if (!firstName || !lastName) return { ok: false, error: "Όνομα και επώνυμο είναι υποχρεωτικά." };
  if (phone && !/^(\+30)?\d{10}$/.test(phone)) return { ok: false, error: "Το κινητό θέλει 10 ψηφία." };
  if (type === "business" && !vat) return { ok: false, error: "Για τιμολόγιο χρειάζεται ο ΑΦΜ της επιχείρησης." };
  if (vat && !/^\d{9}$/.test(vat)) return { ok: false, error: "Ο ΑΦΜ έχει 9 ψηφία." };
  if (type === "business" && !company) return { ok: false, error: "Συμπλήρωσε την επωνυμία της επιχείρησης." };
  if (birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || Number.isNaN(new Date(birthday).getTime()) || new Date(birthday) > now)) return { ok: false, error: "Η ημερομηνία γέννησης δεν είναι σωστή." };
  const biz = type === "business";
  return {
    ok: true,
    data: {
      firstName: firstName.slice(0, 80), lastName: lastName.slice(0, 80), mobile: phone || null, birthday: birthday || null, vatNumber: vat || null, type,
      company: biz ? company.slice(0, 190) : null, doy: biz ? doy.slice(0, 120) || null : null, profession: biz ? profession.slice(0, 190) || null : null,
    },
  };
}

export const normEmail = (e: unknown) => str(e).toLowerCase();

/** Μάσκα για logs/ιστορικό: «ma***@example.gr» — ποτέ ολόκληρο email σε log. */
export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  if (!d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

/** Έλεγχος νέου email πριν σταλεί σύνδεσμος. */
export function checkNewEmail(newEmail: string, current: string | null | undefined): string | null {
  if (!newEmail) return "Γράψε το νέο email.";
  if (newEmail.length > 190 || !isEmail(newEmail)) return "Το email δεν φαίνεται σωστό.";
  if (current && newEmail === current.trim().toLowerCase()) return "Αυτό είναι ήδη το email σου.";
  return null;
}

/* ---------- token αλλαγής email (stateless, υπογεγραμμένο) ---------- */

export const EMAIL_CHANGE_AUD = "email-change";
export const EMAIL_CHANGE_HOURS = 24;
const keyOf = (secret: string) => new TextEncoder().encode(secret);

export interface EmailChangeClaim { sub: string; old: string; new: string }

export async function signEmailChange(c: EmailChangeClaim, secret: string, hours = EMAIL_CHANGE_HOURS) {
  return new SignJWT({ old: c.old, new: c.new }).setProtectedHeader({ alg: "HS256" }).setSubject(c.sub).setAudience(EMAIL_CHANGE_AUD).setIssuedAt().setExpirationTime(`${hours}h`).sign(keyOf(secret));
}

/** `null` όταν το token είναι άκυρο, ληγμένο ή για άλλη χρήση (π.χ. cookie συνεδρίας χωρίς aud). */
export async function verifyEmailChange(token: string, secret: string): Promise<EmailChangeClaim | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), { audience: EMAIL_CHANGE_AUD, algorithms: ["HS256"] });
    const sub = String(payload.sub ?? ""), old = String(payload.old ?? ""), nw = String(payload.new ?? "");
    return sub && old && nw ? { sub, old, new: nw } : null;
  } catch {
    return null;
  }
}

/* ---------- όριο αιτημάτων (στη μνήμη της διεργασίας) ---------- */

/** `hit(key)` → true όταν ξεπεράστηκε το όριο `max` μέσα στο παράθυρο `windowMs`. */
export function rateLimiter(max: number, windowMs: number) {
  const bucket = new Map<string, { n: number; at: number }>();
  return {
    hit(key: string, now = Date.now()) {
      const b = bucket.get(key);
      if (!b || now - b.at > windowMs) { bucket.set(key, { n: 1, at: now }); return false; }
      b.n++;
      return b.n > max;
    },
  };
}
