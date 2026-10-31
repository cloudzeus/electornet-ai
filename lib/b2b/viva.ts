import type { Prisma } from "@prisma/client";
import { VIVA_YES } from "@/lib/partner-portal/questions";

/** Μέλη που δήλωσαν στην πύλη ότι θέλουν συνεργασία με Viva (ή έχουν ήδη και θέλουν αυτόματο διαμοιρασμό πληρωμών). */
export const VIVA_WHERE: Prisma.PartnerWhereInput[] = VIVA_YES.map((v) => ({ onboarding: { path: ["answers", "vivaOffer"], equals: v } }));
