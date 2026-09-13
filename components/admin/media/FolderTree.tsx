"use client";

import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, FolderPlus, Images, Pencil, Trash2 } from "lucide-react";
import type { MediaFolderDTO } from "@/lib/media/types";

export function FolderTree({ folders, current, total, canWrite, onSelect, onCreate, onRename, onDelete, onDropAssets }: {
  folders: MediaFolderDTO[];
  current: string | null | undefined; // undefined = all
  total: number;
  canWrite: boolean;
  onSelect: (id: string | null | undefined) => void;
  onCreate: (parentId: string | null) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDropAssets: (folderId: string | null, ids: string[]) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const children = (pid: string | null) => folders.filter((f) => f.parentId === pid);
  const rootCount = total - folders.reduce((n, f) => n + f.count, 0);
  const drop = (folderId: string | null) => (e: React.DragEvent) => {
    const ids = e.dataTransfer.getData("application/x-eu-assets");
    if (!ids) return;
    e.preventDefault();
    onDropAssets(folderId, JSON.parse(ids));
  };
  const allow = (e: React.DragEvent) => e.dataTransfer.types.includes("application/x-eu-assets") && e.preventDefault();

  const Row = ({ f, depth }: { f: MediaFolderDTO; depth: number }) => {
    const kids = children(f.id);
    const isOpen = open[f.id] ?? depth < 1;
    const active = current === f.id;
    return (
      <li>
        <div
          onDragOver={allow}
          onDrop={drop(f.id)}
          className={`group flex items-center gap-1 rounded-lg pr-1 min-h-10 ${active ? "bg-eu-navy text-white" : "hover:bg-eu-surface text-eu-ink"}`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          <button type="button" onClick={() => setOpen((o) => ({ ...o, [f.id]: !isOpen }))} aria-label={isOpen ? "Σύμπτυξη" : "Ανάπτυξη"} className={`size-7 inline-flex items-center justify-center rounded-md ${kids.length ? "" : "invisible"}`}>
            <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden />
          </button>
          <button type="button" onClick={() => onSelect(f.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left font-semibold text-[length:var(--fs-14)] min-h-10">
            {active ? <FolderOpen className="size-4 shrink-0" aria-hidden /> : <Folder className="size-4 shrink-0 text-eu-blue" aria-hidden />}
            <span className="truncate">{f.name}</span>
            <span className={`ml-auto text-[length:var(--fs-13)] tabular-nums ${active ? "text-white/70" : "text-eu-muted"}`}>{f.count}</span>
          </button>
          {canWrite && (
            <span className="hidden group-hover:flex items-center">
              <button type="button" onClick={() => onCreate(f.id)} aria-label="Νέος υποφάκελος" className="size-8 inline-flex items-center justify-center rounded-md hover:bg-white/20"><FolderPlus className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => onRename(f.id)} aria-label="Μετονομασία" className="size-8 inline-flex items-center justify-center rounded-md hover:bg-white/20"><Pencil className="size-3.5" aria-hidden /></button>
              <button type="button" onClick={() => onDelete(f.id)} aria-label="Διαγραφή φακέλου" className="size-8 inline-flex items-center justify-center rounded-md hover:bg-eu-red/20"><Trash2 className="size-3.5" aria-hidden /></button>
            </span>
          )}
        </div>
        {isOpen && kids.length > 0 && <ul className="m-0 p-0 list-none">{kids.map((k) => <Row key={k.id} f={k} depth={depth + 1} />)}</ul>}
      </li>
    );
  };

  return (
    <nav aria-label="Φάκελοι" className="grid gap-1">
      <button type="button" onClick={() => onSelect(undefined)} onDragOver={allow} onDrop={drop(null)} className={`flex items-center gap-2 rounded-lg px-2 min-h-10 font-bold text-[length:var(--fs-14)] ${current === undefined ? "bg-eu-navy text-white" : "hover:bg-eu-surface text-eu-ink"}`}>
        <Images className="size-4" aria-hidden /> Όλα τα media <span className={`ml-auto tabular-nums text-[length:var(--fs-13)] ${current === undefined ? "text-white/70" : "text-eu-muted"}`}>{total}</span>
      </button>
      <button type="button" onClick={() => onSelect(null)} onDragOver={allow} onDrop={drop(null)} className={`flex items-center gap-2 rounded-lg px-2 min-h-10 font-semibold text-[length:var(--fs-14)] ${current === null ? "bg-eu-navy text-white" : "hover:bg-eu-surface text-eu-ink"}`}>
        <Folder className="size-4 text-eu-muted" aria-hidden /> Χωρίς φάκελο <span className={`ml-auto tabular-nums text-[length:var(--fs-13)] ${current === null ? "text-white/70" : "text-eu-muted"}`}>{Math.max(0, rootCount)}</span>
      </button>
      <ul className="m-0 p-0 list-none">{children(null).map((f) => <Row key={f.id} f={f} depth={0} />)}</ul>
      {canWrite && (
        <button type="button" onClick={() => onCreate(null)} className="mt-1 inline-flex items-center gap-2 rounded-full border-2 border-dashed border-eu-line px-3 min-h-10 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue">
          <FolderPlus className="size-4" aria-hidden /> Νέος φάκελος
        </button>
      )}
    </nav>
  );
}
