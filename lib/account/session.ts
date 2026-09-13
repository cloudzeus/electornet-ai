import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { recordLogin } from "@/lib/gdpr/consent";

/** Customer session: signed JWT cookie (30 days), separate from the staff Auth.js session. */
const COOKIE = "eu_session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export async function createCustomerSession(customerId: string) {
  const jwt = await new SignJWT({ sub: customerId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
}
export async function destroyCustomerSession() {
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
}
export async function getCustomerSession() {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, key());
    const id = String(payload.sub ?? "");
    const customer = await db.customer.findUnique({ where: { id }, select: { id: true, email: true, firstName: true, lastName: true, status: true, loyaltyPoints: true, number: true } });
    return customer && customer.status === "active" ? customer : null;
  } catch {
    return null;
  }
}

/** Email + password login with evidence on every attempt. */
export async function loginCustomer(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const c = await db.customer.findUnique({ where: { email } });
  if (!c || !c.passwordHash) { await recordLogin({ email, success: false, method: "password", reason: "unknown" }); return { ok: false as const, error: "Λάθος email ή κωδικός." }; }
  if (c.status !== "active") { await recordLogin({ customerId: c.id, email, success: false, method: "password", reason: "blocked" }); return { ok: false as const, error: "Ο λογαριασμός δεν είναι ενεργός. Επικοινώνησε μαζί μας." }; }
  if (!(await bcrypt.compare(password, c.passwordHash))) { await recordLogin({ customerId: c.id, email, success: false, method: "password", reason: "bad-password" }); return { ok: false as const, error: "Λάθος email ή κωδικός." }; }
  await db.customer.update({ where: { id: c.id }, data: { lastLoginAt: new Date() } });
  await recordLogin({ customerId: c.id, email, success: true, method: "password" });
  await db.customerEvent.create({ data: { customerId: c.id, kind: "login", meta: { method: "password" } } }).catch(() => null);
  await createCustomerSession(c.id);
  return { ok: true as const, name: c.firstName };
}
