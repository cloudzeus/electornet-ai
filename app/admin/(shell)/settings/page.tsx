import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { SECTIONS, SECTION_GROUPS } from "@/lib/settings/schema";
import { settingsOverview } from "@/lib/settings/status";
import { SettingsIndex, type IndexCard } from "@/components/admin/settings/SettingsIndex";

export const metadata = { title: "Ρυθμίσεις & διασυνδέσεις" };
export const dynamic = "force-dynamic";

/**
 * Αρχική των ρυθμίσεων: τι θέλει προσοχή (με σύνδεσμο κατευθείαν στο πεδίο), τι είναι ενεργό στο site, και οι ενότητες
 * ανά σκοπό με την κατάστασή τους· αναζήτηση που βρίσκει και μεμονωμένα πεδία. Μόνο Super Admin.
 */
export default async function SettingsHome() {
  await requireSuperAdmin();
  const [{ sections, attention, features }, keys, markups] = await Promise.all([settingsOverview(), db.apiKey.count({ where: { active: true } }), db.aiModelPricing.count()]);

  const cards: IndexCard[] = SECTIONS.map((s) => {
    const st = sections.find((x) => x.key === s.key)!;
    return {
      key: s.key, href: `/admin/settings/${s.key}`, title: s.title, description: s.description, group: s.group,
      status: st.status === "disabled" ? "off" : st.status, statusText: st.text, updated: st.updated,
      fields: s.fields.filter((f) => f.type !== "softone-objs").map((f) => ({ key: f.key, label: f.label, help: f.help })),
    };
  });
  cards.push(
    { key: "ai-markup", href: "/admin/settings/ai-markup", title: "AI markup ανά μοντέλο", description: "Ποσοστό επάνω στο κόστος OpenRouter για κάθε μοντέλο· τροφοδοτεί την αναφορά κόστους σε € με την ισοτιμία της ημέρας.", group: "systems", status: markups ? "live" : "off", statusText: markups ? `${markups} κανόνες` : "Χωρίς markup", updated: null, fields: [{ key: "markup", label: "Markup AI ανά μοντέλο" }] },
    { key: "api-keys", href: "/admin/settings/api-keys", title: "API keys", description: "Κλειδιά για συνεργάτες και εξωτερικά συστήματα (public API, POS, webhooks).", group: "systems", status: keys ? "live" : "off", statusText: keys ? `${keys} ενεργά` : "Κανένα κλειδί", updated: null, fields: [{ key: "keys", label: "API keys (POS, συνεργάτες)" }] },
  );

  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ρυθμίσεις & διασυνδέσεις</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Ξεκίνα από όσα θέλουν προσοχή. Κλειδιά και secrets αποθηκεύονται κρυπτογραφημένα (AES-256-GCM)· κάθε αλλαγή καταγράφεται στο audit log.</p>
      </div>
      <SettingsIndex groups={SECTION_GROUPS} cards={cards} attention={attention} features={features} />
    </>
  );
}
