import "server-only";
import { db } from "@/lib/db";
import { SECTIONS, isSecret, type Values } from "@/lib/settings/schema";
import { decryptJson } from "@/lib/settings/crypto";

/**
 * Η εικόνα των Ρυθμίσεων με μια ματιά, για την αρχική και για τη στήλη ενοτήτων κάθε φόρμας:
 *  - κατάσταση ανά ενότητα (ενεργή / λείπει κάτι / ανενεργή / δεν ρυθμίστηκε)
 *  - «Θέλουν προσοχή»: συγκεκριμένα προβλήματα με σύνδεσμο κατευθείαν στο πεδίο (#f-<πεδίο>)
 *  - «Τι είναι ενεργό»: οι διακόπτες λειτουργιών του site, ανά περιοχή, με σύνδεσμο στον διακόπτη
 */
export type SectionStatus = "live" | "incomplete" | "off" | "disabled";
export type SectionState = { key: string; status: SectionStatus; text: string; updated: string | null };
export type Attention = { level: "critical" | "warning"; text: string; href: string; section: string };
export type FeatureChip = { label: string; on: boolean; href: string; detail?: string; bad?: boolean };
export type FeatureArea = { title: string; items: FeatureChip[] };

/** Διακόπτης που ανάβει/σβήνει όλη την ενότητα: όταν είναι κλειστός, τα κενά της δεν είναι πρόβλημα. */
const MASTER: Record<string, { key: string; label: string }> = {
  softone: { key: "enabled", label: "Ο συγχρονισμός είναι κλειστός" },
  bunny: { key: "enabled", label: "Το CDN είναι κλειστό" },
  aade: { key: "vatEnabled", label: "Η αναζήτηση ΑΦΜ είναι κλειστή" },
};

const SOCIAL = [
  { p: "google", label: "Google", on: "googleEnabled", need: ["googleClientId"], sec: ["googleClientSecret"] },
  { p: "microsoft", label: "Microsoft", on: "microsoftEnabled", need: ["microsoftClientId"], sec: ["microsoftClientSecret"] },
  { p: "facebook", label: "Facebook", on: "facebookEnabled", need: ["facebookAppId"], sec: ["facebookAppSecret"] },
  { p: "apple", label: "Apple", on: "appleEnabled", need: ["appleClientId"], sec: ["applePrivateKey", "appleSecret"] },
];

const COURIERS = [
  { id: "geniki", label: "Γενική Ταχυδρομική", creds: ["genikiUser"], sec: ["genikiPassword", "genikiAppKey"] },
  { id: "acs", label: "ACS", creds: ["acsCompanyId", "acsUserId"], sec: ["acsPassword", "acsApiKey"] },
  { id: "elta", label: "ΕΛΤΑ Courier", creds: ["eltaCustomerCode", "eltaUser"], sec: ["eltaPassword"] },
  { id: "boxnow", label: "BOX NOW", creds: ["boxnowPartnerId", "boxnowClientId"], sec: ["boxnowApiKey"] },
  { id: "asap", label: "ASAP", creds: [], sec: ["asapApiKey"] },
];

const PROVIDER: Record<string, string> = { viva: "Viva", everypay: "EveryPay", cardlink: "Cardlink", stripe: "Stripe" };
const date = (d: Date | null | undefined) => d?.toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) ?? null;

