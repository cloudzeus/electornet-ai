import { requirePermission } from "@/lib/rbac/guard";
import { defaultCopy } from "@/lib/cms/copy";
import { getCopyDoc } from "@/lib/cms/copy-store";
import { metaOf } from "@/lib/cms/copy-meta";
import { CopyEditor, type CopyGroup } from "@/components/admin/cms/CopyEditor";

export const metadata = { title: "Κείμενα UI" };
export const dynamic = "force-dynamic";

export default async function CopyPage() {
  await requirePermission("cms.copy.write");
  const defs = defaultCopy();
  const doc = await getCopyDoc();
  const groups: CopyGroup[] = Object.entries(defs).map(([ns, keys]) => ({ ns, ...metaOf(ns), entries: Object.entries(keys).map(([key, def]) => ({ key, def })) })).sort((a, b) => a.area.localeCompare(b.area, "el") || a.label.localeCompare(b.label, "el"));
  return <CopyEditor groups={groups} draft={doc.draft} published={doc.published} savedAt={doc.updatedAt?.toISOString() ?? null} />;
}
