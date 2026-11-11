import type { FlowBase, FlowMail, FlowStep } from "@/lib/orders/flow";
import type { OrderChain, OrderChainNode } from "@/lib/softone/order-chain";
import { NEXT_SERIES } from "@/lib/softone/transform-core";
import { depths, metaOf, titleOf } from "../chain/meta";

export type FlowState = "done" | "now" | "next" | "problem";
export type FlowKind = "eshop" | "erp" | "doc" | "step" | "mail";
export interface FNode {
  id: string; kind: FlowKind; state: FlowState;
  /** σφραγίδα: σειρά/κωδικός με mono γράμματα */
  code: string; title: string; sub: string;
  col: number; row: number; parent?: string;
  doc?: OrderChainNode; step?: FlowStep; mail?: FlowMail; hasKids?: boolean;
  /** η μία ενέργεια πάνω στον κόμβο */
  primary?: string;
}
export interface FEdge { id: string; from: string; to: string; label?: string; dashed: boolean }

export const STATE_LABEL: Record<FlowState, string> = { done: "Έγινε", now: "Τώρα", next: "Επόμενο", problem: "Θέλει κίνηση" };
const ORDER_STATUS_SUB: Record<string, string> = { pending: "Αναμονή πληρωμής", paid: "Πληρώθηκε", processing: "Σε επεξεργασία", shipped: "Στάλθηκε", "ready-for-pickup": "Έτοιμη για παραλαβή", delivered: "Παραδόθηκε", cancelled: "Ακυρώθηκε", returned: "Επιστράφηκε" };
const ERP_SUB: Record<string, string> = { preview: "Προσχέδιο, δεν στάλθηκε", "awaiting-payment": "Περιμένει την πληρωμή", queued: "Σε ουρά για αποστολή", sent: "Στάλθηκε", failed: "Η αποστολή απέτυχε" };
const dm = (iso: string) => new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Κόμβοι και βέλη της ροής: eshop → παραστατικά SoftOne (από την πορεία) → βήματα αποστολής, με τα email κάτω από το στάδιο που τα έστειλε. */
export function buildFlow(base: FlowBase, chain: OrderChain | null): { nodes: FNode[]; edges: FEdge[] } {
  const nodes: FNode[] = [], edges: FEdge[] = [];
  const o = base.order;
  nodes.push({
    id: "eshop", kind: "eshop", code: `ESHOP · ${o.number}`, title: "Παραγγελία eshop", sub: ORDER_STATUS_SUB[o.status] ?? o.status, col: 0, row: 0,
    state: o.status === "cancelled" ? "problem" : o.status === "pending" ? "now" : "done",
  });

  let last = "eshop";
  const docs = chain?.ok ? chain.nodes : [];
  if (docs.length && chain?.ok) {
    const { depth, kids } = depths(docs, chain.root);
    for (const d of docs) {
      const hasKids = !!kids.get(d.findoc)?.length;
      const cancel = metaOf(d).tone === "cancel";
      const canNext = !hasKids && d.fullyTransf !== 1 && !cancel && !!NEXT_SERIES[String(d.series)];
      nodes.push({
        id: `doc:${d.findoc}`, kind: "doc", doc: d, hasKids, code: `${d.series} · ${d.fincode || d.findoc}`, title: titleOf(d),
        sub: hasKids || d.fullyTransf === 1 ? "Μετασχηματίστηκε" : d.fullyTransf === 2 ? "Μερικώς" : canNext ? "Περιμένει μετασχηματισμό" : cancel ? "Ακύρωση" : "Εκδόθηκε",
        state: cancel ? "problem" : canNext ? "now" : "done", col: depth.get(d.findoc)! + 1, row: 0, primary: canNext ? "transform" : undefined,
      });
      for (const p of d.parents) edges.push({ id: `${p}-${d.findoc}`, from: `doc:${p}`, to: `doc:${d.findoc}`, label: "μετασχ.", dashed: d.viaRoot });
    }
    edges.push({ id: "eshop-root", from: "eshop", to: `doc:${chain.root}`, label: "αυτόματα", dashed: false });
    // το βαθύτερο παραστατικό συνεχίζει στην αποστολή
    last = `doc:${[...docs].sort((a, b) => depth.get(b.findoc)! - depth.get(a.findoc)! || b.date.localeCompare(a.date))[0].findoc}`;
  } else {
    const e = base.erp;
    const failed = e?.status === "failed" || (chain && !chain.ok && chain.reason === "error");
    nodes.push({
      id: "erp", kind: "erp", code: "7005 · SoftOne", title: "Παραγγελία SoftOne", col: 1, row: 0,
      sub: chain && !chain.ok && chain.reason === "error" ? "Δεν διαβάστηκε η πορεία" : e ? ERP_SUB[e.status] ?? e.status : "Δεν έχει ετοιμαστεί",
      state: failed ? "problem" : e?.status === "sent" ? "done" : o.status === "pending" ? "next" : "now", primary: "erpCheck",
    });
    edges.push({ id: "eshop-erp", from: "eshop", to: "erp", label: "αυτόματα", dashed: e?.status !== "sent" });
    last = "erp";
  }

  const anyNow = nodes.some((n) => n.state === "now");
  const r = base.route;
  let firstOpen = true;
  (r?.steps ?? []).forEach((s, i) => {
    const who = s.key === "agency" ? r!.agency : s.key === "partner" ? r!.partner : s.key === "carrier" ? r!.carrier : null;
    const state: FlowState = s.doneAt ? "done" : firstOpen ? (anyNow ? "next" : "now") : "next";
    if (!s.doneAt) firstOpen = false;
    nodes.push({
      id: `step:${s.key}`, kind: "step", step: s, code: `ΒΗΜΑ ${i + 1}/${r!.steps.length} · ΑΠΟΣΤΟΛΗ`, title: who?.name ?? s.label,
      sub: s.doneAt ? `${s.label} · ${dm(s.doneAt)}` : s.label, state, col: i, row: 1, primary: state === "now" ? "stepDone" : undefined,
    });
    edges.push({ id: `to-${s.key}`, from: i === 0 ? last : `step:${r!.steps[i - 1].key}`, to: `step:${s.key}`, dashed: !s.doneAt });
  });

  for (const m of base.mails) {
    const parent = m.findoc && nodes.some((n) => n.id === `doc:${m.findoc}`) ? `doc:${m.findoc}`
      : m.template === "order-erp-stage" ? (nodes.find((n) => n.kind === "erp") ? "erp" : "eshop")
      : ["order-delivered", "order-ready-for-pickup"].includes(m.template) && nodes.some((n) => n.id === "step:customer") ? "step:customer"
      : "eshop";
    const bad = m.status === "failed" || m.status === "skipped";
    nodes.push({
      id: `mail:${m.id}`, kind: "mail", mail: m, parent, code: "", title: m.label, sub: bad ? (m.status === "skipped" ? "Δεν στάλθηκε" : "Απέτυχε") : m.status === "sent" ? dm(m.at) : "Σε αναμονή",
      state: bad ? "problem" : m.status === "sent" ? "done" : "next", col: 0, row: 0, primary: bad && (m.template === "order-confirmation" || m.findoc) ? "remail" : undefined,
    });
  }
  return { nodes, edges };
}

/** Το ένα πράγμα που θέλει κίνηση τώρα: πρώτα ό,τι έχει πρόβλημα, μετά το τρέχον στάδιο. */
export function nextOf(nodes: FNode[]): FNode | null {
  return nodes.find((n) => n.state === "problem") ?? nodes.find((n) => n.state === "now") ?? null;
}
