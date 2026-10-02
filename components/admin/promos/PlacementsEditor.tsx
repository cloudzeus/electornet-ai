"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { SLOTS } from "@/lib/promo/landing-blocks";
import { savePlacementAction, type PlacementInput } from "@/app/admin/(shell)/prosfores/actions";
import { ImageUrlField } from "./ImageUrlField";

type Row = PlacementInput & { id: string; impressions: number; clicks: number; promoLive: boolean | null };
type Opt = { id: string; label: string };
const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";
const ST: Record<string, string> = { draft: "Πρόχειρο", active: "Ενεργό", paused: "Σε παύση", archived: "Αρχείο" };
const localDt = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const blank = (slot: string): PlacementInput => ({ id: null, slot, title: "", image: null, imageMobile: null, alt: null, href: null, promotionId: null, landingId: null, status: "draft", startsAt: null, endsAt: null, priority: 100, categories: [] });

/** Οι θέσεις ανά σημείο της βιτρίνας, με στατιστικά και φόρμα επεξεργασίας. */
export function PlacementsEditor({ rows, promos, landings, categories }: { rows: Row[]; promos: Opt[]; landings: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<PlacementInput | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<PlacementInput>) => setEdit((x) => (x ? { ...x, ...p } : x));
  const save = () => edit && start(async () => { const r = await savePlacementAction(edit); if (!r.ok) return setMsg({ ok: false, t: r.error }); setMsg({ ok: true, t: "Αποθηκεύτηκε. Η βιτρίνα ενημερώνεται σε λίγα δευτερόλεπτα." }); setEdit(null); router.refresh(); });

  return (
    <div className="grid gap-4">
      {msg && <p role="status" className={`m-0 rounded-xl px-4 py-2 font-semibold text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-green" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      {edit && (
        <section className="rounded-2xl bg-white border-2 border-eu-navy p-4 @md:p-5 grid gap-3">
          <div className="flex items-center justify-between"><h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-16)]">{edit.id ? "Επεξεργασία banner" : "Νέο banner"}</h3><button type="button" aria-label="Κλείσιμο" onClick={() => setEdit(null)} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
          <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-3">
            <label className={lbl}><span>Θέση</span><select className={input} value={edit.slot} onChange={(e) => set({ slot: e.target.value })}>{SLOTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            <label className={lbl}><span>Τίτλος (εσωτερικός)</span><input className={input} value={edit.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <label className={lbl}><span>Κατάσταση</span><select className={input} value={edit.status} onChange={(e) => set({ status: e.target.value as PlacementInput["status"] })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <ImageUrlField label="Εικόνα" value={edit.image ?? ""} onChange={(v) => set({ image: v || null })} help={`Μέγεθος: ${SLOTS.find((s) => s.key === edit.slot)?.size}`} />
            <ImageUrlField label="Εικόνα για κινητό (προαιρετικά)" value={edit.imageMobile ?? ""} onChange={(v) => set({ imageMobile: v || null })} />
            <label className={lbl}><span>Περιγραφή εικόνας (alt)</span><input className={input} value={edit.alt ?? ""} onChange={(e) => set({ alt: e.target.value || null })} /></label>
            <label className={lbl}><span>Προσφορά (εμφανίζεται μόνο όσο είναι ενεργή)</span><select className={input} value={edit.promotionId ?? ""} onChange={(e) => set({ promotionId: e.target.value || null })}><option value="">— χωρίς —</option>{promos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className={lbl}><span>Landing page</span><select className={input} value={edit.landingId ?? ""} onChange={(e) => set({ landingId: e.target.value || null })}><option value="">— χωρίς —</option>{landings.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className={lbl}><span>ή σύνδεσμος</span><input className={input} value={edit.href ?? ""} onChange={(e) => set({ href: e.target.value || null })} placeholder="/k/… ή https://…" /></label>
            <label className={lbl}><span>Από</span><input type="datetime-local" className={input} value={localDt(edit.startsAt)} onChange={(e) => set({ startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
            <label className={lbl}><span>Έως</span><input type="datetime-local" className={input} value={localDt(edit.endsAt)} onChange={(e) => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
            <label className={lbl}><span>Προτεραιότητα</span><input inputMode="numeric" className={input} value={edit.priority} onChange={(e) => set({ priority: Number(e.target.value) || 100 })} /></label>
          </div>
          {(edit.slot === "listing-top" || edit.slot === "pdp-below-buybox") && (
            <div className="grid gap-1.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Μόνο στις κατηγορίες (κενό = σε όλες)</span>
              <div className="flex flex-wrap gap-1.5">{categories.map((c) => { const on = edit.categories.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => set({ categories: on ? edit.categories.filter((x) => x !== c.id) : [...edit.categories, c.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{c.label}</button>; })}</div>
            </div>
          )}
          <button type="button" disabled={busy} onClick={save} className="justify-self-start rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-40">{busy ? "Αποθήκευση…" : "Αποθήκευση"}</button>
        </section>
      )}
      {SLOTS.map((s) => {
        const list = rows.filter((r) => r.slot === s.key);
        return (
          <section key={s.key} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">{s.label}</h3><div className="text-eu-muted text-[length:var(--fs-13)]">{s.size}</div></div>
              <button type="button" onClick={() => { setMsg(null); setEdit(blank(s.key)); }} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Banner</button>
            </div>
            {list.length ? (
              <ul className="m-0 p-0 list-none grid gap-2">
                {list.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-eu-line p-2">
                    {r.image ? <span className="w-40 h-12 rounded-lg bg-center bg-cover border border-eu-line" style={{ backgroundImage: `url("${r.image}")` }} aria-hidden /> : <span className="w-40 h-12 rounded-lg bg-eu-surface grid place-items-center text-eu-muted text-[length:var(--fs-13)]">χωρίς εικόνα</span>}
                    <div className="flex-1 min-w-[12rem]">
                      <div className="font-bold text-eu-ink text-[length:var(--fs-14)]">{r.title} <span className="font-normal text-eu-muted">· {ST[r.status]}{r.promoLive === false ? " · η προσφορά δεν είναι ενεργή (κρυφό)" : ""}</span></div>
                      <div className="text-eu-muted text-[length:var(--fs-13)] tabular-nums">{r.impressions.toLocaleString("el-GR")} προβολές · {r.clicks.toLocaleString("el-GR")} κλικ{r.impressions ? ` · CTR ${((r.clicks / r.impressions) * 100).toFixed(2)} %` : ""} · προτεραιότητα {r.priority}</div>
                    </div>
                    <button type="button" onClick={() => { setMsg(null); setEdit({ ...r }); }} className="inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-11 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Pencil className="size-4" aria-hidden /> Αλλαγή</button>
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κενή θέση — δεν εμφανίζεται τίποτα.</p>}
          </section>
        );
      })}
    </div>
  );
}
