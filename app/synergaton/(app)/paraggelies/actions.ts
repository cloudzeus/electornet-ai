"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getPortalUser } from "@/lib/partner-portal/session";
import { markStep } from "@/lib/delivery/server";

/** Ο συνεργάτης επιβεβαιώνει σκέλος της παράδοσης: «Το παρέλαβα» (από το πρακτορείο) ή «Παρέδωσα στον πελάτη» (με όνομα παραλήπτη). */
export async function portalDeliveryStepAction(orderId: string, key: "partner" | "customer", proof: string) {
  const u = await getPortalUser();
  if (!u) throw new Error("Η σύνδεση έληξε. Συνδεθείτε ξανά.");
  if (key !== "partner" && key !== "customer") throw new Error("Άγνωστο βήμα");
  const route = await db.orderRoute.findUnique({ where: { orderId }, include: { steps: true } });
  if (!route || route.partnerId !== u.partner.id || route.status !== "open") throw new Error("Η παράδοση δεν είναι πια δική σας ή έχει κλείσει");
  if (key === "customer" && proof.trim().length < 2) throw new Error("Γράψτε ποιος παρέλαβε");
  const by = `portal:${u.accountId}`;
  // παρέλαβε από το πρακτορείο → έφτασε και στο πρακτορείο· παρέδωσε → το είχε στα χέρια του
  const before = key === "partner" ? ["load", "agency"] : ["load", "agency", "partner"];
  for (const s of route.steps) if (before.includes(s.key) && !s.doneAt) await markStep(orderId, s.key as "agency", by, { note: "επιβεβαίωση από τον συνεργάτη" });
  await markStep(orderId, key, by, { proof: key === "customer" ? proof : null });
  revalidatePath("/synergaton/paraggelies");
  return { ok: true as const };
}
