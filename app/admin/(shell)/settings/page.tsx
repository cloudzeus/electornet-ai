import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { SECTIONS, SECTION_GROUPS, isSecret, type Values } from "@/lib/settings/schema";
import { decryptJson } from "@/lib/settings/crypto";
import { SettingsIndex, type IndexCard } from "@/components/admin/settings/SettingsIndex";
import type { Status } from "@/components/admin/settings/ui";

export const metadata = { title: "Ρυθμίσεις & διασυνδέσεις" };
export const dynamic = "force-dynamic";

const SOCIAL = [
  { p: "Google", on: "googleEnabled", need: ["googleClientId"], sec: ["googleClientSecret"] },
  { p: "Microsoft", on: "microsoftEnabled", need: ["microsoftClientId"], sec: ["microsoftClientSecret"] },
  { p: "Facebook", on: "facebookEnabled", need: ["facebookAppId"], sec: ["facebookAppSecret"] },
  { p: "Apple", on: "appleEnabled", need: ["appleClientId"], sec: ["applePrivateKey"] },
];

/** Αρχική: κάθε ενότητα με την κατάστασή της και αναζήτηση πεδίων. Μόνο Super Admin. */
export default async function SettingsHome() {
  await requireSuperAdmin();
  const [rows, keys, markups] = await Promise.all([db.setting.findMany(), db.apiKey.count({ where: { active: true } }), db.aiModelPricing.count()]);
  const date = (d: Date | null | undefined) => d?.toLocaleDateString("el-GR", { day: "numeric", month: "short", year: "numeric" }) ?? null;

  const cards: IndexCard[] = SECTIONS.map((s) => {
    const row = rows.find((r) => r.section === s.key);
    const data = (row?.data as Values) ?? {};
    const secrets = decryptJson(row?.secrets);
    const has = (k: string, secret = false) => (secret ? !!secrets[k] : data[k] !== undefined && data[k] !== "" && data[k] !== false);
    let status: Status;
    let statusText: string;
    if (s.key === "social-login") {
      const live = SOCIAL.filter((x) => data[x.on] === true && x.need.every((k) => has(k)) && x.sec.some((k) => has(k, true) || (k === "applePrivateKey" && has("appleSecret", true))));
      status = live.length ? "live" : "off";
      statusText = live.length ? `Ενεργά: ${live.map((x) => x.p).join(", ")}` : "Κανένας πάροχος ενεργός";
    } else {
      const visible = s.fields.filter((f) => !f.showIf || f.showIf(data));
      const missing = visible.filter((f) => f.required && !(isSecret(f) ? has(f.key, true) : has(f.key)));
      const filled = visible.filter((f) => (isSecret(f) ? has(f.key, true) : f.type === "softone-objs" ? has("company") : has(f.key))).length;
      if (missing.length) { status = "incomplete"; statusText = `Λείπει: ${missing.map((f) => f.label).join(", ")}`; }
      else if (filled) { status = "live"; statusText = `Ρυθμισμένο · ${filled}/${visible.length} πεδία`; }
      else { status = "off"; statusText = "Δεν έχει ρυθμιστεί"; }
    }
    return { key: s.key, href: `/admin/settings/${s.key}`, title: s.title, description: s.description, group: s.group, status, statusText, updated: date(row?.updatedAt), fields: s.fields.filter((f) => f.type !== "softone-objs").map((f) => ({ key: f.key, label: f.label, help: f.help })) };
  });
  cards.push(
    { key: "ai-markup", href: "/admin/settings/ai-markup", title: "AI markup ανά μοντέλο", description: "Ποσοστό επάνω στο κόστος OpenRouter για κάθε μοντέλο· τροφοδοτεί την αναφορά κόστους σε € με την ισοτιμία της ημέρας.", group: "integrations", status: markups ? "live" : "off", statusText: markups ? `${markups} κανόνες` : "Χωρίς markup", updated: null, fields: [{ key: "markup", label: "Markup AI ανά μοντέλο" }] },
    { key: "api-keys", href: "/admin/settings/api-keys", title: "API keys", description: "Κλειδιά για συνεργάτες και εξωτερικά συστήματα (public API, POS, webhooks).", group: "integrations", status: "live", statusText: `${keys} ενεργά`, updated: null, dark: true, fields: [{ key: "keys", label: "API keys (POS, συνεργάτες)" }] },
  );

  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ρυθμίσεις & διασυνδέσεις</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Κλειδιά και secrets αποθηκεύονται κρυπτογραφημένα (AES-256-GCM). Κάθε αλλαγή καταγράφεται στο audit log.</p>
      </div>
      <SettingsIndex groups={SECTION_GROUPS} cards={cards} />
    </>
  );
}
