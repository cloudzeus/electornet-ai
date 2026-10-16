import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, decodeJwt, importPKCS8 } from "jose";
import { getSetting } from "@/lib/settings/store";

/**
 * Σύνδεση πελατών με Google, Microsoft, Facebook, Apple (OAuth 2.0 authorization code + PKCE / OpenID Connect).
 * Τα στοιχεία έρχονται από Ρυθμίσεις → Social login. Το id_token παραλαμβάνεται απευθείας από το token endpoint του
 * παρόχου μέσω TLS (back-channel), οπότε κατά OIDC Core §3.1.3.7 ελέγχονται issuer / audience / λήξη / nonce χωρίς JWKS.
 */
export type OAuthProvider = "google" | "microsoft" | "facebook" | "apple";
export const PROVIDERS: OAuthProvider[] = ["google", "microsoft", "facebook", "apple"];
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", microsoft: "Microsoft", facebook: "Facebook", apple: "Apple" };

export interface ProviderConfig { provider: OAuthProvider; enabled: boolean; clientId: string; secret: string; tenant: string; teamId: string; keyId: string; privateKey: string; legacyAppleSecret: string }

export async function providerConfigs(): Promise<Record<OAuthProvider, ProviderConfig>> {
  const { data, secrets } = await getSetting("social-login");
  const s = (k: string) => String(data[k] ?? "").trim();
  const sec = (k: string) => String(secrets[k] ?? "").trim();
  const base = { tenant: "", teamId: "", keyId: "", privateKey: "", legacyAppleSecret: "" };
  return {
    google: { ...base, provider: "google", enabled: data.googleEnabled === true, clientId: s("googleClientId"), secret: sec("googleClientSecret") },
    microsoft: { ...base, provider: "microsoft", enabled: data.microsoftEnabled === true, clientId: s("microsoftClientId"), secret: sec("microsoftClientSecret"), tenant: s("microsoftTenant") || "consumers" },
    facebook: { ...base, provider: "facebook", enabled: data.facebookEnabled === true, clientId: s("facebookAppId"), secret: sec("facebookAppSecret") },
    apple: { ...base, provider: "apple", enabled: data.appleEnabled === true, clientId: s("appleClientId"), secret: "", teamId: s("appleTeamId"), keyId: s("appleKeyId"), privateKey: sec("applePrivateKey"), legacyAppleSecret: sec("appleSecret") },
  };
}

/** Τι λείπει για να δουλέψει ο πάροχος (κενό = έτοιμος). */
export function missing(c: ProviderConfig): string[] {
  const m: string[] = [];
  if (!c.clientId) m.push(c.provider === "apple" ? "Services ID" : c.provider === "facebook" ? "App ID" : "Client ID");
  if (c.provider === "apple") { if (!c.privateKey && !c.legacyAppleSecret) m.push("ιδιωτικό κλειδί .p8"); if (c.privateKey && !c.teamId) m.push("Team ID"); if (c.privateKey && !c.keyId) m.push("Key ID"); }
  else if (!c.secret) m.push(c.provider === "facebook" ? "App secret" : "Client secret");
  return m;
}

/** Οι πάροχοι που φαίνονται στη βιτρίνα: ενεργοί ΚΑΙ πλήρως ρυθμισμένοι. */
export async function liveProviders(): Promise<OAuthProvider[]> {
  const all = await providerConfigs();
  return PROVIDERS.filter((p) => all[p].enabled && !missing(all[p]).length);
}

