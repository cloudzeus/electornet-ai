import Link from "next/link";
import { KeyRound, ChevronRight } from "lucide-react";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { SECTIONS, SECTION_GROUPS, isSecret } from "@/lib/settings/schema";
import { decryptJson } from "@/lib/settings/crypto";

export const metadata = { title: "Ρυθμίσεις & διασυνδέσεις" };
export const dynamic = "force-dynamic";

/** Overview: every section as a card with its completion state. Super-admin only. */
export default async function SettingsHome() {
  await requireSuperAdmin();
  const rows = await db.setting.findMany();
  const keys = await db.apiKey.count({ where: { active: true } });
  const state = (key: string) => {
    const def = SECTIONS.find((s) => s.key === key)!;
    const row = rows.find((r) => r.section === key);
    const data = (row?.data as Record<string, unknown>) ?? {};
    const secrets = decryptJson(row?.secrets);
    const total = def.fields.length;
    const filled = def.fields.filter((f) => (isSecret(f) ? !!secrets[f.key] : data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== false)).length;
    const requiredMissing = def.fields.filter((f) => f.required && (isSecret(f) ? !secrets[f.key] : !data[f.key])).length;
    return { filled, total, requiredMissing, updatedAt: row?.updatedAt ?? null };
  };
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ρυθμίσεις & διασυνδέσεις</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Κλειδιά και secrets αποθηκεύονται κρυπτογραφημένα (AES-256-GCM). Κάθε αλλαγή καταγράφεται στο audit log.</p>
      </div>
      {SECTION_GROUPS.map((g) => (
        <section key={g.key} className="grid gap-3">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</h3>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 @5xl:grid-cols-3 gap-3">
            {SECTIONS.filter((s) => s.group === g.key).map((s) => {
              const st = state(s.key);
              return (
                <li key={s.key}>
                  <Link href={`/admin/settings/${s.key}`} className="group flex items-start gap-3 rounded-2xl bg-white border border-eu-line p-4 h-full hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
                    <div className="min-w-0 flex-1">
                      <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">{s.title}</div>
                      <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)] leading-snug">{s.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--fs-13)] font-bold">
                        <span className={`rounded-full px-2 py-0.5 ${st.requiredMissing ? "bg-eu-red/10 text-eu-red" : st.filled ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>
                          {st.requiredMissing ? `${st.requiredMissing} υποχρεωτικά λείπουν` : st.filled ? `${st.filled}/${st.total} πεδία` : "κενό"}
                        </span>
                        {st.updatedAt && <span className="text-eu-muted font-normal">{st.updatedAt.toLocaleDateString("el-GR")}</span>}
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-eu-muted group-hover:text-eu-blue shrink-0 mt-1" aria-hidden />
                  </Link>
                </li>
              );
            })}
            {g.key === "integrations" && (
              <li>
                <Link href="/admin/settings/ai-markup" className="group flex items-start gap-3 rounded-2xl bg-white border border-eu-line p-4 h-full hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">AI markup ανά μοντέλο</div>
                    <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)] leading-snug">Ποσοστό επάνω στο κόστος OpenRouter για κάθε μοντέλο· τροφοδοτεί την αναφορά κόστους σε € με την ισοτιμία της ημέρας.</p>
                  </div>
                  <ChevronRight className="size-5 text-eu-muted group-hover:text-eu-blue shrink-0 mt-1" aria-hidden />
                </Link>
              </li>
            )}
            {g.key === "integrations" && (
              <li>
                <Link href="/admin/settings/api-keys" className="group flex items-start gap-3 rounded-2xl bg-eu-navy text-white p-4 h-full hover:bg-eu-blue transition-colors">
                  <KeyRound className="size-5 text-eu-yellow shrink-0 mt-1" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-bold text-[length:var(--fs-17)]">API keys</div>
                    <p className="m-0 mt-1 text-eu-on-dark-2 text-[length:var(--fs-14)] leading-snug">Κλειδιά για συνεργάτες και εξωτερικά συστήματα (public API, webhooks).</p>
                    <div className="mt-3 rounded-full bg-white/15 inline-block px-2 py-0.5 text-[length:var(--fs-13)] font-bold">{keys} ενεργά</div>
                  </div>
                  <ChevronRight className="size-5 text-white/60 shrink-0 mt-1" aria-hidden />
                </Link>
              </li>
            )}
          </ul>
        </section>
      ))}
    </>
  );
}
