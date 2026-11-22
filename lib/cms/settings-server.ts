import "server-only";
import { cache } from "react";
import { defaultSettings, type Settings } from "./settings";
import { getPublishedCopy } from "./copy-store";
import { setCopy } from "./copy";
import { getSetting } from "@/lib/settings/store";

/**
 * Ρυθμίσεις βιτρίνας + οι δημοσιευμένες αλλαγές στα κείμενα UI (Περιεχόμενο → Κείμενα UI). Οι αλλαγές εφαρμόζονται
 * και στον server (setCopy) ώστε τα server components να τις δείχνουν, και περνούν στο SettingsProvider για τον browser.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const [copy, general] = await Promise.all([getPublishedCopy().catch(() => ({})), getSetting("general").then((x) => x.data).catch(() => ({} as Record<string, unknown>))]);
  setCopy(copy);
  // Ρυθμίσεις › Γενικά › Λειτουργία: «Απόκρυψη του Ερμή» / «Απόκρυψη του AR»
  const advisor = general.advisorOff === true ? { ...defaultSettings.advisor, enabled: false } : defaultSettings.advisor;
  const ar = { enabled: general.arOff !== true };
  return { ...defaultSettings, advisor, ar, ...(Object.keys(copy).length ? { copy } : {}) };
});
