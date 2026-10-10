import "server-only";
import { cache } from "react";
import { getSetting } from "@/lib/settings/store";

/**
 * Ποιες λειτουργίες είναι ενεργές στις Ρυθμίσεις — από αυτό εξαρτάται τι φαίνεται στο μενού και στο dashboard
 * (ό,τι δεν έχει ενεργοποιηθεί δεν εμφανίζεται, π.χ. vouchers ενός courier ή ο συγχρονισμός SoftOne).
 */
export type Feature = "softone" | "advisor" | "courier" | "geniki" | "acs" | "boxnow" | "elta" | "asap" | "clickCollect" | "appointment" | "sms" | "newsletterSync";
export type Features = Record<Feature, boolean>;

export const getFeatures = cache(async (): Promise<Features> => {
  const [ship, s1, ai, mail] = await Promise.all(["shipping", "softone", "ai", "email"].map((s) => getSetting(s).then((x) => x.data).catch(() => ({} as Record<string, unknown>))));
  const on = (v: unknown) => v === true;
  const carriers = { geniki: on(ship.genikiOn), acs: on(ship.acsOn), boxnow: on(ship.boxnowOn), elta: on(ship.eltaOn), asap: on(ship.asapOn) };
  return {
    ...carriers,
    courier: Object.values(carriers).some(Boolean),
    clickCollect: on(ship.clickCollect),
    appointment: on(ship.appointmentDelivery),
    softone: on(s1.enabled),
    advisor: on(ai.advisorEnabled),
    sms: !!mail.smsProvider,
    newsletterSync: !!mail.newsletterProvider,
  };
});
