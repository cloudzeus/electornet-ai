"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ShieldCheck, LogIn, Loader2, ChevronDown, Info, X } from "lucide-react";
import { AppleMark, GoogleMark, MicrosoftMark, FacebookMark } from "@/components/checkout/BrandMarks";
import { saveSection, probeSocial, type ActionResult } from "@/app/admin/(shell)/settings/actions";
import { TextField, SecretField, ToggleField, SelectField, CopyValue, StatusPill, SaveBar, ResultBanner, type Rule, type Status } from "./ui";
import { SocialGuideButton, SocialGuidePanel } from "./SocialGuideButton";

type P = "google" | "microsoft" | "facebook" | "apple";
type Vals = Record<string, string | boolean>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RULES: Record<string, Rule> = {
  googleClientId: { re: /^\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com$/, bad: "Το Client ID της Google τελειώνει σε .apps.googleusercontent.com", good: "Σωστή μορφή Client ID" },
  googleClientSecret: { re: /^GOCSPX-[\w-]{20,}$/, bad: "Το Client secret της Google ξεκινά με GOCSPX-", good: "Σωστή μορφή secret" },
  microsoftClientId: { re: GUID, bad: "Το Application (client) ID είναι GUID: 8-4-4-4-12 χαρακτήρες", good: "Σωστή μορφή ID" },
  microsoftClientSecret: { re: /^(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$)[\w~.\-]{30,}$/i, bad: "Αυτό μοιάζει με «Secret ID». Χρειάζεται η στήλη «Value» (≈40 χαρακτήρες, συχνά με ~), που φαίνεται μόνο αμέσως μετά τη δημιουργία.", good: "Μοιάζει με Value — σωστά" },
  microsoftTenantCustom: { re: GUID, bad: "Το Directory (tenant) ID είναι GUID", good: "Σωστή μορφή" },
  facebookAppId: { re: /^\d{12,20}$/, bad: "Το App ID είναι μόνο ψηφία (15–16)", good: "Σωστή μορφή App ID" },
  facebookAppSecret: { re: /^[0-9a-f]{32}$/, bad: "Το App secret είναι 32 χαρακτήρες 0-9 και a-f", good: "Σωστή μορφή secret" },
  appleClientId: { re: /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, bad: "Το Services ID γράφεται ανάποδα σαν domain, π.χ. gr.euronics.signin", good: "Σωστή μορφή" },
  appleTeamId: { re: /^[A-Z0-9]{10}$/, bad: "10 κεφαλαία λατινικά/ψηφία (πάνω δεξιά στο developer.apple.com)", good: "Σωστή μορφή" },
  appleKeyId: { re: /^[A-Z0-9]{10}$/, bad: "10 κεφαλαία λατινικά/ψηφία (στο όνομα του αρχείου AuthKey_XXXXXXXXXX.p8)", good: "Σωστή μορφή" },
  applePrivateKey: { re: /^-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----$/, bad: "Επικόλλησε ολόκληρο το αρχείο .p8, μαζί με τις γραμμές BEGIN και END", good: "Πλήρες κλειδί" },
};

const TENANTS = [
  { value: "consumers", label: "Μόνο προσωπικοί λογαριασμοί (Outlook, Hotmail, Live)" },
  { value: "common", label: "Προσωπικοί και εταιρικοί / σχολικοί" },
  { value: "organizations", label: "Μόνο εταιρικοί / σχολικοί" },
  { value: "custom", label: "Ένας συγκεκριμένος οργανισμός (Tenant ID)" },
];

