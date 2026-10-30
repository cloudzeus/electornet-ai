"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { AlertTriangle, Check, ChevronRight, ExternalLink, EyeOff, FolderTree, GripVertical, Loader2, Lock, MoveRight, Pencil, Play, Plus, RotateCcw, Search, Square, X } from "lucide-react";
import type { CatNode } from "@/lib/catalog/category-admin";
import { addNodeAction, opControlAction, opsAction, previewMoveAction, reorderAction, saveNodeAction, startMoveAction } from "@/app/admin/(shell)/catalog/categories/actions";
import { Dialog } from "./QuickActions";

type Msg = { ok: boolean; text: string; details?: string[] } | null;
type Op = Awaited<ReturnType<typeof opsAction>>[number];
type Preview = Awaited<ReturnType<typeof previewMoveAction>> & { node: string; parent: string };
type Can = { write: boolean; erp: boolean; reason: string | null };

const LEVEL = { 1: "Κεντρική", 2: "Κατηγορία", 3: "Τύπος προϊόντος" } as const;
const CHILD = { 1: "Νέα κατηγορία", 2: "Νέος τύπος προϊόντος" } as const;

/** Γονέας κόμβου μέσα στο δέντρο (null για τις κεντρικές). */
function indexTree(tree: CatNode[]) {
  const parent = new Map<string, string | null>(), node = new Map<string, CatNode>();
  const walk = (list: CatNode[], p: string | null) => { for (const n of list) { parent.set(n.key, p); node.set(n.key, n); walk(n.children, n.key); } };
  walk(tree, null);
  return { parent, node };
}

/** Τι θα γίνει αν ο `a` αφεθεί πάνω στον `b`: σειρά (ίδιος γονέας) ή μετακίνηση (άλλος γονέας). */
function intent(a: CatNode, b: CatNode, parent: Map<string, string | null>): { kind: "reorder"; keys: string[] } | { kind: "move"; to: string } | { kind: "none"; why?: string } {
  if (a.key === b.key) return { kind: "none" };
  const pa = parent.get(a.key) ?? null, pb = parent.get(b.key) ?? null;
  if (a.level === b.level) {
    if (pa === pb) return { kind: "reorder", keys: [] };
    if (a.level === 1) return { kind: "none" };
    return { kind: "move", to: pb! };
  }
  if (b.level === a.level - 1) return b.key === pa ? { kind: "none", why: "Είναι ήδη εκεί." } : { kind: "move", to: b.key };
  return { kind: "none", why: a.level === 2 ? "Μια κατηγορία μπαίνει μόνο κάτω από κεντρική." : "Ένας τύπος προϊόντος μπαίνει μόνο κάτω από κατηγορία." };
}

