import "server-only";
import { db } from "@/lib/db";

/** Markup % for a model: exact row, else "*" default, else 0. */
export async function markupFor(model: string): Promise<number> {
  const rows = await db.aiModelPricing.findMany({ where: { model: { in: [model, "*"] } } }).catch(() => []);
  return rows.find((r) => r.model === model)?.markupPct ?? rows.find((r) => r.model === "*")?.markupPct ?? 0;
}

export const billed = (costUsd: number, markupPct: number) => costUsd * (1 + markupPct / 100);