const msBase = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant || "consumers")}`;
export const ENDPOINTS: Record<OAuthProvider, (c: ProviderConfig) => { authorize: string; token: string; scope: string }> = {
  google: () => ({ authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "openid email profile" }),
  microsoft: (c) => ({ authorize: `${msBase(c.tenant)}/oauth2/v2.0/authorize`, token: `${msBase(c.tenant)}/oauth2/v2.0/token`, scope: "openid email profile" }),
  facebook: () => ({ authorize: "https://www.facebook.com/v19.0/dialog/oauth", token: "https://graph.facebook.com/v19.0/oauth/access_token", scope: "email,public_profile" }),
  apple: () => ({ authorize: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token", scope: "name email" }),
};

export const redirectUri = (origin: string, p: OAuthProvider) => `${origin.replace(/\/$/, "")}/api/account/oauth/${p}/callback`;

/** Apple: το client secret είναι JWT (ES256) υπογεγραμμένο με το .p8 — φτιάχνεται κάθε φορά, ισχύει 5 λεπτά. */
export async function appleClientSecret(c: ProviderConfig): Promise<string> {
  if (!c.privateKey) return c.legacyAppleSecret;
  const key = await importPKCS8(c.privateKey.replace(/\\n/g, "\n").trim(), "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: c.keyId }).setIssuer(c.teamId).setSubject(c.clientId).setAudience("https://appleid.apple.com").setIssuedAt().setExpirationTime("5m").sign(key);
}

const b64url = (b: Buffer) => b.toString("base64url");
export function newFlow() {
  const verifier = b64url(randomBytes(32));
  return { state: b64url(randomBytes(24)), nonce: b64url(randomBytes(24)), verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

export function authorizeUrl(c: ProviderConfig, origin: string, f: { state: string; nonce: string; challenge: string }) {
  const e = ENDPOINTS[c.provider](c);
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(origin, c.provider), response_type: "code", scope: e.scope, state: f.state });
  if (c.provider !== "facebook") q.set("nonce", f.nonce);
  if (c.provider === "google" || c.provider === "microsoft" || c.provider === "facebook") { q.set("code_challenge", f.challenge); q.set("code_challenge_method", "S256"); }
  if (c.provider === "google") q.set("prompt", "select_account");
  if (c.provider === "microsoft") q.set("prompt", "select_account");
  if (c.provider === "apple") q.set("response_mode", "form_post");
  return `${e.authorize}?${q}`;
}

export interface OAuthProfile { provider: OAuthProvider; sub: string; email: string | null; emailVerified: boolean; firstName: string; lastName: string }

/** Ανταλλαγή του code με tokens και προφίλ. Πετάει Error με κατανοητό μήνυμα. */
export async function exchange(c: ProviderConfig, origin: string, code: string, verifier: string, nonce: string, appleUser?: string | null): Promise<OAuthProfile> {
  const e = ENDPOINTS[c.provider](c);
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, c.provider), client_id: c.clientId, client_secret: c.provider === "apple" ? await appleClientSecret(c) : c.secret });
  if (c.provider !== "apple") body.set("code_verifier", verifier);
  const res = await fetch(e.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(15_000) });
  const tok = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error?: string; error_description?: string; error_message?: string };
  if (!res.ok || tok.error) throw new Error(`${PROVIDER_LABEL[c.provider]}: ${tok.error_description ?? tok.error ?? (tok as { error?: { message?: string } }).error ?? res.status}`);

  if (c.provider === "facebook") {
    const me = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,email,first_name,last_name&access_token=${encodeURIComponent(tok.access_token ?? "")}`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json() as Promise<{ id?: string; email?: string; first_name?: string; last_name?: string; error?: { message: string } }>);
    if (!me.id) throw new Error(`Facebook: ${me.error?.message ?? "χωρίς προφίλ"}`);
    // το Facebook επιστρέφει μόνο επιβεβαιωμένα email
    return { provider: "facebook", sub: me.id, email: me.email?.toLowerCase() ?? null, emailVerified: !!me.email, firstName: me.first_name ?? "", lastName: me.last_name ?? "" };
  }

  if (!tok.id_token) throw new Error(`${PROVIDER_LABEL[c.provider]}: δεν επιστράφηκε id_token`);
  const t = decodeJwt(tok.id_token) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(t.aud) ? t.aud : [t.aud];
  if (!aud.includes(c.clientId)) throw new Error("Λάθος audience στο id_token");
  if (typeof t.exp === "number" && t.exp < now - 60) throw new Error("Το id_token έληξε");
  if (t.nonce && t.nonce !== nonce) throw new Error("Λάθος nonce");
  const iss = String(t.iss ?? "");
  const issOk = c.provider === "google" ? /^https:\/\/accounts\.google\.com$|^accounts\.google\.com$/.test(iss) : c.provider === "apple" ? iss === "https://appleid.apple.com" : /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/.test(iss);
  if (!issOk) throw new Error("Άγνωστος εκδότης στο id_token");

  const email = String(t.email ?? (c.provider === "microsoft" ? t.preferred_username ?? "" : "")).toLowerCase() || null;
  let first = String(t.given_name ?? ""), last = String(t.family_name ?? "");
  if (!first && t.name) { const parts = String(t.name).trim().split(/\s+/); first = parts[0] ?? ""; last = parts.slice(1).join(" "); }
  if (c.provider === "apple" && appleUser) { try { const u = JSON.parse(appleUser) as { name?: { firstName?: string; lastName?: string } }; first = u.name?.firstName ?? first; last = u.name?.lastName ?? last; } catch { /* μόνο την πρώτη φορά */ } }
  // επιβεβαιωμένο email: Google / Apple το δηλώνουν· στη Microsoft μόνο οι προσωπικοί λογαριασμοί (tenant consumers)
  // ή όταν υπάρχει xms_edov — αλλιώς δεν δένεται με υπάρχοντα λογαριασμό (προστασία από «nOAuth»)
  const verified = c.provider === "microsoft" ? String(t.tid ?? "") === "9188040d-6c67-4c5b-b112-36a304b66dad" || t.xms_edov === true : t.email_verified === true || t.email_verified === "true";
  return { provider: c.provider, sub: String(t.sub), email, emailVerified: verified && !!email, firstName: first, lastName: last };
}

