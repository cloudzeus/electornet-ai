import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";

/**
 * Συνεδρία της πύλης συνεργατών: υπογεγραμμένο JWT cookie 12 ωρών, χωριστό από πελάτες (eu_session) και προσωπικό
 * (Auth.js). Δίνεται μόνο μετά από κωδικό + OTP στο email (lib/partner-portal/auth.ts).
 */
const COOKIE = "syn_session";
const TTL_H = 12;
const key = () => new TextEncoder().encode(`${process.env.AUTH_SECRET ?? "dev-secret"}:synergaton`);

export async function createPortalSession(accountId: string) {
  const jwt = await new SignJWT({ sub: accountId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${TTL_H}h`).sign(key());
  (await cookies()).set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_H * 3600 });
}

export async function destroyPortalSession() {
  (await cookies()).set(COOKIE, "", { path: "/", maxAge: 0 });
}

export type PortalUser = NonNullable<Awaited<ReturnType<typeof getPortalUser>>>;

/** Ο συνδεδεμένος λογαριασμός με την επαφή και το μέλος του, ή null. Ανενεργό μέλος/λογαριασμός = καμία συνεδρία. */
export const getPortalUser = cache(async () => {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, key());
    const a = await db.partnerAccount.findUnique({
      where: { id: String(payload.sub ?? "") },
      include: { contact: { include: { partner: { select: { id: true, name: true, code: true, category: true, status: true, active: true, onboarding: true, city: true } } } } },
    });
    if (!a || !a.active || !a.contact.partner.active) return null;
    // ο κωδικός άλλαξε μετά την έκδοση της συνεδρίας → άκυρη (αποσύνδεση σε όλες τις συσκευές)
    if (a.passwordAt && payload.iat && a.passwordAt.getTime() > payload.iat * 1000 + 1000) return null;
    return { accountId: a.id, email: a.email, name: a.contact.name, contactId: a.contactId, role: a.contact.role, partner: a.contact.partner };
  } catch {
    return null;
  }
});

/** Η βάση των διαδρομών: "" στο synergaton.* (καθαρά URL μέσω rewrite), "/synergaton" αλλού (dev, κύριο domain). */
export const portalBase = cache(async () => {
  const host = (await headers()).get("host") ?? "";
  return /^synergaton\./i.test(host) ? "" : "/synergaton";
});

/** Για σελίδες που θέλουν σύνδεση. */
export async function requirePortalUser() {
  const u = await getPortalUser();
  if (!u) redirect(`${await portalBase()}/eisodos`);
  return u;
}

/** Το δημόσιο URL της πύλης για links σε email (PORTAL_URL, π.χ. https://synergaton.dgsmart.gr). */
export function portalUrl(path: string) {
  const base = (process.env.PORTAL_URL ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3111"}/synergaton`).replace(/\/$/, "");
  return base + path;
}