interface Meta { label: string; mark: ReactNode; enabledKey: string; consoleUrl: string; consoleLabel: string; secrets: string[]; required: { key: string; label: string; secret?: boolean }[] }
const META: Record<P, Meta> = {
  google: { label: "Google", mark: <GoogleMark className="size-6" />, enabledKey: "googleEnabled", consoleUrl: "https://console.cloud.google.com/auth/clients", consoleLabel: "Google Cloud Console", secrets: ["googleClientSecret"], required: [{ key: "googleClientId", label: "Client ID" }, { key: "googleClientSecret", label: "Client secret", secret: true }] },
  microsoft: { label: "Microsoft", mark: <MicrosoftMark className="size-6" />, enabledKey: "microsoftEnabled", consoleUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", consoleLabel: "Azure · App registrations", secrets: ["microsoftClientSecret"], required: [{ key: "microsoftClientId", label: "Application (client) ID" }, { key: "microsoftClientSecret", label: "Client secret (Value)", secret: true }] },
  facebook: { label: "Facebook", mark: <FacebookMark className="size-6" />, enabledKey: "facebookEnabled", consoleUrl: "https://developers.facebook.com/apps/", consoleLabel: "Meta for Developers", secrets: ["facebookAppSecret"], required: [{ key: "facebookAppId", label: "App ID" }, { key: "facebookAppSecret", label: "App secret", secret: true }] },
  apple: { label: "Apple", mark: <span className="text-black"><AppleMark className="size-6" /></span>, enabledKey: "appleEnabled", consoleUrl: "https://developer.apple.com/account/resources/identifiers/list/serviceId", consoleLabel: "Apple Developer", secrets: ["applePrivateKey", "appleSecret"], required: [{ key: "appleClientId", label: "Services ID" }, { key: "appleTeamId", label: "Team ID" }, { key: "appleKeyId", label: "Key ID" }, { key: "applePrivateKey", label: "Ιδιωτικό κλειδί .p8", secret: true }] },
};
const ORDER: P[] = ["google", "microsoft", "facebook", "apple"];
const TEXT_KEYS = ["googleClientId", "microsoftClientId", "microsoftTenant", "facebookAppId", "appleClientId", "appleTeamId", "appleKeyId"];

export function SocialLoginSettings({ data, secretSet, origin, prodBase, storedMissing, test }: { data: Record<string, string | number | boolean>; secretSet: Record<string, boolean>; origin: string; prodBase: string | null; storedMissing: Record<P, string[]>; test: { p: P; ok: boolean; msg: string } | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [vals, setVals] = useState<Vals>(() => {
    const v: Vals = {};
    for (const p of ORDER) v[META[p].enabledKey] = data[META[p].enabledKey] === true;
    for (const k of TEXT_KEYS) v[k] = String(data[k] ?? "");
    if (!v.microsoftTenant) v.microsoftTenant = "consumers";
    return v;
  });
  const [tenantMode, setTenantMode] = useState(() => (TENANTS.some((t) => t.value === vals.microsoftTenant) ? String(vals.microsoftTenant) : "custom"));
  const [stored, setStored] = useState(secretSet);
  const [typed, setTyped] = useState<Record<string, boolean>>({});
  const [ver, setVer] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<ActionResult | null>(null);
  const [probes, setProbes] = useState<Partial<Record<P, ActionResult>>>({});
  const [probing, setProbing] = useState<P | null>(null);
  const [pending, start] = useTransition();
  const [, startProbe] = useTransition();
  const [testResult, setTestResult] = useState(test);

  const snapshot = useRef("");
  const serialize = () => (formRef.current ? JSON.stringify([...new FormData(formRef.current).entries()].filter(([, v]) => typeof v === "string").sort()) : "");
  const recompute = useCallback(() => setTimeout(() => setDirty(serialize() !== snapshot.current), 0), []);
  useEffect(() => { snapshot.current = serialize(); }, [ver]); // νέα εικόνα μετά από κάθε αποθήκευση
  useEffect(() => { if (test) document.getElementById(`p-${test.p}`)?.scrollIntoView({ block: "start" }); }, [test]);

  const set = (k: string, v: string | boolean) => { setVals((p) => ({ ...p, [k]: v })); recompute(); };
  const has = (k: string, secret?: boolean) => (secret ? !!stored[k] || !!typed[k] : String(vals[k] ?? "").trim() !== "");
  const missingNow = (p: P) => META[p].required.filter((r) => !(p === "apple" && r.key === "applePrivateKey" && stored.appleSecret) && !has(r.key, r.secret)).map((r) => r.label);
  const status = (p: P): { s: Status; text: string } => {
    const m = missingNow(p);
    const on = vals[META[p].enabledKey] === true;
    if (!m.length && on) return { s: "live", text: "Ενεργό — το βλέπουν οι πελάτες" };
    if (!m.length) return { s: "ready", text: "Έτοιμο — κλειστό" };
    if (on) return { s: "incomplete", text: "Ανοιχτό αλλά δεν εμφανίζεται" };
    return { s: "off", text: "Δεν έχει ρυθμιστεί" };
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveSection("social-login", fd);
      setSaveMsg(r);
      if (!r.ok) return;
      const next = { ...stored };
      for (const p of ORDER) for (const k of META[p].secrets) { if (fd.get(`${k}__clear`) === "on") next[k] = false; else if (String(fd.get(k) ?? "")) next[k] = true; }
      setStored(next);
      setTyped({});
      setProbes({});
      setVer((v) => v + 1);
      setDirty(false);
      router.refresh();
    });
  };

  const runProbe = (p: P) => {
    const fd = new FormData(formRef.current!);
    setProbing(p);
    startProbe(async () => { const r = await probeSocial(p, fd); setProbes((x) => ({ ...x, [p]: r })); setProbing(null); });
  };

  // ΠΡΟΣΩΡΙΝΟ: μέχρι το euronics.gr να δείχνει σε αυτή την εφαρμογή, το live site είναι το euronics.dgsoft.gr — εκεί
  // επιστρέφουν οι πάροχοι. Φαίνονται και τα δύο, ώστε να δηλωθούν από τώρα και να μη σπάσει τίποτα στη μετάβαση.
  const LIVE_NOW = "https://euronics.dgsoft.gr";
  const bases = [
    { label: prodBase && prodBase !== origin ? "Αυτό το περιβάλλον" : "Διεύθυνση καταστήματος", base: origin },
    ...(origin !== LIVE_NOW ? [{ label: "Live τώρα (euronics.dgsoft.gr)", base: LIVE_NOW }] : []),
    ...(prodBase && prodBase !== origin && prodBase !== LIVE_NOW ? [{ label: "Τελικό site (μετά τη μετάβαση)", base: prodBase }] : []),
  ];
  const site = /^https:\/\//.test(origin) ? origin : LIVE_NOW; // ΠΡΟΣΩΡΙΝΟ: πολιτική απορρήτου κλπ. από το live site
  const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const redirects = (p: P) => bases.map((b) => <CopyValue key={b.base} label={`Redirect URI · ${b.label}`} value={`${b.base}/api/account/oauth/${p}/callback`} />);
  const secretProps = (k: string) => ({ name: k, stored: !!stored[k], rule: RULES[k], onChange: (v: string) => setTyped((t) => ({ ...t, [k]: !!v })), onDirty: recompute });
  const live = ORDER.filter((p) => status(p).s === "live");

  return (
    <form ref={formRef} onSubmit={submit} onChange={recompute} onInput={recompute} noValidate className="grid gap-4 min-w-0">
      <header className="rounded-2xl bg-white border border-eu-line p-4 @md:p-6 grid gap-4">
        <div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Social login</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Οι πελάτες μπαίνουν ή φτιάχνουν λογαριασμό με ένα πάτημα, χωρίς κωδικό. Για κάθε πάροχο: (1) φτιάχνεις μια «εφαρμογή» στην κονσόλα του με τις διευθύνσεις που βλέπεις εδώ, (2) αντιγράφεις τα κλειδιά της στα πεδία, (3) πατάς «Έλεγχος στοιχείων» και «Δοκιμαστική σύνδεση», (4) το ανοίγεις.</p>
        </div>
        <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 @4xl:grid-cols-4 gap-2">
          {ORDER.map((p) => {
            const st = status(p);
            return (
              <li key={p}>
                <a href={`#p-${p}`} className="flex items-center gap-3 rounded-xl border-2 border-eu-line px-3 py-2 min-h-14 hover:border-eu-blue">
                  <span className="shrink-0">{META[p].mark}</span>
                  <span className="grid min-w-0 gap-0.5"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{META[p].label}</span><StatusPill status={st.s} text={st.text} /></span>
                </a>
              </li>
            );
          })}
        </ul>
        <SocialGuidePanel tenant={String(vals.microsoftTenant || "consumers")} />
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] flex items-start gap-2"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden />{live.length ? <>Στη σελίδα σύνδεσης, στην εγγραφή και στο checkout εμφανίζονται τώρα: <b>{live.map((p) => META[p].label).join(", ")}</b>.</> : "Αυτή τη στιγμή οι πελάτες δεν βλέπουν κανένα κουμπί social login — εμφανίζονται μόνο οι πάροχοι που είναι ανοιχτοί ΚΑΙ πλήρως ρυθμισμένοι."}</p>
      </header>

      {testResult && (
        <div className="relative">
          <ResultBanner ok={testResult.ok}><span className="block pr-8"><b>Δοκιμαστική σύνδεση {META[testResult.p].label}:</b> {testResult.msg}</span></ResultBanner>
          <button type="button" onClick={() => { setTestResult(null); router.replace("/admin/settings/social-login", { scroll: false }); }} aria-label="Κλείσιμο" className="absolute top-1 right-1 size-10 inline-flex items-center justify-center rounded-full text-eu-muted hover:bg-white/60"><X className="size-4" aria-hidden /></button>
        </div>
      )}

      {ORDER.map((p) => {
        const st = status(p);
        const m = missingNow(p);
        const probe = probes[p];
        const notReady = storedMissing[p].length > 0;
        return (
          <section key={p} id={`p-${p}`} aria-labelledby={`h-${p}`} className="rounded-2xl bg-white border border-eu-line scroll-mt-24 min-w-0">
            <div className="flex flex-wrap items-center gap-3 p-4 @md:p-5 border-b border-eu-line">
              <span className="shrink-0 size-11 rounded-xl bg-eu-surface inline-flex items-center justify-center">{META[p].mark}</span>
              <div className="min-w-0 flex-1">
                <h3 id={`h-${p}`} className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{META[p].label}</h3>
                <StatusPill status={st.s} text={st.text} />
              </div>
            </div>

            <div className="p-4 @md:p-5 grid gap-5">
              <ToggleField
                name={META[p].enabledKey}
                label={`Εμφάνιση «Σύνδεση με ${META[p].label}» στους πελάτες`}
                help={m.length ? `Μπορείς να το ανοίξεις από τώρα, αλλά το κουμπί θα εμφανιστεί μόλις συμπληρωθούν: ${m.join(", ")}.` : "Στη σελίδα σύνδεσης, στην εγγραφή και στο checkout."}
                checked={vals[META[p].enabledKey] === true}
                onChange={(v) => set(META[p].enabledKey, v)}
              />

              <details open={st.s === "off" || st.s === "incomplete"} className="group rounded-xl bg-eu-surface/70 border border-eu-line">
                <summary className="list-none cursor-pointer flex items-center justify-between gap-2 px-4 min-h-12 font-bold text-eu-ink text-[length:var(--fs-15)]">
                  <span>Βήμα 1 · Ρύθμιση στο {META[p].consoleLabel}</span>
                  <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="px-4 pb-4 grid gap-4">
                  <div className="flex flex-wrap gap-2 items-start">
                    <a href={META[p].consoleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">Άνοιγμα {META[p].consoleLabel} <ExternalLink className="size-4" aria-hidden /></a>
                    <SocialGuideButton providers={[p]} tenant={String(vals.microsoftTenant || "consumers")} compact label={`Αναλυτικός οδηγός ${META[p].label}`} />
                  </div>
                  <Guide p={p} redirects={redirects(p)} bases={bases} site={site} host={host} />
                </div>
              </details>

              <div className="grid gap-4">
                <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Βήμα 2 · Στοιχεία της εφαρμογής</h4>
                <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-5 gap-y-4 items-start">
                  {p === "google" && (
                    <>
                      <TextField name="googleClientId" label="Client ID" value={String(vals.googleClientId)} onChange={(v) => set("googleClientId", v)} rule={RULES.googleClientId} mono placeholder="123456789012-abc….apps.googleusercontent.com" help="Clients → η εφαρμογή σου → Client ID." />
                      <SecretField key={`googleClientSecret-${ver}`} {...secretProps("googleClientSecret")} label="Client secret" help="Στην ίδια σελίδα· ξεκινά με GOCSPX-." />
                    </>
                  )}
                  {p === "microsoft" && (
                    <>
                      <TextField name="microsoftClientId" label="Application (client) ID" value={String(vals.microsoftClientId)} onChange={(v) => set("microsoftClientId", v)} rule={RULES.microsoftClientId} mono placeholder="00000000-0000-0000-0000-000000000000" help="Overview της εφαρμογής στο Azure." />
                      <SecretField key={`microsoftClientSecret-${ver}`} {...secretProps("microsoftClientSecret")} label="Client secret · Value" help="Certificates & secrets → η στήλη «Value», ΟΧΙ το «Secret ID». Λήγει (έως 24 μήνες): βάλε υπενθύμιση." />
                      <div className="grid gap-3 @2xl:col-span-2">
                        <SelectField name="_tenantMode" label="Ποιοι λογαριασμοί Microsoft μπορούν να συνδεθούν" value={tenantMode} onChange={(v) => { setTenantMode(v); set("microsoftTenant", v === "custom" ? "" : v); }} options={TENANTS} help="Πρέπει να ταιριάζει με το «Supported account types» της εφαρμογής στο Azure. Για e-shop: «Μόνο προσωπικοί λογαριασμοί»." />
                        {tenantMode === "custom" && <TextField name="_tenantCustom" label="Directory (tenant) ID" value={String(vals.microsoftTenant)} onChange={(v) => set("microsoftTenant", v.trim())} rule={RULES.microsoftTenantCustom} mono placeholder="00000000-0000-0000-0000-000000000000" />}
                        <input type="hidden" name="microsoftTenant" value={String(vals.microsoftTenant)} />
                      </div>
                    </>
                  )}
                  {p === "facebook" && (
                    <>
                      <TextField name="facebookAppId" label="App ID" value={String(vals.facebookAppId)} onChange={(v) => set("facebookAppId", v)} rule={RULES.facebookAppId} mono inputMode="numeric" placeholder="123456789012345" help="App settings → Basic → App ID." />
                      <SecretField key={`facebookAppSecret-${ver}`} {...secretProps("facebookAppSecret")} label="App secret" help="App settings → Basic → App secret → Show." />
                    </>
                  )}
                  {p === "apple" && (
                    <>
                      <TextField name="appleClientId" label="Services ID (Identifier)" value={String(vals.appleClientId)} onChange={(v) => set("appleClientId", v)} rule={RULES.appleClientId} mono placeholder="gr.euronics.signin" help="Identifiers → Services IDs. Όχι το App ID της εφαρμογής κινητού." />
                      <TextField name="appleTeamId" label="Team ID" value={String(vals.appleTeamId)} onChange={(v) => set("appleTeamId", v.toUpperCase())} rule={RULES.appleTeamId} mono placeholder="A1B2C3D4E5" help="Πάνω δεξιά στο developer.apple.com, δίπλα στο όνομα του λογαριασμού." />
                      <TextField name="appleKeyId" label="Key ID" value={String(vals.appleKeyId)} onChange={(v) => set("appleKeyId", v.toUpperCase())} rule={RULES.appleKeyId} mono placeholder="ABC123DEFG" help="Keys → το κλειδί «Sign in with Apple»." />
                      <div className="@2xl:col-span-2"><SecretField key={`applePrivateKey-${ver}`} {...secretProps("applePrivateKey")} multiline label="Ιδιωτικό κλειδί (.p8)" help="Άνοιξε το αρχείο AuthKey_….p8 με επεξεργαστή κειμένου και επικόλλησε όλο το περιεχόμενο. Η Apple το δίνει για λήψη μόνο μία φορά." /></div>
                      {stored.appleSecret && <div className="@2xl:col-span-2"><SecretField key={`appleSecret-${ver}`} {...secretProps("appleSecret")} label="Παλιό client secret (JWT)" help="Χρησιμοποιείται μόνο όταν δεν υπάρχει κλειδί .p8 και λήγει κάθε 6 μήνες. Με το .p8 μπορείς να το διαγράψεις." /></div>}
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <h4 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Βήμα 3 · Έλεγχος</h4>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => runProbe(p)} disabled={probing !== null || m.length > 0} className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-navy hover:text-white disabled:opacity-40 transition-colors grow @md:grow-0">
                    {probing === p ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />} Έλεγχος στοιχείων
                  </button>
                  {dirty || notReady ? (
                    <span className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line text-eu-muted font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 grow @md:grow-0 justify-center" aria-disabled><LogIn className="size-4" aria-hidden /> Δοκιμαστική σύνδεση</span>
                  ) : (
                    <a href={`/api/account/oauth/${p}?mode=test`} className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-navy hover:text-white transition-colors grow @md:grow-0"><LogIn className="size-4" aria-hidden /> Δοκιμαστική σύνδεση</a>
                  )}
                </div>
                <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug">
                  <b>Έλεγχος στοιχείων:</b> ρωτά τον πάροχο αν αναγνωρίζει την εφαρμογή με όσα έγραψες (και πριν την αποθήκευση).{" "}
                  <b>Δοκιμαστική σύνδεση:</b> κάνεις κανονική σύνδεση με τον δικό σου λογαριασμό {META[p].label} και επιστρέφεις εδώ με το αποτέλεσμα — δεν δημιουργείται λογαριασμός πελάτη και δουλεύει και με το κουμπί κλειστό.
                  {(dirty || notReady) && <span className="block mt-1 text-eu-amber font-bold">{dirty ? "Αποθήκευσε πρώτα τις αλλαγές για τη δοκιμαστική σύνδεση." : `Για τη δοκιμαστική σύνδεση αποθήκευσε: ${storedMissing[p].join(", ")}.`}</span>}
                </p>
                {probe && <ResultBanner ok={probe.ok}>{probe.message}</ResultBanner>}
              </div>
            </div>
          </section>
        );
      })}

      <SaveBar dirty={dirty} pending={pending} top={saveMsg && <ResultBanner ok={saveMsg.ok}>{saveMsg.message}</ResultBanner>} note="Τα secrets αποθηκεύονται κρυπτογραφημένα (AES-256-GCM) και δεν εμφανίζονται ξανά. Κάθε αλλαγή καταγράφεται στο audit log." />
    </form>
  );
}

type S = { t: ReactNode; x?: ReactNode };
function Step({ n, s }: { n: number; s: S }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 items-start">
      <span className="size-8 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] inline-flex items-center justify-center" aria-hidden>{n}</span>
      <div className="grid gap-3 min-w-0 pt-1">
        <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">{s.t}</p>
        {s.x && <div className="grid gap-3 min-w-0">{s.x}</div>}
      </div>
    </li>
  );
}