/**
 * Έλεγχος στοιχείων χωρίς χρήστη: ζητάμε token με ψεύτικο code. Σωστό client id/secret → «invalid_grant»
 * (ο πάροχος δέχτηκε την εφαρμογή, απέρριψε μόνο το code). Λάθος → «invalid_client» κ.λπ.
 */
export async function probe(c: ProviderConfig, origin: string): Promise<{ ok: boolean; message: string }> {
  // συχνό λάθος: επικόλληση μαζί με άλλο κείμενο (π.χ. «Value  Secret ID  ημερομηνία» από το Azure)
  if (c.provider !== "apple" && /\s/.test(c.secret)) return { ok: false, message: `Το ${c.provider === "facebook" ? "App secret" : "Client secret"} περιέχει κενά ή αλλαγές γραμμής — επικολλήθηκε περισσότερο κείμενο από όσο χρειάζεται.${c.provider === "microsoft" ? " Στο Azure αντίγραψε ΜΟΝΟ τη στήλη «Value» (περίπου 40 χαρακτήρες), όχι το «Secret ID» ή την ημερομηνία λήξης." : ""}` };
  const r = await probeToken(c, origin);
  if (!r.ok) return r;
  const red = await probeRedirect(c, origin);
  return red ?? r;
}

/**
 * Το πρώτο βήμα της σύνδεσης, όπως το κάνει ένας πελάτης: ανοίγουμε τη σελίδα σύνδεσης του παρόχου και ελέγχουμε αν
 * δέχεται τη διεύθυνση επιστροφής μας (redirect URI). Google / Microsoft το λένε πριν ζητήσουν κωδικό· το Facebook μόνο μετά.
 */
export async function probeRedirect(c: ProviderConfig, origin: string): Promise<{ ok: boolean; message: string } | null> {
  if (c.provider !== "google" && c.provider !== "microsoft") return null;
  try {
    const r = await fetch(authorizeUrl(c, origin, newFlow()), { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "accept-language": "el,en" } });
    const loc = r.headers.get("location") ?? "";
    if (c.provider === "google") {
      const ae = loc.includes("authError=") ? new URL(loc).searchParams.get("authError") ?? "" : "";
      const why = ae ? Buffer.from(ae.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
      if (/redirect_uri_mismatch/.test(why)) return { ok: false, message: `Τα στοιχεία είναι σωστά, αλλά η Google δεν δέχεται τη διεύθυνση επιστροφής. Στο Google Cloud Console → Clients → το client → «Authorized redirect URIs» πρόσθεσε ακριβώς: ${redirectUri(origin, "google")}` };
      if (/invalid_client|deleted_client/.test(why)) return { ok: false, message: "Η Google δεν βρίσκει αυτό το Client ID (ίσως διαγράφηκε ή ανήκει σε άλλο έργο)." };
      if (/access_denied|has not completed/.test(why)) return { ok: false, message: "Η εφαρμογή στη Google είναι σε «Testing»: Audience → «Publish app»." };
      return null;
    }
    const body = await r.text();
    const code = /AADSTS(\d+)/.exec(body)?.[1];
    if (code === "50011") return { ok: false, message: `Τα στοιχεία είναι σωστά, αλλά η Microsoft δεν δέχεται τη διεύθυνση επιστροφής. Azure → App registrations → η εφαρμογή → Authentication → πλατφόρμα «Web» → «Redirect URIs»: πρόσθεσε ακριβώς ${redirectUri(origin, "microsoft")}` };
    if (code === "50194" || code === "9002331" || code === "50020") return { ok: false, message: `Ο τύπος λογαριασμών της εφαρμογής στο Azure δεν ταιριάζει με τη ρύθμιση «${c.tenant}». Azure → η εφαρμογή → Authentication → «Supported account types»: για πελάτες «Personal Microsoft accounts only» (και εδώ «consumers») ή «…any organizational directory and personal Microsoft accounts» (και εδώ «common»).` };
    if (code === "700016") return { ok: false, message: "Η Microsoft δεν βρίσκει εφαρμογή με αυτό το Application (client) ID για αυτούς τους λογαριασμούς." };
    if (code) return { ok: false, message: `Η Microsoft απάντησε με σφάλμα AADSTS${code} στη σελίδα σύνδεσης.` };
    return null;
  } catch { return null; }
}

