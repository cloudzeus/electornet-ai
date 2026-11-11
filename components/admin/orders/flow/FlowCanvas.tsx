"use client";
import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StateIcon, PRIMARY_LABEL } from "./ui";
import type { FEdge, FNode } from "./model";

type Data = { n: FNode; selected: boolean; canWrite: boolean; onPrimary: (id: string) => void };
const W = 208, H = 96, GX = 64, MAIL = 36, GY = 40;

const BORDER: Record<FNode["state"], string> = { done: "border border-eu-line", now: "border-2 border-eu-blue", next: "border border-dashed border-eu-muted", problem: "border-2 border-eu-red/60" };

function StageNode({ data }: NodeProps<Node<Data>>) {
  const { n, selected, canWrite, onPrimary } = data;
  return (
    <div style={{ width: W, minHeight: H }} className={`relative rounded-xl bg-white text-left cursor-pointer transition-shadow ${BORDER[n.state]} ${selected ? "ring-2 ring-eu-blue/40 ring-offset-2" : "hover:shadow-md"}`}>
      <Handle type="target" id="l" position={Position.Left} className="!size-2 !border-0 !bg-eu-muted" />
      <Handle type="target" id="t" position={Position.Top} className="!size-2 !border-0 !bg-eu-muted" />
      {n.primary && canWrite && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onPrimary(n.id); }} className={`nodrag absolute -top-4 right-2 rounded-full px-3 h-8 text-[length:var(--fs-12)] font-extrabold shadow-sm ${n.state === "problem" ? "bg-eu-red text-white" : "bg-eu-navy text-white hover:bg-eu-blue"}`}>{PRIMARY_LABEL[n.primary]}</button>
      )}
      <div className="px-3 py-2.5 grid gap-1">
        <span className="font-mono text-eu-ink-3 text-[length:var(--fs-11)] truncate pr-2">{n.code}</span>
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2">{n.title}</span>
        <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)]"><StateIcon state={n.state} /> <span className="truncate">{n.sub}</span></span>
      </div>
      <Handle type="source" id="r" position={Position.Right} className="!size-2 !border-0 !bg-eu-muted" />
      <Handle type="source" id="b" position={Position.Bottom} className="!size-2 !border-0 !bg-eu-muted" />
    </div>
  );
}

function MailNode({ data }: NodeProps<Node<Data>>) {
  const { n, selected } = data;
  return (
    <div style={{ width: W - 24 }} className={`flex items-center gap-1.5 rounded-lg border border-dashed bg-white px-2.5 h-8 text-[length:var(--fs-12)] cursor-pointer ${n.state === "problem" ? "border-eu-red/60 text-eu-red" : "border-eu-muted text-eu-ink-3"} ${selected ? "ring-2 ring-eu-blue/40" : ""}`}>
      <Handle type="target" id="t" position={Position.Top} className="!opacity-0" />
      <StateIcon state={n.state} mail /> <span className="truncate"><b className="text-eu-ink-2">{n.title}</b> · {n.sub}</span>
    </div>
  );
}
const nodeTypes = { stage: StageNode, mail: MailNode };

/** Καμβάς της ροής (React Flow): σειρά 1 τα παραστατικά, σειρά 2 η αποστολή, τα email κάτω από το στάδιο τους. */
export default function FlowCanvas({ nodes: fnodes, edges: fedges, selected, onSelect, onPrimary, canWrite }: { nodes: FNode[]; edges: FEdge[]; selected: string | null; onSelect: (id: string) => void; onPrimary: (id: string) => void; canWrite: boolean }) {
  const { nodes, edges } = useMemo(() => {
    const mailsOf = new Map<string, FNode[]>();
    for (const m of fnodes) if (m.kind === "mail" && m.parent) mailsOf.set(m.parent, [...(mailsOf.get(m.parent) ?? []), m]);
    const top = Math.max(0, ...fnodes.filter((n) => n.kind !== "mail" && n.row === 0).map((n) => mailsOf.get(n.id)?.length ?? 0));
    const rowY = [0, H + 24 + top * MAIL + GY];
    const pos = new Map<string, { x: number; y: number }>();
    const out: Node<Data>[] = [];
    for (const n of fnodes.filter((x) => x.kind !== "mail")) {
      const p = { x: n.col * (W + GX), y: rowY[n.row] };
      pos.set(n.id, p);
      out.push({ id: n.id, type: "stage", position: p, data: { n, selected: n.id === selected, canWrite, onPrimary }, draggable: false });
    }
    for (const [parent, list] of mailsOf) {
      const p = pos.get(parent); if (!p) continue;
      list.forEach((m, i) => out.push({ id: m.id, type: "mail", position: { x: p.x + 12, y: p.y + H + 24 + i * MAIL }, data: { n: m, selected: m.id === selected, canWrite, onPrimary }, draggable: false }));
    }
    const rowOf = new Map(fnodes.map((n) => [n.id, n.row]));
    const es: Edge[] = fedges.map((e) => {
      const turn = rowOf.get(e.from) !== rowOf.get(e.to);
      const color = e.dashed ? "#8a8f98" : "#1d428a";
      return { id: e.id, source: e.from, target: e.to, sourceHandle: turn ? "b" : "r", targetHandle: turn ? "t" : "l", type: "smoothstep", label: e.label,
        labelStyle: { fontSize: 11, fill: "#5b6270" }, labelBgStyle: { fill: "#f4f6f9" }, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
        style: e.dashed ? { stroke: color, strokeWidth: 1.5, strokeDasharray: "5 4" } : { stroke: color, strokeWidth: 2 } };
    });
    for (const [parent, list] of mailsOf) if (pos.has(parent)) es.push({ id: `m-${list[0].id}`, source: parent, target: list[0].id, sourceHandle: "b", targetHandle: "t", type: "straight", style: { stroke: "#b8bdc6", strokeWidth: 1 } });
    return { nodes: out, edges: es };
  }, [fnodes, fedges, selected, canWrite, onPrimary]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_, n) => onSelect(n.id)} fitView fitViewOptions={{ padding: 0.14, minZoom: 0.5, maxZoom: 1 }}
      minZoom={0.3} maxZoom={1.6} nodesConnectable={false} nodesDraggable={false} elementsSelectable proOptions={{ hideAttribution: true }} aria-label="Ροή της παραγγελίας">
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#c9ced6" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
