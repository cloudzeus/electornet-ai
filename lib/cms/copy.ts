import { generatedCopy } from "./copy.generated";

/**
 * @dynamic UI copy per component namespace. Every label a component shows
 * that is not product/zone data lives here (Greek defaults), keyed by a
 * stable slug; Περιεχόμενο → Κείμενα UI overrides by namespace + key (CmsDocument «copy»,
 * draft → publish). Client components: `useCopy(ns)`; server components: `copyOf(ns)`.
 *
 * Το `copyOf` επιστρέφει «ζωντανό» αντικείμενο: διαβάζει το τρέχον λεξικό σε κάθε πρόσβαση, ώστε να ισχύουν οι
 * αλλαγές ακόμη και για components που το καλούν μία φορά στην αρχή του αρχείου.
 */
export type CopyNs = keyof typeof generatedCopy;
export type Copy = Record<string, string>;
export type CopyOverrides = Record<string, Copy>;

const defaults = generatedCopy as unknown as Record<string, Copy>;
let store: Record<string, Copy> = { ...defaults };

export function copyOf(ns: string): Copy {
  return new Proxy({} as Copy, {
    get: (_t, k) => (typeof k === "string" ? store[ns]?.[k] ?? `⟦${ns}.${k}⟧` : undefined),
    has: (_t, k) => typeof k === "string" && !!store[ns] && k in store[ns],
    ownKeys: () => Object.keys(store[ns] ?? {}),
    getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && store[ns] && k in store[ns] ? { enumerable: true, configurable: true, value: store[ns][k] } : undefined),
  });
}
export function allCopy(): Record<string, Copy> {
  return store;
}
/** Οι αρχικές τιμές (χωρίς αλλαγές) — για την οθόνη διαχείρισης και την «Επαναφορά». */
export function defaultCopy(): Record<string, Copy> {
  return defaults;
}

/**
 * Εφαρμόζει τις αλλαγές του CMS πάνω στις αρχικές τιμές. Χτίζει το λεξικό από την αρχή κάθε φορά, ώστε μια αλλαγή
 * που αφαιρέθηκε να γυρίζει στην αρχική τιμή. Καλείται από το SettingsProvider (browser) και το getSettings (server).
 */
export function setCopy(overrides: CopyOverrides | undefined) {
  const next: Record<string, Copy> = {};
  for (const ns of Object.keys(defaults)) next[ns] = overrides?.[ns] ? { ...defaults[ns], ...overrides[ns] } : defaults[ns];
  for (const [ns, v] of Object.entries(overrides ?? {})) if (!next[ns]) next[ns] = { ...v };
  store = next;
}

/** Τα {placeholders} ενός κειμένου (π.χ. «{name}») — πρέπει να μένουν ίδια όταν αλλάζει το κείμενο. */
export const placeholdersOf = (s: string) => [...new Set(s.match(/\{[a-zA-Z0-9_]+\}/g) ?? [])].sort();