async function probeToken(c: ProviderConfig, origin: string): Promise<{ ok: boolean; message: string }> {
  try {
    if (c.provider === "facebook") {
      const r = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(c.clientId)}&client_secret=${encodeURIComponent(c.secret)}&grant_type=client_credentials`, { signal: AbortSignal.timeout(15_000) });
      const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
      return j.access_token ? { ok: true, message: "Το Facebook αναγνώρισε την εφαρμογή (App ID + App secret σωστά)." } : { ok: false, message: `Το Facebook απέρριψε τα στοιχεία: ${j.error?.message ?? r.status}` };
    }
    const e = ENDPOINTS[c.provider](c);
    const body = new URLSearchParams({ grant_type: "authorization_code", code: "euronics-settings-check", redirect_uri: redirectUri(origin, c.provider), client_id: c.clientId, client_secret: c.provider === "apple" ? await appleClientSecret(c) : c.secret });
    if (c.provider !== "apple") body.set("code_verifier", "x".repeat(43));
    const r = await fetch(e.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; error_description?: string; error_codes?: number[] };
    const desc = j.error_description ?? "";
    if (j.error === "invalid_grant") return { ok: true, message: `Ο πάροχος αναγνώρισε την εφαρμογή — τα στοιχεία είναι σωστά.` };
    if (c.provider === "microsoft") {
      if (/AADSTS7000215/.test(desc)) return { ok: false, message: "Λάθος client secret. Συχνό λάθος: επικολλήθηκε το «Secret ID» αντί για το «Value»." };
      if (/AADSTS700016/.test(desc)) return { ok: false, message: "Η Microsoft δεν βρίσκει εφαρμογή με αυτό το Application (client) ID σε αυτούς τους λογαριασμούς. Έλεγξε το ID και το «Supported account types»." };
      if (/AADSTS90002|AADSTS900023/.test(desc)) return { ok: false, message: "Άγνωστος tenant. Για πελάτες κατάστημα συνήθως χρειάζεται «Προσωπικοί λογαριασμοί»." };
      if (/AADSTS7000222/.test(desc)) return { ok: false, message: "Το client secret έχει λήξει. Φτιάξε νέο στο Azure (Certificates & secrets)." };
      if (/AADSTS70000|AADSTS54005/.test(desc)) return { ok: true, message: "Η Microsoft αναγνώρισε την εφαρμογή — τα στοιχεία είναι σωστά." };
      // με δοκιμαστικό code η Microsoft σταματά πριν ελέγξει το secret: αυτό ελέγχεται μόνο σε πραγματική σύνδεση
      if (/AADSTS9002313/.test(desc)) return { ok: true, message: "Η Microsoft αναγνωρίζει την εφαρμογή (Client ID). Το Client secret ελέγχεται μόνο σε πραγματική σύνδεση — πάτα «Δοκιμαστική σύνδεση»." };
    }
    if (j.error === "invalid_client" || j.error === "unauthorized_client") return { ok: false, message: c.provider === "apple" ? "Η Apple απέρριψε τα στοιχεία: έλεγξε Services ID, Team ID, Key ID και ότι το κλειδί .p8 έχει ενεργό το «Sign in with Apple»." : "Ο πάροχος απέρριψε τα στοιχεία: λάθος Client ID ή Client secret." };
    return { ok: false, message: `Απρόσμενη απάντηση: ${j.error ?? r.status}${desc ? ` — ${desc.split("\n")[0].slice(0, 200)}` : ""}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? (/pkcs8|PKCS8|key/i.test(e.message) ? "Το ιδιωτικό κλειδί .p8 δεν διαβάζεται — επικόλλησε όλο το αρχείο, μαζί με τις γραμμές BEGIN / END." : e.message) : "Αποτυχία ελέγχου." };
  }
}
