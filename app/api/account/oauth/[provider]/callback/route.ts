import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { exchange, providerConfigs, PROVIDER_LABEL, PROVIDERS, type OAuthProvider } from "@/lib/account/oauth";
import { publicOrigin, takeFlow } from "@/lib/account/oauth-flow";
import { signInWithProfile } from "@/lib/account/social";

/**
 * Επιστροφή από τον πάροχο. GET για Google / Microsoft / Facebook, POST (form_post) για Apple.
 * Ελέγχει το state του cookie, ανταλλάσσει τον κωδικό, και συνδέει / δημιουργεί τον πελάτη.
 */
async function handle(req: Request, provider: string, q: { code?: string | null; state?: string | null; error?: string | null; user?: string | null }) {
  const origin = await publicOrigin(req);
  const flow = await takeFlow();
  const back = (path: string) => NextResponse.redirect(new URL(path, origin), 303);
  if (!PROVIDERS.includes(provider as OAuthProvider) || !flow || flow.p !== provider || !q.state || q.state !== flow.state) return back(`/syndesi?error=state`);
  const test = flow.mode === "test";
  const testPage = (ok: boolean, msg: string) => back(`/admin/settings/social-login?test=${provider}&${ok ? "ok" : "error"}=${encodeURIComponent(msg)}#p-${provider}`);
  if (q.error || !q.code) return test ? testPage(false, `Ο χρήστης ακύρωσε ή ο πάροχος απάντησε «${q.error ?? "χωρίς κωδικό"}».`) : back(`/syndesi?error=failed&next=${encodeURIComponent(flow.next)}`);
  try {
    const c = (await providerConfigs())[provider as OAuthProvider];
    const profile = await exchange(c, origin, q.code, flow.verifier, flow.nonce, q.user);
    if (test) return testPage(true, `Η σύνδεση με ${PROVIDER_LABEL[c.provider]} δουλεύει: ${profile.firstName} ${profile.lastName}${profile.email ? ` · ${profile.email}` : " · χωρίς email"}${profile.email ? (profile.emailVerified ? " (επιβεβαιωμένο)" : " (μη επιβεβαιωμένο)") : ""}. Δεν δημιουργήθηκε λογαριασμός.`);
    const h = await headers();
    const r = await signInWithProfile(profile, { ip: h.get("x-forwarded-for")?.split(",")[0] ?? null, userAgent: h.get("user-agent") });
    if (!r.ok) return back(`/syndesi?error=${r.error}&next=${encodeURIComponent(flow.next)}`);
    return back(flow.next);
  } catch (e) {
    console.error("[oauth]", provider, e instanceof Error ? e.message : e);
    return test ? testPage(false, e instanceof Error ? e.message : "Αποτυχία") : back(`/syndesi?error=failed&next=${encodeURIComponent(flow.next)}`);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const u = new URL(req.url);
  return handle(req, provider, { code: u.searchParams.get("code"), state: u.searchParams.get("state"), error: u.searchParams.get("error") });
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const f = await req.formData().catch(() => null);
  return handle(req, provider, { code: f?.get("code") as string | null, state: f?.get("state") as string | null, error: f?.get("error") as string | null, user: f?.get("user") as string | null });
}
