"use client";

import { ArrowDown, ArrowUp, CalendarClock, ChevronDown, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import type { BrandBlock } from "@/lib/cms/brand-store";
import { blockActive } from "@/lib/cms/brand-store";
import type { Issue } from "@/lib/cms/brand-store-check";
import { StatusPill } from "@/components/admin/settings/ui";
import { BLOCK_GROUPS, BLOCK_INFO, BlockFields, newBlock } from "./brand/BlockEditors";
import { DateTime } from "./brand/fields";
import type { PickProduct } from "@/app/admin/(shell)/cms/brand-stores/actions";

export type ZoneDef = { key: string; label: string; help: string };

const blockState = (b: BrandBlock): { s: "live" | "off" | "incomplete"; t: string } => {
  if (b.enabled === false) return { s: "off", t: "Κρυφή" };
  if (b.schedule?.from && new Date(b.schedule.from) > new Date()) return { s: "incomplete", t: `Από ${new Date(b.schedule.from).toLocaleDateString("el-GR")}` };
  if (!blockActive(b)) return { s: "off", t: "Έληξε" };
  return { s: "live", t: "Εμφανίζεται" };
};

/**
 * Ζώνες μιας σελίδας με τα components τους — κοινό για σελίδες μαρκών και ζώνες πληροφοριακών σελίδων.
 * Σε κάθε ζώνη: προσθήκη (ομαδοποιημένα, με εξήγηση), απόκρυψη, σειρά, αντίγραφο, διαγραφή, μετακίνηση σε άλλη ζώνη,
 * προγραμματισμός εμφάνισης. Τα errors εμφανίζονται στην κάρτα της ενότητας.
 */
export function ZoneBlocks({ blocks, setBlocks, zones, defaultZone, errors, brandName, ctx, open, setOpen, adding, setAdding, markers, allowed }: {
  blocks: BrandBlock[];
  setBlocks: (fn: (b: BrandBlock[]) => BrandBlock[]) => void;
  zones: ZoneDef[];
  defaultZone: string;
  errors: Issue[];
  brandName: string;
  ctx: { brandId: string | null; brandName: string; info: Record<string, PickProduct>; onInfo: (p: PickProduct[]) => void };
  open: Set<string>;
  setOpen: (fn: (o: Set<string>) => Set<string>) => void;
  adding: string | null;
  setAdding: (z: string | null) => void;
  markers?: Record<string, { before?: string; after?: string }>;
  allowed?: BrandBlock["type"][];
}) {
  const setBlock = (i: number, b: BrandBlock) => setBlocks((bl) => bl.map((y, k) => (k === i ? b : y)));
  const swapBlocks = (i: number, j: number) => setBlocks((bl) => { const x = [...bl]; [x[i], x[j]] = [x[j], x[i]]; return x; });
  const addBlock = (t: BrandBlock["type"], zone: string) => {
    const nb = { ...newBlock(t, brandName), zone };
    setBlocks((bl) => [...bl, nb]);
    setOpen((o) => new Set(o).add(nb.id));
    setAdding(null);
    setTimeout(() => document.getElementById(`blk-${nb.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  return (
    <>
        {zones.map((z) => {
          const inZone = blocks.map((b, i) => ({ b, i })).filter(({ b }) => (b.zone ?? defaultZone) === z.key);
          return (
            <div key={z.key} id={`zone-${z.key}`} className="grid gap-3 rounded-2xl border-2 border-dashed border-eu-line p-3 @md:p-4 scroll-mt-40">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h4 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-17)]">{z.label} <span className="text-eu-muted font-normal text-[length:var(--fs-14)]">({inZone.length})</span></h4><p className="m-0 text-eu-muted text-[length:var(--fs-13)]">{z.help}</p></div>
                <button type="button" onClick={() => setAdding(z.key)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-navy hover:text-white"><Plus className="size-4" aria-hidden /> Προσθήκη εδώ</button>
              </div>
              {markers?.[z.key]?.before && <div className="rounded-xl bg-eu-surface px-3 py-2 text-eu-muted text-[length:var(--fs-13)] font-bold">{markers[z.key]!.before}</div>}
              {inZone.length > 0 ? (
                <ol className="m-0 p-0 list-none grid gap-3">
                  {inZone.map(({ b, i }, k) => {
                    const isOpen = open.has(b.id);
                    const st = blockState(b);
                    const bErr = errors.filter((e) => e.anchor === `blk-${b.id}`).length;
                    const prev = inZone[k - 1]?.i;
                    const next = inZone[k + 1]?.i;
                    return (
                      <li key={b.id} id={`blk-${b.id}`} className={`rounded-xl border-2 bg-white scroll-mt-40 min-w-0 ${bErr ? "border-eu-red/50" : "border-eu-line"}`}>
                        <div className="flex flex-wrap items-center gap-2 p-2 pl-3">
                          <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })} aria-expanded={isOpen} className="flex items-center gap-2 min-h-11 text-left flex-1 min-w-[12rem]">
                            <span className="shrink-0 size-7 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] grid place-items-center">{k + 1}</span>
                            <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)] truncate">{BLOCK_INFO[b.type].label}{b.title ? ` · ${b.title}` : ""}</span><span className="flex flex-wrap gap-1.5 items-center"><StatusPill status={st.s} text={st.t} />{bErr > 0 && <span className="text-eu-red font-bold text-[length:var(--fs-13)]">{bErr} θέματα</span>}</span></span>
                            <ChevronDown className={`ml-auto size-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                          </button>
                          <span className="flex items-center">
                            <button type="button" onClick={() => setBlock(i, { ...b, enabled: b.enabled === false })} aria-label={b.enabled === false ? "Εμφάνιση" : "Απόκρυψη"} title={b.enabled === false ? "Εμφάνιση" : "Απόκρυψη"} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface">{b.enabled === false ? <EyeOff className="size-4 text-eu-muted" aria-hidden /> : <Eye className="size-4" aria-hidden />}</button>
                            <button type="button" disabled={prev === undefined} onClick={() => swapBlocks(i, prev!)} aria-label="Πιο πάνω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
                            <button type="button" disabled={next === undefined} onClick={() => swapBlocks(i, next!)} aria-label="Πιο κάτω" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
                            <button type="button" onClick={() => { const c = { ...structuredClone(b), id: newBlock(b.type, brandName).id }; setBlocks((bl) => [...bl.slice(0, i + 1), c, ...bl.slice(i + 1)]); setOpen((o) => new Set(o).add(c.id)); }} aria-label="Αντίγραφο" title="Αντίγραφο" className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><Copy className="size-4" aria-hidden /></button>
                            <button type="button" onClick={() => { if (window.confirm(`Διαγραφή της ενότητας «${BLOCK_INFO[b.type].label}»; (Για να μη φαίνεται χωρίς να χαθεί, πάτα το μάτι.)`)) setBlocks((bl) => bl.filter((y) => y.id !== b.id)); }} aria-label="Διαγραφή" title="Διαγραφή" className="size-11 grid place-items-center rounded-full text-eu-red hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /></button>
                          </span>
                        </div>
                        {isOpen && (
                          <div className="border-t border-eu-line p-3 @md:p-4 grid gap-4">
                            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">{BLOCK_INFO[b.type].help}</p>
                            <BlockFields b={b} set={(nb) => setBlock(i, nb)} ctx={ctx} />
                            <div className="grid @xl:grid-cols-2 gap-3">
                              <label className="grid gap-1 min-w-0">
                                <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Ζώνη</span>
                                <select value={b.zone ?? defaultZone} onChange={(e) => setBlock(i, { ...b, zone: e.target.value })} className="w-full rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] bg-white">{zones.map((zz) => <option key={zz.key} value={zz.key}>{zz.label}</option>)}</select>
                                <span className="text-eu-muted text-[length:var(--fs-13)]">Μετακίνηση σε άλλο σημείο της σελίδας.</span>
                              </label>
                            </div>
                            <details className="rounded-xl bg-eu-surface/60 border border-eu-line" open={!!(b.schedule?.from || b.schedule?.to)}>
                              <summary className="cursor-pointer list-none flex items-center gap-2 px-3 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><CalendarClock className="size-4" aria-hidden /> Πότε εμφανίζεται (προαιρετικό)</summary>
                              <div className="px-3 pb-3 grid @xl:grid-cols-2 gap-x-5 gap-y-4">
                                <DateTime label="Από" value={b.schedule?.from} onChange={(v) => setBlock(i, { ...b, schedule: { ...b.schedule, from: v } })} help="Κενό = από τώρα." />
                                <DateTime label="Έως" value={b.schedule?.to} onChange={(v) => setBlock(i, { ...b, schedule: { ...b.schedule, to: v } })} help="Κενό = χωρίς λήξη." />
                              </div>
                            </details>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κενή ζώνη.</p>}
              {adding === z.key && (
                <div className="rounded-xl border-2 border-eu-navy bg-white p-3 grid gap-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">Τι θέλεις να προσθέσεις στη ζώνη «{z.label}»;</span><button type="button" onClick={() => setAdding(null)} aria-label="Άκυρο" className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button></div>
                  {BLOCK_GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => !allowed || allowed.includes(t)) })).filter((g) => g.types.length).map((g) => (
                    <div key={g.label} className="grid gap-2">
                      <span className="font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">{g.label}</span>
                      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-2">
                        {g.types.map((t) => (
                          <button key={t} type="button" onClick={() => addBlock(t, z.key)} className="text-left rounded-xl border-2 border-eu-line p-3 min-h-14 hover:border-eu-navy grid gap-0.5">
                            <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{BLOCK_INFO[t].label}</span>
                            <span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{BLOCK_INFO[t].help}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {markers?.[z.key]?.after && <div className="rounded-xl bg-eu-surface px-3 py-2 text-eu-muted text-[length:var(--fs-13)] font-bold">{markers[z.key]!.after}</div>}
            </div>
          );
        })}
    </>
  );
}