function Guide({ p, redirects, bases, site, host }: { p: P; redirects: ReactNode; bases: { label: string; base: string }[]; site: string; host: (u: string) => string }) {
  const legal = (
    <>
      <CopyValue label="Πολιτική απορρήτου" value={`${site}/aporrito`} />
      <CopyValue label="Όροι χρήσης" value={`${site}/oroi-chrisis`} />
    </>
  );
  const steps: Record<P, S[]> = {
    google: [
      { t: <>Στο <b>Google Auth Platform → Branding</b>: όνομα εφαρμογής «Euronics», email υποστήριξης, λογότυπο (προαιρετικό) και τα παρακάτω links. Στα <b>Authorized domains</b> πρόσθεσε το domain του καταστήματος.</>, x: <>{legal}<CopyValue label="Authorized domain" value={host(site).split(".").slice(-2).join(".")} /></> },
      { t: <>Στο <b>Audience</b>: τύπος χρήστη <b>External</b> και πάτα <b>Publish app</b> (In production). Χωρίς αυτό μπορούν να συνδεθούν μόνο οι «test users».</> },
      { t: <>Στο <b>Data access</b> αρκούν τα βασικά scopes <code>openid</code>, <code>email</code>, <code>profile</code> — δεν χρειάζεται έλεγχος από τη Google.</> },
      { t: <>Στο <b>Clients → Create client</b>: τύπος <b>Web application</b>. Πρόσθεσε τα παρακάτω στα <b>Authorized JavaScript origins</b> και <b>Authorized redirect URIs</b>, ακριβώς όπως είναι.</>, x: <>{bases.map((b) => <CopyValue key={b.base} label={`JavaScript origin · ${b.label}`} value={b.base} />)}{redirects}</> },
      { t: <>Πάτα <b>Create</b> και αντίγραψε το <b>Client ID</b> και το <b>Client secret</b> στο Βήμα 2.</> },
    ],
    microsoft: [
      { t: <>Στο <b>Microsoft Entra ID → App registrations → New registration</b>: όνομα «Euronics». Στο <b>Supported account types</b> διάλεξε <b>Personal Microsoft accounts only</b> (για πελάτες καταστήματος).</> },
      { t: <>Στο <b>Redirect URI</b>: πλατφόρμα <b>Web</b> και η παρακάτω διεύθυνση. Αν έχεις και δεύτερο περιβάλλον, πρόσθεσέ το μετά από <b>Authentication → Add URI</b>.</>, x: <>{redirects}</> },
      { t: <>Από το <b>Overview</b> αντίγραψε το <b>Application (client) ID</b>.</> },
      { t: <>Στο <b>Certificates &amp; secrets → New client secret</b>: διάρκεια 24 μήνες. Αντίγραψε <b>αμέσως</b> τη στήλη <b>Value</b> — εμφανίζεται μόνο μία φορά. Το «Secret ID» δεν δουλεύει.</> },
      { t: <>Στο <b>API permissions</b> βεβαιώσου ότι υπάρχουν τα <code>openid</code>, <code>email</code>, <code>profile</code> (Microsoft Graph, Delegated).</> },
    ],
    facebook: [
      { t: <>Στο <b>Meta for Developers → Create app</b>: περίπτωση χρήσης <b>Authenticate and request data from users with Facebook Login</b>, τύπος επιχείρησης, σύνδεση με το Business Portfolio της εταιρείας.</> },
      { t: <>Στο <b>Use cases → Facebook Login → Customize</b>: πρόσθεσε την άδεια <code>email</code> (μαζί με το <code>public_profile</code>).</> },
      { t: <>Στο <b>Facebook Login → Settings</b>: άνοιξε <b>Client OAuth login</b> και <b>Web OAuth login</b>, και βάλε στα <b>Valid OAuth Redirect URIs</b>:</>, x: <>{redirects}</> },
      { t: <>Στο <b>App settings → Basic</b>: App domain, Privacy Policy URL, Terms of Service URL, και στο <b>User data deletion</b> «Data deletion instructions URL» = η πολιτική απορρήτου.</>, x: <><CopyValue label="App domain" value={host(site)} />{legal}</> },
      { t: <>Αντίγραψε το <b>App ID</b> και το <b>App secret</b> στο Βήμα 2. Τέλος, στην κορυφή της σελίδας γύρισε την εφαρμογή σε <b>Live</b> (Publish) — σε Development συνδέονται μόνο οι διαχειριστές της.</> },
    ],
    apple: [
      { t: <>Χρειάζεται συνδρομή <b>Apple Developer Program</b> στο όνομα της εταιρείας. Η Apple δεν δέχεται localhost — η δοκιμή γίνεται μόνο σε δημόσιο https domain.</> },
      { t: <>Στο <b>Identifiers → App IDs</b>: αν δεν υπάρχει, φτιάξε ένα App ID (π.χ. gr.euronics.app) με ενεργό το <b>Sign in with Apple</b>.</> },
      { t: <>Στο <b>Identifiers → Services IDs → +</b>: identifier π.χ. <code>gr.euronics.signin</code> (αυτό είναι το «Services ID»). Άνοιξε το <b>Sign in with Apple → Configure</b>, διάλεξε το App ID και πρόσθεσε τα domains και τα Return URLs:</>, x: <>{bases.map((b) => <CopyValue key={b.base} label={`Domain · ${b.label}`} value={host(b.base)} />)}{redirects}</> },
      { t: <>Στο <b>Keys → +</b>: όνομα «Euronics Sign in», ενεργό το <b>Sign in with Apple</b> (Configure → το App ID). Κατέβασε το αρχείο <code>AuthKey_XXXXXXXXXX.p8</code> — <b>μόνο μία φορά</b>. Το XXXXXXXXXX είναι το <b>Key ID</b>.</> },
      { t: <>Το <b>Team ID</b> είναι πάνω δεξιά, δίπλα στο όνομα του λογαριασμού. Συμπλήρωσε Services ID, Team ID, Key ID και το περιεχόμενο του .p8 στο Βήμα 2. Το client secret φτιάχνεται αυτόματα — δεν λήγει ποτέ για σένα.</> },
    ],
  };
  return <ol className="m-0 p-0 list-none grid gap-5">{steps[p].map((s, i) => <Step key={i} n={i + 1} s={s} />)}</ol>;
}
