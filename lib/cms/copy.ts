import { generatedCopy } from "./copy.generated";

/**
 * @dynamic UI copy per component namespace. Every label a component shows
 * that is not product/zone data lives here (Greek defaults), keyed by a
 * stable slug; the CMS «Copy» collection overrides by namespace + key and
 * can add languages. Client components: `useCopy(ns)`; server components:
 * `copyOf(ns)` (values fetched with the settings at ISR time).
 */
export type CopyNs = keyof typeof generatedCopy;
export type Copy = Record<string, string>;

const store: Record<string, Copy> = { ...(generatedCopy as unknown as Record<string, Copy>) };

export function copyOf(ns: string): Copy {
  return new Proxy(store[ns] ?? {}, { get: (t, k: string) => t[k] ?? `⟦${ns}.${k}⟧` });
}
export function allCopy(): Record<string, Copy> {
  return store;
}
/** Merge CMS overrides (by namespace) into the live store — called by SettingsProvider on the client and by getSettings on the server. */
export function setCopy(overrides: Record<string, Copy> | undefined) {
  if (!overrides) return;
  for (const [ns, v] of Object.entries(overrides)) store[ns] = { ...(store[ns] ?? {}), ...v };
}
