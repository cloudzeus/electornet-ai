import "server-only";
import { cache } from "react";
import { defaultSettings, type Settings } from "./settings";
import { getPublishedCopy } from "./copy-store";
import { setCopy } from "./copy";

/**
 * Ρυθμίσεις βιτρίνας + οι δημοσιευμένες αλλαγές στα κείμενα UI (Περιεχόμενο → Κείμενα UI). Οι αλλαγές εφαρμόζονται
 * και στον server (setCopy) ώστε τα server components να τις δείχνουν, και περνούν στο SettingsProvider για τον browser.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const copy = await getPublishedCopy().catch(() => ({}));
  setCopy(copy);
  return Object.keys(copy).length ? { ...defaultSettings, copy } : defaultSettings;
});
