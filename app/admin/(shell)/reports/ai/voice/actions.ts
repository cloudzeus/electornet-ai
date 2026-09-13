"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { prewarmPresets, deletePhrase, speak } from "@/lib/voice/tts";

export async function prewarm(force: boolean) {
  const user = await requirePermission("reports.read");
  const r = await prewarmPresets(force);
  await audit(user.id, "voice.prewarm", "VoicePhrase", "*", null, { generated: r.filter((x) => x.ok && !x.cached).length, cached: r.filter((x) => x.cached).length, failed: r.filter((x) => !x.ok).length, costUsd: r.reduce((a, x) => a + x.costUsd, 0) });
  revalidatePath("/admin/reports/ai/voice");
  return { generated: r.filter((x) => x.ok && !x.cached).length, cached: r.filter((x) => x.cached).length, failed: r.filter((x) => !x.ok).length, costUsd: r.reduce((a, x) => a + x.costUsd, 0) };
}

export async function removePhrase(id: string) {
  const user = await requirePermission("reports.read");
  await deletePhrase(id);
  await audit(user.id, "voice.phrase.delete", "VoicePhrase", id, null, null);
  revalidatePath("/admin/reports/ai/voice");
}

/** Try a custom phrase (goes through the cache like any storefront call). */
export async function tryPhrase(text: string) {
  await requirePermission("reports.read");
  const r = await speak(text);
  revalidatePath("/admin/reports/ai/voice");
  return r ? { ok: true as const, url: r.url, cached: r.cached, costUsd: r.costUsd, durationMs: r.durationMs } : { ok: false as const };
}
