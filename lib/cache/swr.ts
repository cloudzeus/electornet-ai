/**
 * Κρυφή μνήμη στη μνήμη του server με «stale-while-revalidate»: φρέσκο → αμέσως· παλιό → αμέσως το παλιό και
 * ανανέωση στο παρασκήνιο· τίποτα → περιμένει τον πρώτο υπολογισμό. Ταυτόχρονα αιτήματα μοιράζονται έναν υπολογισμό
 * (όχι 50 ίδια ερωτήματα στη βάση όταν λήξει). Για δεδομένα κοινά σε όλους τους επισκέπτες (μενού, δέντρο κατηγοριών).
 * `maxStaleMs`: πέρα από αυτή την ηλικία δεν σερβίρεται το παλιό — ο επόμενος περιμένει φρέσκα (π.χ. dashboard).
 */

/** Πολλές τιμές με κλειδί (π.χ. ανά χρήστη) — η καθεμία με το ίδιο swr. */
export function swrMap<T>(ttlMs: number, opts: { maxStaleMs?: number; max?: number } = {}) {
  const m = new Map<string, { get: () => Promise<T>; load: { current: () => Promise<T> } }>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    let e = m.get(key);
    if (!e) {
      if (m.size >= (opts.max ?? 500)) m.delete(m.keys().next().value!);
      const ref = { current: load };
      e = { get: swr(() => ref.current(), ttlMs, opts), load: ref };
      m.set(key, e);
    }
    e.load.current = load;
    return e.get();
  };
}
export function swr<T>(load: () => Promise<T>, ttlMs: number, opts: { maxStaleMs?: number } = {}) {
  const maxStale = opts.maxStaleMs ?? Infinity;
  let value: { at: number; data: T } | null = null;
  let pending: Promise<T> | null = null;
  const refresh = () => (pending ??= load().then((data) => { value = { at: Date.now(), data }; return data; }).finally(() => { pending = null; }));
  const get = async (): Promise<T> => {
    if (value && Date.now() - value.at < ttlMs) return value.data;
    if (value && Date.now() - value.at < maxStale) { refresh().catch(() => null); return value.data; }
    return refresh();
  };
  /** Μετά από αλλαγή στη διαχείριση: η τιμή γίνεται «παλιά» — ο επόμενος παίρνει αμέσως αυτήν και ξεκινά ανανέωση. */
  get.invalidate = () => { if (value) value = { ...value, at: 0 }; };
  return get;
}
