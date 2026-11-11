import "server-only";
import { db } from "@/lib/db";
import type { FieldDef, FieldEntity, FieldType } from "@/lib/custom-fields";

export async function loadFieldDefs(entity: FieldEntity): Promise<FieldDef[]> {
  const rows = await db.customField.findMany({ where: { entity }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label, type: r.type as FieldType, options: (r.options as string[] | null) ?? [], groupName: r.groupName, help: r.help, sort: r.sort, active: r.active }));
}
