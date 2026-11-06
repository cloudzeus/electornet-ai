import { Ban, Clock, FileText, Receipt, RotateCcw, ShoppingCart, Truck, type LucideIcon } from "lucide-react";
import type { OrderChainNode } from "@/lib/softone/order-chain";

export type Tone = "order" | "doc" | "ship" | "cancel" | "other";
export const TONE: Record<Tone, { bar: string; chip: string; icon: string; label: string }> = {
  order: { bar: "bg-eu-blue", chip: "bg-eu-blue/10 text-eu-blue", icon: "bg-eu-blue/10 text-eu-blue", label: "Παραγγελίες" },
  ship: { bar: "bg-eu-purple", chip: "bg-eu-purple/10 text-eu-purple", icon: "bg-eu-purple/10 text-eu-purple", label: "Δελτία αποστολής" },
  doc: { bar: "bg-eu-green", chip: "bg-eu-green/10 text-eu-green", icon: "bg-eu-green/10 text-eu-green", label: "Αποδείξεις, τιμολόγια" },
  cancel: { bar: "bg-eu-red", chip: "bg-eu-red/10 text-eu-red", icon: "bg-eu-red/10 text-eu-red", label: "Ακυρώσεις, πιστωτικά" },
  other: { bar: "bg-eu-muted", chip: "bg-eu-surface text-eu-ink-3", icon: "bg-eu-surface text-eu-ink-3", label: "Λοιπά" },
};

/** Κατηγορία (FPRMS.TFPRMS) → χρώμα/εικονίδιο· αν λείπει, από το όνομα. */
export function metaOf(n: Pick<OrderChainNode, "category" | "typeName" | "seriesName">): { tone: Tone; Icon: LucideIcon } {
  const name = `${n.typeName ?? ""} ${n.seriesName ?? ""}`;
  if (/ακυρ/i.test(name)) return { tone: "cancel", Icon: Ban };
  const c = n.category ?? "";
  if (c === "151" || c === "181" || /πιστωτ|επιστροφ/i.test(name)) return { tone: "cancel", Icon: RotateCcw };
  if (c === "201" || c === "202" || /παραγγελ|pkp|pks/i.test(name)) return { tone: "order", Icon: /απλήρωτ|εκκρεμ|εκρεμ|αναμον/i.test(name) ? Clock : ShoppingCart };
  if (c === "101" || c === "104" || c === "154" || /δελτ/i.test(name)) return { tone: "ship", Icon: Truck };
  if (c === "102" || c === "103" || c === "131" || /τιμολ|απόδ|αποδ/i.test(name)) return { tone: "doc", Icon: Receipt };
  return { tone: "other", Icon: FileText };
}

export const titleOf = (n: OrderChainNode) => n.typeName ?? n.seriesName ?? `Σειρά ${n.series}`;
export const stateOf = (n: OrderChainNode, hasChildren: boolean) =>
  metaOf(n).tone === "cancel" && !hasChildren ? "ακύρωση" : n.fullyTransf === 1 ? "μετασχηματίστηκε" : n.fullyTransf === 2 ? "μερικώς" : hasChildren ? "μετασχηματίστηκε" : metaOf(n).tone === "order" ? "σε εκκρεμότητα" : "εκδόθηκε";
export const dmy = (d: string) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const money = (v: number | null) => (v == null ? "—" : v.toLocaleString("el-GR", { style: "currency", currency: "EUR" }));
/** Κοινό παραστατικό (πολλές παραγγελίες): μόνο η αξία των δικών μας γραμμών, όχι το σύνολο του εγγράφου. */
export const amountOf = (n: OrderChainNode) => (n.shared ? `${money(n.ownNet)} χ. ΦΠΑ` : money(n.total));

/** Βάθος κάθε κόμβου από τη ρίζα (για στήλες στο διάγραμμα και εσοχές στη λίστα). */
export function depths(nodes: OrderChainNode[], root: number) {
  const kids = new Map<number, number[]>();
  for (const n of nodes) for (const p of n.parents) kids.set(p, [...(kids.get(p) ?? []), n.findoc]);
  const d = new Map<number, number>([[root, 0]]);
  let q = [root];
  while (q.length) { const next: number[] = []; for (const f of q) for (const k of kids.get(f) ?? []) if (!d.has(k)) { d.set(k, d.get(f)! + 1); next.push(k); } q = next; }
  for (const n of nodes) if (!d.has(n.findoc)) d.set(n.findoc, 1);
  return { depth: d, kids };
}
