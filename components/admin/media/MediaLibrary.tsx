"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CloudUpload, Search, LayoutGrid, List, FolderInput, Tag, Trash2, X, Check, AlertTriangle, PanelLeft, ZoomIn, ZoomOut } from "lucide-react";
import { PagerButtons } from "@/components/admin/PagerButtons";
import type { MediaAssetDTO, MediaFolderDTO, MediaKind } from "@/lib/media/types";
import { listMedia, listFolders, createFolder, renameFolder, deleteFolder, moveAssets, tagAssets, deleteAssets, migrateToCdn, type ListQuery } from "@/app/admin/(shell)/media/actions";
import { useUploader } from "./useUploader";
import { FolderTree } from "./FolderTree";
import { AssetCard } from "./AssetCard";
import { AssetDrawer } from "./AssetDrawer";
import { ImageEditor } from "./ImageEditor";
import { fmtBytes } from "./format";

/**
 * @dynamic Media library — the one component behind /admin/media and every
 * «choose image / video / file» field of the CMS.
 *
 * Props contract
 *  mode        "manage" (full page) | "picker" (dialog; confirm returns the selection)
 *  accept      kinds allowed in the picker (default all)
 *  multiple    multi-selection in picker mode
 *  canWrite    upload / edit / delete (from cms.media.write)
 *  initialFolderId  open on a folder
 *  onSelect    picker callback with the chosen assets
 *  onClose     picker close
 */
export interface MediaLibraryProps {
  mode?: "manage" | "picker";
  accept?: MediaKind[];
  multiple?: boolean;
  canWrite: boolean;
  initialFolderId?: string | null;
  onSelect?: (assets: MediaAssetDTO[]) => void;
  onClose?: () => void;
}

