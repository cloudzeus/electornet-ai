import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/rbac/guard";
import { SECTIONS, sectionByKey } from "@/lib/settings/schema";
import { getSettingForForm } from "@/lib/settings/store";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { ApiKeysPanel } from "@/components/admin/ApiKeysPanel";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return { title: section === "api-keys" ? "API keys" : sectionByKey(section)?.title ?? "Ρυθμίσεις" };
}

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  await requireSuperAdmin();
  const { section } = await params;
  const back = (
    <Link href="/admin/settings" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline">
      <ChevronLeft className="size-4" aria-hidden /> Όλες οι ρυθμίσεις
    </Link>
  );
  if (section === "api-keys") {
    const keys = await db.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    return (
      <>
        {back}
        <ApiKeysPanel keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, active: k.active, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
      </>
    );
  }
  const def = sectionByKey(section);
  if (!def) notFound();
  const { data, secretSet } = await getSettingForForm(section);
  const idx = SECTIONS.findIndex((s) => s.key === section);
  const prev = SECTIONS[idx - 1];
  const next = SECTIONS[idx + 1];
  return (
    <>
      {back}
      <SettingsForm section={def} data={data} secretSet={secretSet} />
      <nav aria-label="Ενότητες" className="flex justify-between gap-3 text-[length:var(--fs-14)] font-bold">
        {prev ? <Link href={`/admin/settings/${prev.key}`} className="text-eu-blue hover:underline">← {prev.title}</Link> : <span />}
        {next && <Link href={`/admin/settings/${next.key}`} className="text-eu-blue hover:underline">{next.title} →</Link>}
      </nav>
    </>
  );
}
