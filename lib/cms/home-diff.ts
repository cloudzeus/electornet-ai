import type { BrandBlock } from "./brand-store";
import { afterZone, TOP_ZONE, type HomeDoc, type HomeSection } from "./home-sections";

/* Η αρχική ως μία λίστα (ενότητες + components με τη σειρά της σελίδας) και οι διαφορές πρόχειρου ↔ δημοσιευμένης. */

export type HomeItem = { key: string; kind: "section"; s: HomeSection } | { key: string; kind: "block"; b: BrandBlock };
export const secKey = (id: string) => `sec:${id}`;
export const blkKey = (id: string) => `blk:${id}`;

/** Έγγραφο → λίστα με τη σειρά που εμφανίζεται στη σελίδα. */
export function flatten(doc: HomeDoc): HomeItem[] {
  const at = (zone: string) => doc.blocks.filter((b) => (b.zone ?? TOP_ZONE) === zone).map((b): HomeItem => ({ key: blkKey(b.id), kind: "block", b }));
  return [...at(TOP_ZONE), ...doc.sections.flatMap((s) => [{ key: secKey(s.id), kind: "section", s } as HomeItem, ...at(afterZone(s.id))])];
}
/** Λίστα → έγγραφο: κάθε component παίρνει τη ζώνη της ενότητας που προηγείται (ή «κορυφή»). */
export function rebuild(items: HomeItem[]): HomeDoc {
  let zone = TOP_ZONE;
  const sections: HomeSection[] = [], blocks: BrandBlock[] = [];
  for (const it of items) {
    if (it.kind === "section") { sections.push(it.s); zone = afterZone(it.s.id); } else blocks.push({ ...it.b, zone });
  }
  return { sections, blocks };
}

/** JSON με σταθερή σειρά κλειδιών (χωρίς undefined) — για σύγκριση. */
export const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

type Body = Record<string, unknown>;
const body = (x: HomeItem): Body => (x.kind === "section" ? { ...x.s } : { ...x.b, zone: undefined });

export type HomeChange =
  | { type: "added" | "removed"; key: string; item: HomeItem }
  | { type: "changed"; key: string; item: HomeItem; what: string[] }
  | { type: "order"; key: "order"; moved: string[] };

/** Τι άλλαξε σε ένα στοιχείο, σε απλές λέξεις. */
function whatChanged(a: Body, b: Body): string[] {
  const vis = ["enabled"], when = ["schedule"], who = ["audience"], dev = ["hideOn"];
  const ignore = new Set(["id", "zone", "type", ...vis, ...when, ...who, ...dev]);
  const diff = (keys: string[]) => keys.some((k) => stable(a[k]) !== stable(b[k]));
  const out: string[] = [];
  if (diff(vis)) out.push(a.enabled === false ? "κρύφτηκε" : "εμφανίστηκε");
  if (diff(when)) out.push("ημερομηνίες");
  if (diff(who)) out.push("κοινό");
  if (diff(dev)) out.push("συσκευές");
  const rest = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !ignore.has(k));
  if (diff(rest)) out.push("περιεχόμενο");
  return out.length ? out : ["περιεχόμενο"];
}

/** Οι αλλαγές του πρόχειρου από τη δημοσιευμένη: προσθήκες, αφαιρέσεις, αλλαγές, σειρά. */
export function diffHome(doc: HomeDoc, pub: HomeDoc | null): HomeChange[] {
  if (!pub) return [];
  const a = flatten(doc), b = flatten(pub);
  const bm = new Map(b.map((x) => [x.key, x]));
  const am = new Map(a.map((x) => [x.key, x]));
  const out: HomeChange[] = [];
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
export function revertChange(doc: HomeDoc, pub: HomeDoc, c: HomeChange): HomeDoc {
  const a = flatten(doc), b = flatten(pub);
  if (c.type === "added") return rebuild(a.filter((x) => x.key !== c.key));
  if (c.type === "changed") { const o = b.find((x) => x.key === c.key); return o ? rebuild(a.map((x) => (x.key === c.key ? o : x))) : doc; }
  if (c.type === "removed") {
    const i = b.findIndex((x) => x.key === c.key);
    // μπαίνει μετά το πιο κοντινό προηγούμενο στοιχείο της δημοσιευμένης που υπάρχει ακόμη
    let at = 0;
    for (let j = i - 1; j >= 0; j--) { const k = a.findIndex((x) => x.key === b[j].key); if (k >= 0) { at = k + 1; break; } }
    const l = [...a]; l.splice(at, 0, b[i]); return rebuild(l);
  }
  // σειρά: οι κοινές θέσεις παίρνουν τη σειρά της δημοσιευμένης· τα νέα μένουν στη θέση τους
  const am = new Set(a.map((x) => x.key));
  const order = b.filter((x) => am.has(x.key)).map((x) => x.key);
  const pm = new Set(order);
  const by = new Map(a.map((x) => [x.key, x]));
  let n = 0;
  return rebuild(a.map((x) => (pm.has(x.key) ? by.get(order[n++])! : x)));
}