export function CategoryTree({ tree, can }: { tree: CatNode[]; can: Can }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [ops, setOps] = useState<Op[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState<CatNode | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const { parent, node } = useMemo(() => indexTree(tree), [tree]);

  const loadOps = useCallback(async () => setOps(await opsAction()), []);
  useEffect(() => { void opsAction().then(setOps); }, []);
  const active = ops.some((o) => o.status === "queued" || o.status === "running");
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => void loadOps().then(() => router.refresh()), 4000);
    return () => clearInterval(h);
  }, [active, loadOps, router]);

  const show = (r: { ok: boolean; message?: string; error?: string; details?: string[] }) => setMsg(r.ok ? { ok: true, text: r.message ?? "Έγινε." } : { ok: false, text: r.error ?? "Σφάλμα.", details: r.details });

  // αναζήτηση: κρατά τους προγόνους όσων ταιριάζουν και τα ανοίγει
  const needle = q.trim().toLocaleLowerCase("el");
  const visible = useMemo(() => {
    if (!needle) return null;
    const keep = new Set<string>();
    for (const [k, n] of node) if (n.name.toLocaleLowerCase("el").includes(needle)) { let c: string | null = k; while (c) { keep.add(c); c = parent.get(c) ?? null; } }
    return keep;
  }, [needle, node, parent]);
  const isOpen = (k: string) => (visible ? visible.has(k) : open.has(k));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }), useSensor(KeyboardSensor));
  const onStart = (e: DragStartEvent) => { setDragging(node.get(String(e.active.id)) ?? null); setMsg(null); };
  const onOver = (e: DragOverEvent) => setOver(e.over ? String(e.over.id) : null);
  const onEnd = (e: DragEndEvent) => {
    setDragging(null); setOver(null);
    const a = node.get(String(e.active.id)), b = e.over ? node.get(String(e.over.id)) : undefined;
    if (!a || !b) return;
    const it = intent(a, b, parent);
    if (it.kind === "none") { if (it.why) setMsg({ ok: false, text: it.why }); return; }
    if (it.kind === "reorder") {
      const p = parent.get(a.key) ?? null;
      const siblings = (p ? node.get(p)!.children : tree).map((x) => x.key).filter((k) => k !== a.key);
      siblings.splice(siblings.indexOf(b.key), 0, a.key);
      start(async () => { const r = await reorderAction(siblings); show(r); if (r.ok) router.refresh(); });
      return;
    }
    askMove(a.key, it.to);
  };
  const askMove = (nodeKey: string, parentKey: string) => start(async () => {
    const p = await previewMoveAction(nodeKey, parentKey);
    if (!p.ok) { setMsg({ ok: false, text: p.error ?? "Η μετακίνηση δεν επιτρέπεται." }); return; }
    setPreview({ ...p, node: nodeKey, parent: parentKey });
  });
  const confirmMove = () => preview && start(async () => {
    const r = await startMoveAction(preview.node, preview.parent);
    setPreview(null);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Η μετακίνηση ξεκίνησε. Η πρόοδος φαίνεται παραπάνω· αν διακοπεί, συνεχίζει μόνη της από εκεί που σταμάτησε." });
    await loadOps();
  });

  const hint = dragging && over && node.get(over) ? intent(dragging, node.get(over)!, parent) : null;
  const hintText = !hint ? "Άφησέ το πάνω σε άλλη γραμμή" : hint.kind === "reorder" ? `Σειρά: πριν από «${node.get(over!)!.name}» (μόνο στο κατάστημα)` : hint.kind === "move" ? `Μετακίνηση κάτω από «${node.get(hint.to)!.name}» — θα δεις πρώτα προεπισκόπηση` : hint.why ?? "Δεν γίνεται εδώ";

  return (
    <div className="grid gap-3 min-w-0">
      {!can.erp && (
        <p data-help="cats.write-switch" className="m-0 rounded-xl bg-eu-amber/10 border border-eu-amber/40 px-4 py-3 text-[length:var(--fs-14)] text-eu-ink flex gap-2">
          <Lock className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden />
          <span>{can.reason} Μπορείς να δεις τι θα άλλαζε (προεπισκόπηση) και να αλλάξεις τη σειρά εμφάνισης στο κατάστημα.</span>
        </p>
      )}
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-[length:var(--fs-14)] flex gap-2 ${msg.ok ? "bg-eu-green/10 border border-eu-green/30" : "bg-eu-red/10 border border-eu-red/30"}`}>
          {msg.ok ? <Check className="size-4 text-eu-green shrink-0 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 text-eu-red shrink-0 mt-0.5" aria-hidden />}
          <div className="flex-1 min-w-0 text-eu-ink"><b>{msg.ok ? "Ολοκληρώθηκε: " : "Δεν ολοκληρώθηκε: "}</b>{msg.text}{msg.details?.length ? <ul className="m-0 mt-1 pl-5">{msg.details.map((d) => <li key={d}>{d}</li>)}</ul> : null}</div>
          <button type="button" aria-label="Κλείσιμο μηνύματος" onClick={() => setMsg(null)} className="size-8 grid place-items-center rounded-full hover:bg-black/5 shrink-0"><X className="size-4" aria-hidden /></button>
        </div>
      )}
      <OpsPanel ops={ops} canErp={can.erp} onChange={async (r) => { show(r); await loadOps(); }} />

      <div className="flex flex-wrap items-center gap-2">
        <label data-help="cats.search" className="relative flex-1 min-w-[14rem]">
          <span className="sr-only">Αναζήτηση κατηγορίας</span>
          <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση κατηγορίας ή τύπου προϊόντος…" className="w-full min-h-11 rounded-full border border-eu-line bg-white pl-9 pr-3 text-[length:var(--fs-14)]" />
        </label>
        <button type="button" onClick={() => setOpen(open.size ? new Set() : new Set([...node.values()].filter((n) => n.level < 3).map((n) => n.key)))} className="min-h-11 rounded-full border border-eu-line px-4 font-bold text-eu-ink-3 text-[length:var(--fs-13)] hover:border-eu-navy hover:text-eu-navy">{open.size ? "Κλείσιμο όλων" : "Άνοιγμα όλων"}</button>
        <AddInline label="Νέα κεντρική κατηγορία" disabled={!can.erp} title={can.reason ?? undefined} onAdd={(name) => start(async () => { const r = await addNodeAction(null, name); show(r); if (r.ok) router.refresh(); })} />
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Σύρε από τη λαβή <GripVertical className="inline size-3.5" aria-hidden />: πάνω σε γραμμή του ίδιου επιπέδου αλλάζει τη σειρά (ή μετακινεί κάτω από τον γονέα της)· πάνω στο επίπεδο από πάνω μετακινεί μέσα του. Στο κινητό: κράτα πατημένη τη λαβή. Εναλλακτικά «Μετακίνηση σε…» σε κάθε γραμμή.</p>

      <DndContext sensors={sensors} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setDragging(null); setOver(null); }}>
        <ul data-help="cats.tree" role="tree" aria-label="Δέντρο κατηγοριών" className="m-0 p-0 list-none grid gap-1.5">
          {tree.filter((n) => !visible || visible.has(n.key)).map((n) => (
            <Row key={n.key} n={n} depth={0} isOpen={isOpen} toggle={toggle} visible={visible} can={can} busy={busy} dragging={dragging} over={over} tree={tree}
              onSave={(key, patch) => start(async () => { const r = await saveNodeAction(key, patch); show(r); if (r.ok) router.refresh(); })}
              onAdd={(key, name) => start(async () => { const r = await addNodeAction(key, name); show(r); if (r.ok) { setOpen((s) => new Set(s).add(key)); router.refresh(); } })}
              onMove={askMove} />
          ))}
        </ul>
        <DragOverlay>{dragging ? <div className="rounded-xl bg-white border-2 border-eu-blue shadow-[var(--shadow-raised)] px-3 py-2 text-[length:var(--fs-14)] max-w-[min(28rem,90vw)]"><b className="text-eu-ink">{dragging.name}</b><div className="text-eu-blue text-[length:var(--fs-13)]">{hintText}</div></div> : null}</DragOverlay>
      </DndContext>

      <Dialog open={!!preview} onClose={() => setPreview(null)} title="Προεπισκόπηση μετακίνησης" sub={preview?.title} icon={<MoveRight className="size-4 text-eu-blue" aria-hidden />}>
        {preview && (
          <div data-help="cats.move-preview" className="grid gap-3 text-[length:var(--fs-14)] text-eu-ink">
            <ul className="m-0 pl-5 grid gap-1">
              <li><b>{preview.items?.toLocaleString("el-GR")}</b> είδη θα αλλάξουν κατηγορία στο SoftOne (ένα-ένα, με επαλήθευση).</li>
              {preview.groups ? <li><b>{preview.groups}</b> τύποι προϊόντος μετακινούνται μαζί.</li> : null}
              {preview.notes?.map((n) => <li key={n}>{n}</li>)}
              <li>Η κατηγορία στο κατάστημα κρατά διεύθυνση (URL), προϊόντα και φίλτρα.</li>
              <li>Αν διακοπεί (deploy, σφάλμα δικτύου), συνεχίζει από εκεί που σταμάτησε.</li>
            </ul>
            {!can.erp && <p className="m-0 rounded-lg bg-eu-amber/10 px-3 py-2"><Lock className="inline size-4 text-eu-amber" aria-hidden /> {can.reason}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-full border-2 border-eu-line px-4 font-extrabold text-eu-ink-3">Άκυρο</button>
              <button type="button" onClick={confirmMove} disabled={!can.erp || busy} className="min-h-11 rounded-full bg-eu-navy text-white px-4 font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoveRight className="size-4" aria-hidden />} Μετακίνηση</button>
            </div>
          </div>
        )}
      </Dialog>
      {busy && <p role="status" className="fixed bottom-4 right-4 z-[60] m-0 rounded-full bg-eu-navy text-white px-4 py-2 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-2 shadow-[var(--shadow-raised)]"><Loader2 className="size-4 animate-spin" aria-hidden /> Επικοινωνία με το SoftOne…</p>}
    </div>
  );
}

function Row({ n, depth, isOpen, toggle, visible, can, busy, dragging, over, tree, onSave, onAdd, onMove }: {
  n: CatNode; depth: number; isOpen: (k: string) => boolean; toggle: (k: string) => void; visible: Set<string> | null; can: Can; busy: boolean; dragging: CatNode | null; over: string | null; tree: CatNode[];
  onSave: (key: string, patch: { name?: string; active?: boolean }) => void; onAdd: (key: string, name: string) => void; onMove: (node: string, parent: string) => void;
}) {
  const { setNodeRef: dragRef, listeners, attributes, isDragging } = useDraggable({ id: n.key });
  const { setNodeRef: dropRef } = useDroppable({ id: n.key });
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(n.name);
  const openNow = isOpen(n.key);
  const kids = n.children.filter((c) => !visible || visible.has(c.key));
  const targets = n.level === 2 ? tree.filter((m) => m.key !== n.key.split(":").slice(0, 2).join(":")) : n.level === 3 ? tree.flatMap((m) => m.children.map((c) => ({ ...c, name: `${m.name} › ${c.name}` }))).filter((c) => !c.children.some((g) => g.key === n.key)) : [];
  const ring = over === n.key && dragging && dragging.key !== n.key ? "ring-2 ring-eu-blue" : "";
  return (
    <li role="treeitem" aria-selected={false} aria-expanded={n.level < 3 ? openNow : undefined} aria-level={n.level} className="grid gap-1.5" style={{ paddingLeft: depth ? `${Math.min(depth, 2) * 1.25}rem` : undefined }}>
      <div ref={dropRef} className={`rounded-xl border bg-white px-2 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 ${n.s1Active && !n.missing ? "border-eu-line" : "border-dashed border-eu-line bg-eu-surface"} ${isDragging ? "opacity-40" : ""} ${ring}`}>
        <button type="button" ref={dragRef} {...listeners} {...attributes} aria-label={`Μετακίνηση: ${n.name}`} className="size-11 -my-1 grid place-items-center rounded-lg text-eu-muted hover:text-eu-navy hover:bg-eu-chip touch-none cursor-grab"><GripVertical className="size-4" aria-hidden /></button>
        {n.level < 3 ? (
          <button type="button" onClick={() => toggle(n.key)} aria-label={openNow ? "Κλείσιμο" : "Άνοιγμα"} className="size-9 grid place-items-center rounded-lg hover:bg-eu-chip"><ChevronRight className={`size-4 transition-transform ${openNow ? "rotate-90" : ""}`} aria-hidden /></button>
        ) : <span className="size-9" aria-hidden />}
        <div className="flex-1 min-w-[10rem] grid">
          {edit ? (
            <form className="flex flex-wrap gap-1.5" onSubmit={(e) => { e.preventDefault(); setEdit(false); if (name.trim() && name.trim() !== n.name) onSave(n.key, { name }); }}>
              <input autoFocus value={name} maxLength={n.level === 3 ? 100 : 64} onChange={(e) => setName(e.target.value)} aria-label="Νέο όνομα" className="flex-1 min-w-[10rem] min-h-11 rounded-lg border border-eu-line px-3 text-[length:var(--fs-14)]" />
              <button type="submit" className="min-h-11 rounded-full bg-eu-navy text-white px-3 font-extrabold text-[length:var(--fs-13)]">Αποθήκευση</button>
              <button type="button" onClick={() => { setEdit(false); setName(n.name); }} className="min-h-11 rounded-full border border-eu-line px-3 font-bold text-[length:var(--fs-13)]">Άκυρο</button>
            </form>
          ) : (
            <>
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{n.name}</span>
              <span className="text-eu-muted text-[length:var(--fs-12)] inline-flex flex-wrap gap-x-2">
                <span>{LEVEL[n.level]}</span>
                <span title="Είδη του SoftOne σε αυτή τη θέση">{n.items.toLocaleString("el-GR")} είδη</span>
                {n.shop ? <span title="Ενεργά προϊόντα στο κατάστημα">{n.shop.products.toLocaleString("el-GR")} στο κατάστημα</span> : <span>όχι ακόμη στο κατάστημα</span>}
                {!n.s1Active && <span className="text-eu-amber font-bold inline-flex items-center gap-1"><EyeOff className="size-3" aria-hidden /> ανενεργή στο SoftOne</span>}
                {n.missing && <span className="text-eu-red font-bold">λείπει από το SoftOne</span>}
              </span>
            </>
          )}
        </div>
        {!edit && (
          <div data-help="cats.row-actions" className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => setEdit(true)} disabled={!can.erp || busy} title={can.reason ?? "Μετονομασία (και στο SoftOne)"} aria-label={`Μετονομασία: ${n.name}`} className="size-11 grid place-items-center rounded-lg text-eu-navy hover:bg-eu-chip disabled:opacity-40"><Pencil className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => onSave(n.key, { active: !n.s1Active })} disabled={!can.erp || busy} title={can.reason ?? (n.s1Active ? "Απενεργοποίηση στο SoftOne" : "Ενεργοποίηση στο SoftOne")} className="min-h-11 rounded-lg px-2 font-bold text-[length:var(--fs-13)] text-eu-ink-3 hover:bg-eu-chip disabled:opacity-40">{n.s1Active ? "Απενεργοποίηση" : "Ενεργοποίηση"}</button>
            {targets.length > 0 && (
              <label className="relative">
                <span className="sr-only">Μετακίνηση σε</span>
                <select value="" onChange={(e) => e.target.value && onMove(n.key, e.target.value)} disabled={busy} className="min-h-11 max-w-[12rem] rounded-lg border border-eu-line bg-white px-2 text-[length:var(--fs-13)]">
                  <option value="">Μετακίνηση σε…</option>
                  {targets.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </label>
            )}
            {n.shop?.active && <a href={n.shop.href} target="_blank" rel="noreferrer" aria-label={`Στο κατάστημα: ${n.name}`} className="size-11 grid place-items-center rounded-lg text-eu-muted hover:text-eu-navy hover:bg-eu-chip"><ExternalLink className="size-4" aria-hidden /></a>}
          </div>
        )}
      </div>
      {n.level < 3 && openNow && (
        <ul role="group" className="m-0 p-0 list-none grid gap-1.5">
          {kids.map((c) => <Row key={c.key} n={c} depth={depth + 1} isOpen={isOpen} toggle={toggle} visible={visible} can={can} busy={busy} dragging={dragging} over={over} tree={tree} onSave={onSave} onAdd={onAdd} onMove={onMove} />)}
          <li style={{ paddingLeft: "1.25rem" }}><AddInline label={`${CHILD[n.level as 1 | 2]} στο «${n.name}»`} small disabled={!can.erp} title={can.reason ?? undefined} onAdd={(name) => onAdd(n.key, name)} /></li>
        </ul>
      )}
    </li>
  );
}

function AddInline({ label, onAdd, disabled, title, small }: { label: string; onAdd: (name: string) => void; disabled?: boolean; title?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open) return <button type="button" onClick={() => setOpen(true)} disabled={disabled} title={title} className={`min-h-11 rounded-full inline-flex items-center gap-1.5 font-extrabold text-[length:var(--fs-13)] disabled:opacity-40 ${small ? "px-3 text-eu-blue hover:bg-eu-chip" : "px-4 border-2 border-eu-navy text-eu-navy hover:bg-eu-chip"}`}><Plus className="size-4" aria-hidden /> {label}</button>;
  return (
    <form data-help="cats.add" className="flex flex-wrap gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!v.trim()) return; onAdd(v); setV(""); setOpen(false); }}>
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={64} placeholder="Όνομα" aria-label={label} className="min-w-[12rem] flex-1 min-h-11 rounded-lg border border-eu-line px-3 text-[length:var(--fs-14)]" />
      <button type="submit" className="min-h-11 rounded-full bg-eu-navy text-white px-3 font-extrabold text-[length:var(--fs-13)]">Δημιουργία στο SoftOne</button>
      <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full border border-eu-line px-3 font-bold text-[length:var(--fs-13)]">Άκυρο</button>
    </form>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  queued: { label: "σε αναμονή", cls: "text-eu-blue" },
  running: { label: "σε εξέλιξη", cls: "text-eu-blue" },
  done: { label: "ολοκληρώθηκε", cls: "text-eu-green" },
  failed: { label: "σταμάτησε", cls: "text-eu-red" },
};

function OpsPanel({ ops, canErp, onChange }: { ops: Op[]; canErp: boolean; onChange: (r: { ok: boolean; message?: string; error?: string }) => void }) {
  const [busy, start] = useTransition();
  const [now] = useState(() => Date.now());
  const shown = ops.filter((o) => o.status !== "done" || now - new Date(o.finishedAt ?? o.createdAt).getTime() < 24 * 3600_000).slice(0, 4);
  if (!shown.length) return null;
  const control = (id: string, what: "retry" | "cancel" | "resume") => start(async () => { const r = await opControlAction(id, what); onChange(r.ok ? { ok: true, message: what === "cancel" ? "Η μετακίνηση ακυρώθηκε." : "Η μετακίνηση συνεχίζει." } : { ok: false, error: r.error }); });
  return (
    <section data-help="cats.ops" aria-label="Μετακινήσεις σε εξέλιξη" className="grid gap-2">
      {shown.map((o) => {
        const pct = o.total ? Math.round((o.cursor / o.total) * 100) : o.status === "done" ? 100 : 0;
        return (
          <article key={o.id} className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)] inline-flex items-center gap-2"><FolderTree className="size-4 text-eu-blue" aria-hidden /> {o.title}</h3>
              <span className={`font-bold text-[length:var(--fs-13)] inline-flex items-center gap-1 ${STATUS[o.status]?.cls}`}>{(o.status === "running" || o.status === "queued") && <Loader2 className="size-3.5 animate-spin" aria-hidden />}{STATUS[o.status]?.label ?? o.status}</span>
            </div>
            <div className="h-2 rounded-full bg-eu-surface overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος"><div className={`h-full ${o.status === "failed" ? "bg-eu-red" : "bg-eu-blue"}`} style={{ width: `${pct}%` }} /></div>
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{o.cursor.toLocaleString("el-GR")} από {o.total.toLocaleString("el-GR")} είδη · {o.okCount.toLocaleString("el-GR")} ενημερώθηκαν{o.failCount ? ` · ${o.failCount} απέτυχαν` : ""}</p>
            {o.error && <p role="alert" className="m-0 rounded-lg bg-eu-red/10 px-3 py-2 text-[length:var(--fs-13)] text-eu-ink"><b>Γιατί σταμάτησε: </b>{o.error}</p>}
            {o.failures.length > 0 && (
              <details className="text-[length:var(--fs-13)]"><summary className="cursor-pointer font-bold text-eu-red">Είδη που απέτυχαν ({o.failCount})</summary>
                <ul className="m-0 mt-1 pl-5 grid gap-0.5">{o.failures.map((f) => <li key={f.mtrl}><span className="font-mono">{f.code ?? f.mtrl}</span>: {f.error}</li>)}</ul>
              </details>
            )}
            <details className="text-[length:var(--fs-13)]"><summary className="cursor-pointer font-bold text-eu-ink-3">Ιστορικό βημάτων</summary>
              <ol className="m-0 mt-1 pl-5 grid gap-0.5">{o.log.map((l, i) => <li key={i} className={l.ok ? "text-eu-ink" : "text-eu-red"}>{new Date(l.at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })} — {l.text}</li>)}</ol>
            </details>
            {canErp && o.status !== "done" && (
              <div className="flex flex-wrap gap-2">
                {o.status === "failed" && <button type="button" disabled={busy} onClick={() => control(o.id, "retry")} className="min-h-11 rounded-full bg-eu-navy text-white px-3 font-extrabold text-[length:var(--fs-13)] inline-flex items-center gap-1.5 disabled:opacity-50"><RotateCcw className="size-4" aria-hidden /> {o.failCount ? "Επανάληψη αποτυχημένων" : "Συνέχεια"}</button>}
                {o.status === "running" || o.status === "queued" ? <button type="button" disabled={busy} onClick={() => control(o.id, "resume")} className="min-h-11 rounded-full border-2 border-eu-navy text-eu-navy px-3 font-extrabold text-[length:var(--fs-13)] inline-flex items-center gap-1.5 disabled:opacity-50"><Play className="size-4" aria-hidden /> Συνέχεια τώρα</button> : null}
                {o.status !== "failed" && <button type="button" disabled={busy} onClick={() => control(o.id, "cancel")} className="min-h-11 rounded-full border border-eu-line px-3 font-bold text-eu-ink-3 text-[length:var(--fs-13)] inline-flex items-center gap-1.5 hover:border-eu-red hover:text-eu-red disabled:opacity-50"><Square className="size-3.5" aria-hidden /> Ακύρωση</button>}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
