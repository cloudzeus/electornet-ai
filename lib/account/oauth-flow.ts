import "server-only";
import { cookies, headers } from "next/headers";
import type { OAuthProvider } from "./oauth";

/** Η δημόσια διεύθυνση του site όπως τη βλέπει ο browser (πίσω από reverse proxy: x-forwarded-*). */
export async function publicOrigin(req?: Request) {
  const h = await headers();
  const u = req ? new URL(req.url) : null;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || u?.host || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || u?.protocol.replace(":", "") || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Ασφαλής επιστροφή: μόνο σχετική διαδρομή του ίδιου site. */
export const safeNext = (n: string | null | undefined) => (n && /^\/(?!\/)/.test(n) && !n.startsWith("/api/") ? n.slice(0, 500) : "/logariasmos");

const COOKIE = "eu_oauth";
export interface FlowState { p: OAuthProvider; state: string; nonce: string; verifier: string; next: string; mode: "login" | "test"; at: number }

/** Το cookie ζει 10 λεπτά. SameSite=None ώστε να φτάνει και στο POST επιστροφής της Apple (form_post). */
export async function saveFlow(f: FlowState, secure: boolean) {
  (await cookies()).set(COOKIE, JSON.stringify(f), { httpOnly: true, secure, sameSite: secure ? "none" : "lax", path: "/api/account/oauth", maxAge: 600 });
}
export async function takeFlow(): Promise<FlowState | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.set(COOKIE, "", { path: "/api/account/oauth", maxAge: 0 });
  if (!raw) return null;
  try { const f = JSON.parse(raw) as FlowState; return Date.now() - f.at < 600_000 ? f : null; } catch { return null; }
}
