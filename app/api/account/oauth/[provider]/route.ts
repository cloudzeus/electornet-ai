import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authorizeUrl, missing, newFlow, providerConfigs, PROVIDERS, type OAuthProvider } from "@/lib/account/oauth";
import { publicOrigin, safeNext, saveFlow } from "@/lib/account/oauth-flow";

/**
 * Έναρξη σύνδεσης: GET /api/account/oauth/<google|microsoft|facebook|apple>?next=/checkout
 * ?mode=test (μόνο για συνδεδεμένο προσωπικό): δοκιμή από τις ρυθμίσεις — δεν δημιουργεί λογαριασμό, δουλεύει και
 * όταν ο πάροχος είναι ακόμη κλειστός για τους πελάτες.
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const u = new URL(req.url);
  const origin = await publicOrigin(req);
  const next = safeNext(u.searchParams.get("next"));
  if (!PROVIDERS.includes(provider as OAuthProvider)) return NextResponse.redirect(new URL(`/syndesi?error=off&next=${encodeURIComponent(next)}`, origin));
  const test = u.searchParams.get("mode") === "test";
  if (test && !(await auth())?.user) return NextResponse.json({ error: "μόνο για προσωπικό" }, { status: 403 });
  const c = (await providerConfigs())[provider as OAuthProvider];
  if ((!c.enabled && !test) || missing(c).length) return NextResponse.redirect(new URL(test ? `/admin/settings/social-login?test=${provider}&error=${encodeURIComponent(`Λείπουν: ${missing(c).join(", ") || "—"}`)}#p-${provider}` : `/syndesi?error=off&next=${encodeURIComponent(next)}`, origin));
  const f = newFlow();
  await saveFlow({ p: c.provider, state: f.state, nonce: f.nonce, verifier: f.verifier, next, mode: test ? "test" : "login", at: Date.now() }, origin.startsWith("https://") || /\/\/localhost[:/]/.test(origin));
  return NextResponse.redirect(authorizeUrl(c, origin, f));
}
