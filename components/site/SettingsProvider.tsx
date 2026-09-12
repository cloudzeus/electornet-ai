"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultSettings, type Settings } from "@/lib/cms/settings";

const C = createContext<Settings>(defaultSettings);

/** Makes the CMS settings available to every client component (`useSettings()`). */
export function SettingsProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  return <C.Provider value={settings}>{children}</C.Provider>;
}
export function useSettings(): Settings {
  return useContext(C);
}
