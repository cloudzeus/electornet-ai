/* Διαφορές πρόχειρου ↔ δημοσιευμένης για σελίδες που είναι μια λίστα στοιχείων με κλειδί (αρχική, σελίδες μαρκών). */

export type Body = Record<string, unknown>;
export type ListChange<T> =
  | { type: "added" | "removed"; key: string; item: T }
  | { type: "changed"; key: string; item: T; what: string[] }
  | { type: "order"; key: "order"; moved: string[] };

/** JSON με σταθερή σειρά κλειδιών (χωρίς undefined) — για σύγκριση. */
export const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

/** Τι άλλαξε σε ένα στοιχείο, σε απλές λέξεις. */
export function whatChanged(a: Body, b: Body): string[] {
  const ignore = new Set(["id", "zone", "type", "enabled", "schedule", "audience", "hideOn"]);
  const diff = (keys: string[]) => keys.some((k) => stable(a[k]) !== stable(b[k]));
  const out: string[] = [];
  if (diff(["enabled"])) out.push(a.enabled === false ? "κρύφτηκε" : "εμφανίστηκε");
  if (diff(["schedule"])) out.push("ημερομηνίες");
  if (diff(["audience"])) out.push("κοινό");
  if (diff(["hideOn"])) out.push("συσκευές");
  const rest = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !ignore.has(k));
  if (diff(rest)) out.push("περιεχόμενο");
  return out.length ? out : ["περιεχόμενο"];
}

/** Προσθήκες, αφαιρέσεις, αλλαγές (με το τι άλλαξε) και σειρά. */
export function diffLists<T extends { key: string }>(a: T[], b: T[], body: (x: T) => Body): ListChange<T>[] {
  const bm = new Map(b.map((x) => [x.key, x]));
  const am = new Map(a.map((x) => [x.key, x]));
  const out: ListChange<T>[] = [];
  for (const x of a) {
    const o = bm.get(x.key);
    if (!o) out.push({ type: "added", key: x.key, item: x });
    else if (stable(body(x)) !== stable(body(o))) out.push({ type: "changed", key: x.key, item: x, what: whatChanged(body(x), body(o)) });
  }
  for (const x of b) if (!am.has(x.key)) out.push({ type: "removed", key: x.key, item: x });
  const ca = a.filter((x) => bm.has(x.key)).map((x) => x.key), cb = b.filter((x) => am.has(x.key)).map((x) => x.key);
  if (ca.join("|") !== cb.join("|")) {
    // όσα μετακινήθηκαν (όχι όσα απλώς «σπρώχτηκαν»): ό,τι δεν ανήκει στη μεγαλύτερη αμετάβλητη υπακολουθία
    const pos = ca.map((k) => cb.indexOf(k));
    const len: number[] = [], prev: number[] = [];
    pos.forEach((p, i) => { len[i] = 1; prev[i] = -1; for (let j = 0; j < i; j++) if (pos[j] < p && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; } });
    const keep = new Set<number>();
    for (let i = len.indexOf(Math.max(...len)); i >= 0; i = prev[i]) keep.add(i);
    out.push({ type: "order", key: "order", moved: ca.filter((_, i) => !keep.has(i)) });
  }
  return out;
}

/** Αναίρεση μίας αλλαγής: το στοιχείο (ή η σειρά) γυρίζει όπως είναι δημοσιευμένο· τα υπόλοιπα μένουν. */
export function revertInList<T extends { key: string }>(a: T[], b: T[], c: ListChange<T>): T[] {
  if (c.type === "added") return a.filter((x) => x.key !== c.key);
  if (c.type === "changed") { const o = b.find((x) => x.key === c.key); return o ? a.map((x) => (x.key === c.key ? o : x)) : a; }
  if (c.type === "removed") {
    const i = b.findIndex((x) => x.key === c.key);
    // μπαίνει μετά το πιο κοντινό προηγούμενο στοιχείο της δημοσιευμένης που υπάρχει ακόμη
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = a.findIndex((x) => x.key === b[j].key); if (k >= 0) { at = k + 1; break; } }
    const l = [...a]; l.splice(at, 0, b[i]); return l;
  }
  // σειρά: οι κοινές θέσεις παίρνουν τη σειρά της δημοσιευμένης· τα νέα μένουν στη θέση τους
  const am = new Set(a.map((x) => x.key));
  const order = b.filter((x) => am.has(x.key)).map((x) => x.key);
  const pm = new Set(order);
  const by = new Map(a.map((x) => [x.key, x]));
  let n = 0;
  return a.map((x) => (pm.has(x.key) ? by.get(order[n++])! : x));
}
