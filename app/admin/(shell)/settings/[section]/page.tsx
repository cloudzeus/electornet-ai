import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { SECTIONS, sectionByKey } from "@/lib/settings/schema";
import { getSettingForForm } from "@/lib/settings/store";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { AiMarkupPanel } from "@/components/admin/AiMarkupPanel";
import { db } from "@/lib/db";
import { SocialLoginSettings } from "@/components/admin/settings/SocialLoginSettings";
import { providerConfigs, missing, PROVIDERS, type OAuthProvider } from "@/lib/account/oauth";
import { publicOrigin } from "@/lib/account/oauth-flow";
import { getSetting } from "@/lib/settings/store";
import { settingsOverview } from "@/lib/settings/status";
import { SettingsRail } from "@/components/admin/settings/SettingsRail";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: section === "api-keys" ? "API keys" : section === "ai-markup" ? "AI markup" : sectionByKey(section)?.title ?? "Ρυθμίσεις" };
}

export default async function SettingsSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSuperAdmin();
  const { section } = await params;
  if (section !== "ai-markup" && section !== "api-keys" && !sectionByKey(section)) notFound();
  const { sections: states } = await settingsOverview();
  // όλες οι ενότητες στα αριστερά (σε κινητό: λίστα επάνω), η φόρμα δεξιά
  const shell = (children: ReactNode) => (
    <div className="grid gap-4 items-start @5xl:grid-cols-[15rem_minmax(0,1fr)] @5xl:gap-6">
      <SettingsRail current={section} states={states} />
      <div className="grid gap-4 min-w-0">{children}</div>
    </div>
  );
  if (section === "ai-markup") {
    const [pricing, seen] = await Promise.all([db.aiModelPricing.findMany({ orderBy: { model: "asc" } }), db.aiUsage.groupBy({ by: ["model"], _sum: { costUsd: true }, _count: { _all: true } })]);
    const models = [...new Set([...pricing.map((p) => p.model).filter((m) => m !== "*"), ...seen.map((s) => s.model)])].sort();
    return shell(
      <>
        <AiMarkupPanel
          defaultPct={pricing.find((p) => p.model === "*")?.markupPct ?? 0}
          rows={models.map((m) => ({ model: m, markupPct: pricing.find((p) => p.model === m)?.markupPct ?? null, note: pricing.find((p) => p.model === m)?.note ?? "", calls: seen.find((s) => s.model === m)?._count._all ?? 0, costUsd: seen.find((s) => s.model === m)?._sum.costUsd ?? 0 }))}
        />
      </>
    );
  }
  if (section === "api-keys") {
    const keys = await db.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    return shell(
      <>
        <ApiKeysPanel keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, active: k.active, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
      </>
    );
  }
  const def = sectionByKey(section)!;
  if (section === "social-login") {
    const [{ data, secretSet }, cfgs, origin, general, sp] = await Promise.all([getSettingForForm(section), providerConfigs(), publicOrigin(), getSetting("general"), searchParams]);
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const tp = one(sp.test);
    const msg = one(sp.ok) ?? one(sp.error);
    const test = tp && PROVIDERS.includes(tp as OAuthProvider) && msg ? { p: tp as OAuthProvider, ok: !!one(sp.ok), msg: msg.slice(0, 400) } : null;
    const base = String(general.data.baseUrl ?? "").trim().replace(/\/$/, "");
    return shell(
      <>
        <SocialLoginSettings
          key={test ? `${test.p}-${msg}` : "form"}
          data={data}
          secretSet={secretSet}
          origin={origin}
          prodBase={/^https:\/\//.test(base) ? base : null}
          storedMissing={Object.fromEntries(PROVIDERS.map((p) => [p, missing(cfgs[p])])) as Record<OAuthProvider, string[]>}
          test={test}
        />
      </>
    );
  }
  const { data, secretSet } = await getSettingForForm(section);
  const idx = SECTIONS.findIndex((s) => s.key === section);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];
  return shell(
    <>
      <SettingsForm sectionKey={def.key} data={data} secretSet={secretSet} />
      <nav aria-label="Ενότητες" className="flex justify-between gap-3 text-[length:var(--fs-14)] font-bold">
        {prev ? <Link href={`/admin/settings/${prev.key}`} className="text-eu-blue hover:underline">← {prev.title}</Link> : <span />}
        {next && <Link href={`/admin/settings/${next.key}`} className="text-eu-blue hover:underline">{next.title} →</Link>}
      </nav>
    </>
  );
}