export function MediaLibrary({ mode = "manage", accept, multiple = true, canWrite, initialFolderId, onSelect, onClose }: MediaLibraryProps) {
  const [folders, setFolders] = useState<MediaFolderDTO[]>([]);
  const [folderId, setFolderId] = useState<string | null | undefined>(initialFolderId);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<MediaKind | "all">(accept?.length === 1 ? accept[0] : "all");
  const [sort, setSort] = useState<ListQuery["sort"]>("newest");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  // Tile size of the grid (min column width in px): the slider shows more or fewer cards per row; remembered per browser.
  const [tile, setTile] = useState(180);
  useEffect(() => { try { const v = Number(localStorage.getItem("eu-media-tile")); if (v >= 100 && v <= 360) setTimeout(() => setTile(v), 0); } catch {} }, []);
  const changeTile = (v: number) => { const n = Math.min(360, Math.max(100, v)); setTile(n); try { localStorage.setItem("eu-media-tile", String(n)); } catch {} };
  const [data, setData] = useState<{ items: MediaAssetDTO[]; total: number; pages: number; notice: string | null; local: number }>({ items: [], total: 0, pages: 1, notice: null, local: 0 });
  const [migrating, setMigrating] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<MediaAssetDTO | null>(null);
  const [editing, setEditing] = useState<MediaAssetDTO | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [frame, setFrame] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [totalAll, setTotalAll] = useState(0);
  const refreshFolders = useCallback(() => Promise.all([listFolders(), listMedia({ page: 1 })]).then(([f, all]) => { setFolders(f); setTotalAll(all.total); }), []);
  const refresh = useCallback(() => {
    startLoad(async () => {
      const r = await listMedia({ folderId, q: q || undefined, kind, sort, page });
      setData({ items: r.items, total: r.total, pages: r.pages, notice: r.notice, local: r.local ?? 0 });
    });
  }, [folderId, q, kind, sort, page]);
  useEffect(() => { refreshFolders(); }, [refreshFolders]);
  useEffect(() => { const t = setTimeout(refresh, q ? 250 : 0); return () => clearTimeout(t); }, [refresh, q]);
  const resetView = () => { setPage(1); setSelected(new Set()); };
  const changeFolder = (id: string | null | undefined) => { setFolderId(id); resetView(); };
  const changeQ = (v: string) => { setQ(v); resetView(); };
  const changeKind = (k: MediaKind | "all") => { setKind(k); resetView(); };
  const changeSort = (v: ListQuery["sort"]) => { setSort(v); resetView(); };

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const uploader = useUploader(
    useCallback((asset: MediaAssetDTO) => {
      setData((d) => (d.items.some((i) => i.id === asset.id) ? { ...d, items: d.items.map((i) => (i.id === asset.id ? asset : i)) } : { ...d, items: [asset, ...d.items], total: d.total + 1 }));
      refreshFolders();
    }, [refreshFolders]),
  );
  const uploadFiles = (files: FileList | File[]) => canWrite && uploader.add(files, { folderId: folderId ?? "", frame: frame ? "1" : "" });

  // folder ops
  const onCreate = async (parentId: string | null) => { const name = prompt("Όνομα φακέλου"); if (!name) return; const r = await createFolder(name, parentId); if (!r.ok) alert(r.error); await refreshFolders(); if (r.ok) changeFolder(r.id); };
  const onRename = async (id: string) => { const f = folders.find((x) => x.id === id); const name = prompt("Νέο όνομα", f?.name); if (!name) return; await renameFolder(id, name); refreshFolders(); };
  const onDeleteFolder = async (id: string) => { if (!confirm("Διαγραφή φακέλου;")) return; const r = await deleteFolder(id); if (!r.ok) alert(r.error); else { if (folderId === id) changeFolder(undefined); refreshFolders(); } };
  const onDropAssets = async (target: string | null, ids: string[]) => { await moveAssets(ids, target); notify(`${ids.length} αρχεία μεταφέρθηκαν`); setSelected(new Set()); refresh(); refreshFolders(); };

  // bulk
  const ids = useMemo(() => [...selected], [selected]);
  const bulkMove = async () => { const opts = folders.map((f) => `${f.id}: ${f.name}`).join("\n"); const v = prompt(`Μεταφορά ${ids.length} αρχείων σε φάκελο (id) — κενό = χωρίς φάκελο\n${opts}`); if (v === null) return; await onDropAssets(v.trim() || null, ids); };
  const bulkTag = async () => { const v = prompt("Tags προς προσθήκη (με κόμμα, πρόθεμα - για αφαίρεση)"); if (!v) return; const parts = v.split(",").map((t) => t.trim()).filter(Boolean); await tagAssets(ids, parts.filter((t) => !t.startsWith("-")), parts.filter((t) => t.startsWith("-")).map((t) => t.slice(1))); notify("Τα tags ενημερώθηκαν"); refresh(); };
  const bulkDelete = async () => { if (!confirm(`Διαγραφή ${ids.length} αρχείων; Δεν αναιρείται.`)) return; await deleteAssets(ids); notify(`${ids.length} αρχεία διαγράφηκαν`); setSelected(new Set()); if (open && selected.has(open.id)) setOpen(null); refresh(); refreshFolders(); };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(mode === "picker" && !multiple ? [] : s); if (s.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = (a: MediaAssetDTO) => !accept || accept.includes(a.kind);
  const openAsset = (a: MediaAssetDTO) => { if (mode === "picker") toggle(a.id); else setOpen(a); };
  const replaceAsset = (a: MediaAssetDTO, file: File) => uploader.add([file], { replaceId: a.id });
  const patchItem = (a: MediaAssetDTO) => { setData((d) => ({ ...d, items: d.items.map((i) => (i.id === a.id ? a : i)) })); setOpen((o) => (o?.id === a.id ? a : o)); };
  const onSaved = (a: MediaAssetDTO, replaced: boolean) => { setEditing(null); if (replaced) patchItem(a); else { setData((d) => ({ ...d, items: [a, ...d.items], total: d.total + 1 })); setOpen(a); } notify(replaced ? "Το αρχικό αντικαταστάθηκε" : "Νέα εικόνα αποθηκεύτηκε"); refreshFolders(); };

  const chip = (active: boolean) => `rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] transition-colors ${active ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  const uploadsActive = uploader.items.filter((u) => u.status !== "done");

  return (
    <div className={`eu-container ${mode === "picker" ? "h-full min-h-0" : ""}`}>
    <div
      className={`relative grid ${mode === "picker" ? "h-full" : "min-h-[70dvh]"} grid-cols-1 @3xl:grid-cols-[240px_minmax(0,1fr)] ${open ? "@5xl:grid-cols-[240px_minmax(0,1fr)_360px]" : ""} rounded-2xl bg-eu-surface border border-eu-line overflow-hidden`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); } }}
    >
      {/* folders */}
      <div className={`${sidebar ? "block" : "hidden"} @3xl:block bg-white border-r border-eu-line p-3 overflow-y-auto`}>
        <FolderTree folders={folders} current={folderId} total={totalAll} canWrite={canWrite} onSelect={(id) => { changeFolder(id); setSidebar(false); }} onCreate={onCreate} onRename={onRename} onDelete={onDeleteFolder} onDropAssets={onDropAssets} />
      </div>

      {/* main */}
      <div className="min-w-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 p-3 bg-white border-b border-eu-line">
          <button type="button" onClick={() => setSidebar((s) => !s)} className="@3xl:hidden size-10 rounded-full border border-eu-line inline-flex items-center justify-center" aria-label="Φάκελοι"><PanelLeft className="size-4" aria-hidden /></button>
          <label className="relative basis-full @2xl:basis-auto @2xl:flex-1 min-w-[160px] order-first @2xl:order-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
            <input value={q} onChange={(e) => changeQ(e.target.value)} placeholder="Αναζήτηση αρχείων, tags…" className="w-full rounded-full border-2 border-eu-line pl-9 pr-3 min-h-10 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
          </label>
          <div className="flex gap-1" role="group" aria-label="Τύπος">
            {(["all", "image", "video", "file"] as const).filter((k) => k === "all" ? !accept || accept.length > 1 : !accept || accept.includes(k)).map((k) => (
              <button key={k} type="button" onClick={() => changeKind(k)} className={chip(kind === k)}>{{ all: "Όλα", image: "Εικόνες", video: "Video", file: "Αρχεία" }[k]}</button>
            ))}
          </div>
          <select value={sort} onChange={(e) => changeSort(e.target.value as ListQuery["sort"])} aria-label="Ταξινόμηση" className="rounded-full border border-eu-line px-3 min-h-10 text-[length:var(--fs-13)] font-bold bg-white">
            <option value="newest">Νεότερα</option><option value="oldest">Παλαιότερα</option><option value="name">Όνομα</option><option value="size">Μέγεθος</option>
          </select>
          {view === "grid" && (
            <div className="hidden @lg:flex items-center gap-1 rounded-full border border-eu-line px-2 min-h-10" title="Μέγεθος καρτών">
              <button type="button" onClick={() => changeTile(tile - 40)} aria-label="Μικρότερες κάρτες" className="size-7 inline-flex items-center justify-center rounded-full hover:bg-eu-surface"><ZoomOut className="size-4" aria-hidden /></button>
              <input type="range" min={100} max={360} step={20} value={tile} onChange={(e) => changeTile(Number(e.target.value))} aria-label="Μέγεθος καρτών" className="w-24 accent-eu-navy" />
              <button type="button" onClick={() => changeTile(tile + 40)} aria-label="Μεγαλύτερες κάρτες" className="size-7 inline-flex items-center justify-center rounded-full hover:bg-eu-surface"><ZoomIn className="size-4" aria-hidden /></button>
            </div>
          )}
          <div className="flex rounded-full border border-eu-line overflow-hidden" role="group" aria-label="Προβολή">
            <button type="button" onClick={() => setView("grid")} aria-pressed={view === "grid"} className={`size-10 inline-flex items-center justify-center ${view === "grid" ? "bg-eu-navy text-white" : ""}`}><LayoutGrid className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => setView("list")} aria-pressed={view === "list"} className={`size-10 inline-flex items-center justify-center ${view === "list" ? "bg-eu-navy text-white" : ""}`}><List className="size-4" aria-hidden /></button>
          </div>
          {canWrite && (
            <>
              <input ref={fileInput} type="file" multiple className="sr-only" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
              <label className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-13)] cursor-pointer has-checked:border-eu-navy has-checked:bg-eu-navy/5" title="Εικόνες: WebP, μέγιστη πλευρά 1920px, 30px περιθώριο γύρω από το προϊόν">
                <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} className="size-4 accent-eu-navy" /> <span className="hidden @lg:inline">Πλαίσιο 1920 / 30px</span><span className="@lg:hidden">1920/30</span>
              </label>
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-blue"><CloudUpload className="size-4" aria-hidden /> Upload</button>
            </>
          )}
        </div>

        {data.notice && canWrite && <div className="flex items-center gap-2 px-3 py-2 bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-13)]"><AlertTriangle className="size-4 shrink-0" aria-hidden /> {data.notice}</div>}
        {!data.notice && data.local > 0 && canWrite && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-eu-chip text-eu-navy font-bold text-[length:var(--fs-13)]">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {data.local} αρχεία (media και ήχος) είναι ακόμη αποθηκευμένα τοπικά από πριν ενεργοποιηθεί το Bunny CDN.
            <button type="button" disabled={migrating === "…"} onClick={async () => { setMigrating("…"); const r = await migrateToCdn(); setMigrating(r.message); refresh(); }} className="rounded-full bg-eu-navy text-white px-3 min-h-8 font-extrabold hover:bg-eu-blue disabled:opacity-60">{migrating === "…" ? "Μεταφορά…" : "Μεταφορά στο CDN"}</button>
            {migrating && migrating !== "…" && <span className="font-semibold">{migrating}</span>}
          </div>
        )}

        {uploadsActive.length > 0 && (
          <ul className="m-0 p-3 list-none grid gap-1.5 bg-white border-b border-eu-line max-h-40 overflow-y-auto">
            {uploadsActive.map((u) => (
              <li key={u.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center text-[length:var(--fs-13)]">
                <div className="min-w-0"><div className="truncate font-bold">{u.file.name} <span className="text-eu-muted font-normal">{fmtBytes(u.file.size)}</span></div>
                  <div className="h-1.5 rounded-full bg-eu-surface-3 overflow-hidden"><div className={`h-full ${u.status === "error" ? "bg-eu-red" : "bg-eu-blue"} transition-[width]`} style={{ width: `${u.status === "error" ? 100 : u.progress * 100}%` }} /></div></div>
                <span className={u.status === "error" ? "text-eu-red font-bold" : "text-eu-muted"}>{u.status === "error" ? u.error : u.status === "uploading" ? (u.progress < 1 ? `${Math.round(u.progress * 100)}%` : "επεξεργασία…") : "αναμονή"}</span>
              </li>
            ))}
          </ul>
        )}

        {selected.size > 0 && mode === "manage" && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-eu-navy text-white text-[length:var(--fs-14)]">
            <span className="font-bold">{selected.size} επιλεγμένα</span>
            <button type="button" onClick={bulkMove} className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 min-h-9 font-bold"><FolderInput className="size-4" aria-hidden /> Μεταφορά</button>
            <button type="button" onClick={bulkTag} className="inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 min-h-9 font-bold"><Tag className="size-4" aria-hidden /> Tags</button>
            <button type="button" onClick={bulkDelete} className="inline-flex items-center gap-1 rounded-full bg-eu-red/80 hover:bg-eu-red px-3 min-h-9 font-bold"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 min-h-9 font-bold hover:bg-white/15"><X className="size-4" aria-hidden /> Καθαρισμός</button>
          </div>
        )}

        <div className={`flex-1 p-3 ${loading ? "opacity-60" : ""} transition-opacity`}>
          {data.items.length === 0 ? (
            <div className="h-full grid place-items-center text-center p-8">
              <div>
                <CloudUpload className="size-12 text-eu-line-3 mx-auto" aria-hidden />
                <p className="m-0 mt-2 font-bold text-eu-ink text-[length:var(--fs-16)]">{q ? "Τίποτα δεν ταιριάζει" : "Δεν υπάρχουν αρχεία εδώ"}</p>
                {canWrite && <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)]">Σύρε αρχεία εδώ ή πάτα «Upload». Εικόνες, video (MP4/WebM), PDF και άλλα.</p>}
              </div>
            </div>
          ) : view === "grid" ? (
            <ul className="m-0 p-0 list-none grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tile}px, 100%), 1fr))` }}>
              {data.items.map((a) => (
                <li key={a.id} className={selectable(a) ? "" : "opacity-40 pointer-events-none"}>
                  <AssetCard a={a} selected={selected.has(a.id)} onToggle={() => toggle(a.id)} onOpen={() => openAsset(a)} draggableIds={selected.has(a.id) ? ids : []} />
                </li>
              ))}
            </ul>
          ) : (
            <table className="w-full border-collapse text-[length:var(--fs-14)] bg-white rounded-xl overflow-hidden">
              <thead><tr className="text-left text-eu-muted"><th className="p-2 w-11" /><th className="p-2 font-bold">Αρχείο</th><th className="p-2 font-bold">Τύπος</th><th className="p-2 font-bold">Διαστάσεις</th><th className="p-2 font-bold">Μέγεθος</th><th className="p-2 font-bold">Tags</th><th className="p-2 font-bold">Ημερομηνία</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className={`border-t border-eu-line-2 hover:bg-eu-surface/60 cursor-pointer ${selected.has(a.id) ? "bg-eu-navy/5" : ""}`} onClick={() => openAsset(a)}>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="size-5 accent-eu-navy" aria-label={`Επιλογή ${a.filename}`} /></td>
                    <td className="p-2"><div className="flex items-center gap-2 min-w-0"><Thumb src={a.thumbUrl} /><span className="truncate font-bold">{a.title ?? a.filename}</span></div></td>
                    <td className="p-2 text-eu-ink-2">{a.mime}</td><td className="p-2 tabular-nums">{a.width ? `${a.width}×${a.height}` : "—"}</td><td className="p-2 tabular-nums">{fmtBytes(a.size)}</td>
                    <td className="p-2"><div className="flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="rounded-full bg-eu-surface px-2 text-[length:var(--fs-13)]">{t}</span>)}</div></td>
                    <td className="p-2 tabular-nums text-eu-ink-2">{new Date(a.createdAt).toLocaleDateString("el-GR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white border-t border-eu-line text-[length:var(--fs-13)] text-eu-muted">
          <span>{data.total} αρχεία{selected.size ? ` · ${selected.size} επιλεγμένα` : ""}</span>
          <PagerButtons page={page} pages={data.pages} onPage={(n) => { setPage(n); setSelected(new Set()); }} />
          {mode === "picker" && (
            <span className="inline-flex gap-2">
              <button type="button" onClick={onClose} className="rounded-full border-2 border-eu-line px-4 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)]">Άκυρο</button>
              <button type="button" disabled={!selected.size} onClick={() => onSelect?.(data.items.filter((a) => selected.has(a.id)))} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-10 font-extrabold text-[length:var(--fs-14)] disabled:opacity-50"><Check className="size-4" aria-hidden /> Επιλογή{selected.size > 1 ? ` (${selected.size})` : ""}</button>
            </span>
          )}
        </div>
      </div>

      {open && mode === "manage" && (
        <div className="@5xl:static fixed inset-y-0 right-0 z-[60] w-full max-w-[420px] @5xl:max-w-none @5xl:w-auto shadow-[var(--shadow-overlay)] @5xl:shadow-none">
          <AssetDrawer key={open.id} a={open} folders={folders} canWrite={canWrite} onClose={() => setOpen(null)} onChange={patchItem} onDelete={async (id) => { await deleteAssets([id]); setOpen(null); refresh(); refreshFolders(); notify("Διαγράφηκε"); }} onEdit={setEditing} onReplace={replaceAsset} onCreated={(a) => { setData((d) => ({ ...d, items: [a, ...d.items], total: d.total + 1 })); setOpen(a); }} />
        </div>
      )}
      {editing && <ImageEditor asset={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}

      {dragOver && canWrite && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-eu-navy/80 text-white pointer-events-none">
          <div className="rounded-3xl border-4 border-dashed border-eu-yellow p-10 text-center"><CloudUpload className="size-14 mx-auto text-eu-yellow" aria-hidden /><p className="m-0 mt-2 font-heading font-bold text-[length:var(--fs-22)]">Άφησε τα αρχεία εδώ</p><p className="m-0 text-eu-on-dark-2 text-[length:var(--fs-14)]">{folderId && folders.find((f) => f.id === folderId) ? `Στον φάκελο «${folders.find((f) => f.id === folderId)!.name}»` : "Χωρίς φάκελο"}</p></div>
        </div>
      )}
      {toast && <div role="status" aria-live="polite" className="absolute bottom-14 left-1/2 -translate-x-1/2 z-50 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-14)] px-4 py-2 shadow-[var(--shadow-overlay)]">{toast}</div>}
    </div>
    </div>
  );
}

export type { MediaAssetDTO };

function Thumb({ src }: { src: string | null }) {
  if (!src) return <span className="size-10 rounded bg-eu-surface shrink-0" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-10 rounded object-cover shrink-0" />;
}
