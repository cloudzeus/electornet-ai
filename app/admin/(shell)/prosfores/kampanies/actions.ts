"use server";
import { revalidatePath } from "next/cache";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { publishCampaign, saveCampaign, setCampaignState, setMembership } from "@/lib/promo/campaigns";
import type { CampaignDraft } from "@/lib/promo/campaign-core";

const PERM = "catalog.promos.write";
const done = (id?: string) => { revalidatePath("/admin/prosfores/kampanies"); if (id) revalidatePath(`/admin/prosfores/kampanies/${id}`); revalidatePath("/admin/prosfores"); };

export async function saveCampaignAction(d: CampaignDraft) {
  const user = await requirePermission(PERM);
  const r = await saveCampaign(d, { id: user.id, canApprove: hasPermission(user, "catalog.promos.approve") });
  if (r.ok) done(r.id);
  return r;
}

export async function membershipAction(id: string, kind: "promotion" | "landing" | "ad", ids: string[], attach: boolean) {
  const user = await requirePermission(PERM);
  const r = await setMembership(id, kind, ids, attach, user.id);
  done(id);
  return r;
}

export async function publishCampaignAction(id: string) {
  const user = await requirePermission(PERM);
  const r = await publishCampaign(id, { id: user.id, canApprove: hasPermission(user, "catalog.promos.approve") });
  done(id);
  return r;
}

export async function campaignStateAction(id: string, action: "pause" | "resume" | "end" | "archive") {
  const user = await requirePermission(PERM);
  const r = await setCampaignState(id, action, user.id);
  done(id);
  return r;
}
