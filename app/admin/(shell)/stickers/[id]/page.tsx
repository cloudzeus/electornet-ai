import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { DEFAULT_STICKER, STICKER_PRESETS, type StickerParams } from "@/lib/stickers/model";
import { StickerDesigner } from "@/components/admin/stickers/StickerDesigner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sticker designer" };

export default async function StickerEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preset?: string }> }) {
  const user = await requirePermission("catalog.promos.write");
  const { id } = await params;
  const { preset } = await searchParams;
  let initial: { id: string | null; key: string; name: string; params: StickerParams; active: boolean };
  if (id === "new") {
    const t = STICKER_PRESETS.find((p) => p.key === preset);
    initial = { id: null, key: t ? t.key : "", name: t ? t.name : "", params: t ? t.params : DEFAULT_STICKER, active: true };
  } else {
    const row = await db.sticker.findUnique({ where: { id } });
    if (!row) notFound();
    initial = { id: row.id, key: row.key, name: row.name, params: row.params as unknown as StickerParams, active: row.active };
  }
  return (
    <>
      <Link href="/admin/stickers" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Όλα τα stickers</Link>
      <StickerDesigner initial={initial} canExport={can(user.permissions, "cms.media.write")} />
    </>
  );
}
