"use client";

import { createContext, useContext, type ReactNode } from "react";
import { defaultSettings, type Settings } from "@/lib/cms/settings";
import { copyOf, setCopy, type Copy } from "@/lib/cms/copy";

const C = createContext<Settings>(defaultSettings);

/** Makes the CMS settings available to every client component (`useSettings()`). */
export function SettingsProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  setCopy(settings.copy);
  return <C.Provider value={settings}>{children}</C.Provider>;
}
export function useSettings(): Settings {
  return useContext(C);
}

/** UI copy for a component namespace (see lib/cms/copy.ts). */
export function useCopy(ns: string): Copy {
  return copyOf(ns);
}
