import "server-only";
import { cache } from "react";
import { defaultSettings, type Settings } from "./settings";
import { getPublishedCopy } from "./copy-store";
import { setCopy } from "./copy";
import { getSetting } from "@/lib/settings/store";
import { setInstalmentCap } from "@/lib/format";

/**
 * Ρυθμίσεις βιτρίνας + οι δημοσιευμένες αλλαγές στα κείμενα UI (Περιεχόμενο → Κείμενα UI). Οι αλλαγές εφαρμόζονται
 * και στον server (setCopy) ώστε τα server components να τις δείχνουν, και περνούν στο SettingsProvider για τον browser.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const [copy, general, pay] = await Promise.all([getPublishedCopy().catch(() => ({})), getSetting("general").then((x) => x.data).catch(() => ({} as Record<string, unknown>)), getSetting("payments").then((x) => x.data).catch(() => ({} as Record<string, unknown>))]);
  setCopy(copy);
  // Ρυθμίσεις › Πληρωμές › «Μέγιστες άτοκες δόσεις»: ό,τι γράφει το site για δόσεις ακολουθεί το όριο που στέλνουμε στη Viva
  const maxInstalments = pay.provider === "viva" ? Math.max(0, Math.min(36, Number(pay.maxInstalments) || 0)) : 0;
  setInstalmentCap(maxInstalments);
  // Ρυθμίσεις › Γενικά › Λειτουργία: «Απόκρυψη του Ερμή» / «Απόκρυψη του AR»
  const advisor = general.advisorOff === true ? { ...defaultSettings.advisor, enabled: false } : defaultSettings.advisor;
  const ar = { enabled: general.arOff !== true };
  return { ...defaultSettings, site: { ...defaultSettings.site, commerce: { ...defaultSettings.site.commerce, maxInstalments } }, advisor, ar, ...(Object.keys(copy).length ? { copy } : {}) };
});