export async function settingsOverview() {
  const rows = await db.setting.findMany();
  const read = (key: string) => {
    const row = rows.find((r) => r.section === key);
    const data = (row?.data as Values) ?? {};
    const secrets = decryptJson(row?.secrets);
    const has = (k: string) => data[k] !== undefined && data[k] !== "" && data[k] !== false;
    const hasSecret = (k: string) => !!secrets[k];
    return { row, data, has, hasSecret };
  };
  const href = (section: string, field?: string) => `/admin/settings/${section}${field ? `#f-${field}` : ""}`;
  const attention: Attention[] = [];

  const sections: SectionState[] = SECTIONS.map((s) => {
    const { row, data, has, hasSecret } = read(s.key);
    const updated = date(row?.updatedAt);
    if (s.key === "social-login") {
      const live = SOCIAL.filter((x) => data[x.on] === true && x.need.every(has) && x.sec.some(hasSecret));
      for (const x of SOCIAL) if (data[x.on] === true && !live.includes(x)) attention.push({ level: "warning", section: s.key, text: `Social login: το ${x.label} είναι ενεργό αλλά λείπουν στοιχεία — δεν εμφανίζεται στους πελάτες`, href: `/admin/settings/social-login#p-${x.p}` });
      return { key: s.key, status: live.length ? "live" : "off", text: live.length ? `Ενεργά: ${live.map((x) => x.label).join(", ")}` : "Κανένας πάροχος", updated };
    }
    const master = MASTER[s.key];
    const visible = s.fields.filter((f) => !f.showIf || f.showIf(data));
    const filled = visible.filter((f) => (isSecret(f) ? hasSecret(f.key) : f.type === "softone-objs" ? has("company") : has(f.key))).length;
    if (master && data[master.key] !== true) return { key: s.key, status: filled ? "disabled" : "off", text: filled ? "Ανενεργό" : "Δεν έχει ρυθμιστεί", updated };
    const missing = visible.filter((f) => f.required && !(isSecret(f) ? hasSecret(f.key) : has(f.key)));
    for (const f of missing) attention.push({ level: "critical", section: s.key, text: `${s.title}: λείπει «${f.label}»`, href: href(s.key, f.key) });
    if (missing.length) return { key: s.key, status: "incomplete", text: `Λείπ${missing.length === 1 ? "ει 1 πεδίο" : `ουν ${missing.length} πεδία`}`, updated };
    return { key: s.key, status: filled ? "live" : "off", text: filled ? "Ρυθμισμένο" : "Δεν έχει ρυθμιστεί", updated };
  });

  // ειδικοί έλεγχοι: ό,τι επηρεάζει τον πελάτη χωρίς να είναι «κενό υποχρεωτικό πεδίο»
  const gen = read("general"), pay = read("payments"), ship = read("shipping"), mail = read("email"), ai = read("ai"), s1 = read("softone"), cdn = read("bunny"), aade = read("aade");
  if (gen.data.maintenance === true) attention.unshift({ level: "critical", section: "general", text: "Το site είναι σε λειτουργία συντήρησης — οι πελάτες δεν μπορούν να αγοράσουν", href: href("general", "maintenance") });
  const cardReady = ["merchantId", "clientId"].some(pay.has) || ["apiKey", "clientSecret"].some(pay.hasSecret);
  if (cardReady && pay.data.mode !== "live") attention.push({ level: "warning", section: "payments", text: "Πληρωμές με κάρτα σε δοκιμαστικό περιβάλλον (Test) — καμία πραγματική χρέωση", href: href("payments", "mode") });
  for (const c of COURIERS) if (ship.data[`${c.id}On`] === true && !(c.creds.every(ship.has) && c.sec.every(ship.hasSecret))) attention.push({ level: "warning", section: "shipping", text: `${c.label}: προσφέρεται στο checkout χωρίς στοιχεία σύνδεσης — δεν θα εκδίδονται vouchers`, href: href("shipping", c.creds[0] ?? c.sec[0]) });
  const transport = String(mail.data.transport ?? "smtp") || "smtp";
  const mailReady = transport === "smtp" ? mail.has("smtpHost") : mail.hasSecret("apiKey");
  if (!mailReady) attention.push({ level: "warning", section: "email", text: "Δεν έχει ρυθμιστεί η αποστολή emails — οι πελάτες δεν λαμβάνουν επιβεβαιώσεις", href: href("email", transport === "smtp" ? "smtpHost" : "apiKey") });

  const on = (v: unknown) => v === true;
  const chip = (label: string, isOn: boolean, h: string, detail?: string, bad = false): FeatureChip => ({ label, on: isOn, href: h, detail, bad });
  const features: FeatureArea[] = [
    { title: "Κατάστημα", items: [on(gen.data.maintenance) ? chip("Λειτουργία συντήρησης", true, href("general", "maintenance"), "οι πελάτες δεν αγοράζουν", true) : chip("Ανοιχτό στους πελάτες", true, href("general", "maintenance"))] },
    {
      title: "Πληρωμές",
      items: [
        chip("Κάρτα", cardReady, href("payments", "provider"), cardReady ? `${PROVIDER[String(pay.data.provider ?? "viva")] ?? "Viva"} · ${pay.data.mode === "live" ? "Live" : "Test"}` : undefined),
        ...([["applePay", "Apple Pay"], ["googlePay", "Google Pay"], ["paypal", "PayPal"], ["iris", "IRIS"], ["klarna", "Klarna"], ["revolutPay", "Revolut Pay"], ["cod", "Αντικαταβολή"], ["bankTransfer", "Κατάθεση σε τράπεζα"]] as const).map(([k, l]) => chip(l, on(pay.data[k]), href("payments", k))),
      ],
    },
    {
      title: "Παράδοση",
      items: [
        ...COURIERS.map((c) => chip(c.label, on(ship.data[`${c.id}On`]), href("shipping", `${c.id}On`))),
        chip("Click & Collect", on(ship.data.clickCollect), href("shipping", "clickCollect")),
        chip("Παράδοση με ραντεβού", on(ship.data.appointmentDelivery), href("shipping", "appointmentDelivery")),
      ],
    },
    {
      title: "Πελάτες & επικοινωνία",
      items: [
        ...SOCIAL.map((x) => { const sl = read("social-login"); return chip(`Σύνδεση με ${x.label}`, on(sl.data[x.on]), `/admin/settings/social-login#p-${x.p}`); }),
        chip("Αναζήτηση ΑΦΜ στο checkout", on(aade.data.vatEnabled), href("aade", "vatEnabled")),
        chip("Newsletter", !!mail.data.newsletterProvider, href("email", "newsletterProvider"), mail.data.newsletterProvider ? String(mail.data.newsletterProvider) : undefined),
        chip("SMS", !!mail.data.smsProvider, href("email", "smsProvider"), mail.data.smsProvider ? String(mail.data.smsProvider) : undefined),
      ],
    },
    {
      title: "Συστήματα & AI",
      items: [
        chip("Ο Ερμής (σύμβουλος)", on(ai.data.advisorEnabled), href("ai", "advisorEnabled")),
        chip("Φωνή στον Ερμή", on(ai.data.voiceEnabled), href("ai", "voiceEnabled")),
        chip("Συγχρονισμός SoftOne", on(s1.data.enabled), href("softone", "enabled")),
        chip("CDN για media", on(cdn.data.enabled), href("bunny", "enabled")),
      ],
    },
  ];

  return { sections, attention, features };
}
