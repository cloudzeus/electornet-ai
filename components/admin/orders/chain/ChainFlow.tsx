"use client";
import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { OrderChainNode } from "@/lib/softone/order-chain";
import { TONE, amountOf, depths, dmy, metaOf, stateOf, titleOf } from "./meta";

type Data = { n: OrderChainNode; selected: boolean; hasKids: boolean; i: number };
const W = 208, H = 104, GX = 52, GY = 24;

function DocNode({ data }: NodeProps<Node<Data>>) {
  const { n, selected, hasKids, i } = data;
  const { tone, Icon } = metaOf(n);
  const t = TONE[tone];
  return (
    <div style={{ width: W, animationDelay: `${i * 45}ms` }} className={`relative rounded-xl bg-white text-left cursor-pointer transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 ${selected ? "ring-2 ring-eu-blue shadow-md" : "border border-eu-line shadow-sm hover:shadow-md"}`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-eu-muted" />
      <span className={`absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r ${t.bar}`} aria-hidden />
      <div className="pl-4 pr-3 py-2.5 grid gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-7 shrink-0 rounded-lg inline-flex items-center justify-center ${t.icon}`}><Icon className="size-4" aria-hidden /></span>
          <span className="font-bold text-eu-ink text-[length:var(--fs-13)] leading-tight line-clamp-2">{titleOf(n)}</span>
        </div>
        <div className="text-eu-ink-3 text-[length:var(--fs-12)] tabular-nums truncate">{n.fincode || n.findoc} · {amountOf(n)}</div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="inline-flex gap-1 min-w-0"><span className={`rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-bold ${t.chip}`}>{stateOf(n, hasKids)}</span>{n.shared && <span title="Το παραστατικό έχει και γραμμές άλλων παραγγελιών" className="rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-bold bg-eu-amber/10 text-eu-amber">κοινό</span>}</span>
          <span className="text-eu-muted text-[length:var(--fs-11)] tabular-nums">{dmy(n.date)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-eu-muted" />
    </div>
  );
}
const nodeTypes = { doc: DocNode };

/** Διάγραμμα μετασχηματισμών: στήλες ανά βάθος (αριστερά → δεξιά), βέλη από την προέλευση στο νέο παραστατικό. */
export default function ChainFlow({ nodes: docs, root, selected, onSelect }: { nodes: OrderChainNode[]; root: number; selected: number | null; onSelect: (f: number) => void }) {
  const { nodes, edges } = useMemo(() => {
    const { depth, kids } = depths(docs, root);
    const cols = new Map<number, OrderChainNode[]>();
    for (const n of docs) cols.set(depth.get(n.findoc)!, [...(cols.get(depth.get(n.findoc)!) ?? []), n]);
    const tallest = Math.max(...[...cols.values()].map((c) => c.length));
    const nodes: Node<Data>[] = [];
    let i = 0;
    for (const [d, col] of [...cols].sort((a, b) => a[0] - b[0])) {
      const off = ((tallest - col.length) * (H + GY)) / 2;
      col.forEach((n, r) => nodes.push({ id: String(n.findoc), type: "doc", position: { x: d * (W + GX), y: off + r * (H + GY) }, data: { n, selected: n.findoc === selected, hasKids: !!kids.get(n.findoc)?.length, i: i++ }, draggable: false }));
    }
    const edges: Edge[] = docs.flatMap((n) => n.parents.map((p) => ({
      id: `${p}-${n.findoc}`, source: String(p), target: String(n.findoc), type: "smoothstep",
      animated: false, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: n.viaRoot ? "#8a8f98" : "#1d428a" },
      style: n.viaRoot ? { stroke: "#8a8f98", strokeWidth: 1.5, strokeDasharray: "5 4" } : { stroke: "#1d428a", strokeWidth: 2 },
    })));
    return { nodes, edges };
  }, [docs, root, selected]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, n) => onSelect(Number(n.id))} fitView fitViewOptions={{ padding: 0.12, minZoom: 0.5, maxZoom: 1 }}
      minZoom={0.3} maxZoom={1.6} nodesConnectable={false} nodesDraggable={false} elementsSelectable proOptions={{ hideAttribution: true }} aria-label="Διάγραμμα μετασχηματισμών παραστατικών">
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#c9ced6" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
