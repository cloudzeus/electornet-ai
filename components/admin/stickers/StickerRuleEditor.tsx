"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { ProductBrowser } from "@/components/admin/promos/ProductBrowser";
import { Picker, TargetChips, OptionCard } from "@/components/admin/promos/PromoWizard";
import { StickerPicker } from "./StickerPicker";
import type { PromoTarget } from "@/lib/promo/engine";
import { saveStickerRule, deleteStickerRule, previewStickerRule, type RuleInput } from "@/app/admin/(shell)/stickers/actions";

const input = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white w-full outline-none focus:border-eu-blue";
const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";

/**
 * Κανόνας εφαρμογής sticker: πού ισχύει (κατηγορίες με τις υποκατηγορίες, μάρκα σε κατηγορία, μάρκα σε όλο τον κατάλογο,
 * προϊόντα) και τι εξαιρείται — όπως στις προσφορές — με εύρος τιμής, «μόνο διαθέσιμα», ημερομηνίες και προτεραιότητα.
 * Η προεπισκόπηση δείχνει πόσα και ποια προϊόντα πιάνει, πριν αποθηκευτεί.
 */
export function StickerRuleEditor({ initial, names: initialNames }: { initial: RuleInput; names: Record<string, string> }) {
  const router = useRouter();
  const [r, setR] = useState<RuleInput>(initial);
  const [names, setNames] = useState(initialNames);
  const [exclude, setExclude] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; title: string }[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<RuleInput>) => setR((s) => ({ ...s, ...p }));
  const add = (kind: PromoTarget["kind"], refId: string, name: string) => { setNames((n) => ({ ...n, [refId]: name })); setR((s) => s.targets.some((t) => t.refId === refId && t.kind === kind) ? s : { ...s, targets: [...s.targets, { kind, refId, exclude }] }); };
  const remove = (t: PromoTarget) => setR((s) => ({ ...s, targets: s.targets.filter((x) => !(x.kind === t.kind && x.refId === t.refId && x.exclude === t.exclude)) }));
  const inc = r.targets.filter((t) => !t.exclude), exc = r.targets.filter((t) => t.exclude);

  // προεπισκόπηση: λίγο μετά από κάθε αλλαγή στόχευσης / τιμής / διαθεσιμότητας
  useEffect(() => {
    const t = setTimeout(() => { void previewStickerRule({ targets: r.targets, minPrice: r.minPrice, maxPrice: r.maxPrice, onlyInStock: r.onlyInStock }).then(setPreview).catch(() => setPreview(null)); }, 400);
    return () => clearTimeout(t);
  }, [r.targets, r.minPrice, r.maxPrice, r.onlyInStock]);

  const save = () => start(async () => { const res = await saveStickerRule(r); if (!res.ok) return setMsg(res.error); setMsg("Αποθηκεύτηκε — ισχύει στη βιτρίνα σε λίγα δευτερόλεπτα."); if (!r.id) router.replace(`/admin/stickers/kanones/${res.id}`); else router.refresh(); });
  const del = () => { if (!r.id || !confirm(`Διαγραφή του κανόνα «${r.name}»; Το sticker φεύγει από τα προϊόντα του κανόνα (όχι όσα μπήκαν αλλιώς).`)) return; start(async () => { await deleteStickerRule(r.id!); router.push("/admin/stickers/kanones"); }); };
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(",", "."))));

  return (
    <div className="grid gap-4 @container">
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
        <div className="grid gap-3 @2xl:grid-cols-[minmax(0,1fr)_auto] items-end">
          <label className={label}>Όνομα κανόνα<input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="π.χ. Eco σε όλα τα πλυντήρια Bosch" className={input} /></label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={r.active} onChange={(e) => set({ active: e.target.checked })} className="size-5 accent-eu-navy" /> Ενεργός</label>
            {r.id && <button type="button" onClick={del} disabled={pending} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-eu-ink-3 text-[length:var(--fs-14)] hover:border-eu-red hover:text-eu-red"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button>}
            <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold px-5 min-h-11 text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button>
          </div>
        </div>
        {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
        <div className="grid gap-1"><span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Sticker</span><StickerPicker by="id" allowNone={false} value={r.stickerId || null} onChange={(v) => set({ stickerId: v ?? "" })} /></div>
      </section>

      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-14)] uppercase tracking-wide">Πού ισχύει</h3>
        <div className="grid grid-cols-2 gap-2">
          <OptionCard on={!exclude} onClick={() => setExclude(false)} title="Ισχύει σε" desc="Ό,τι διαλέξεις από κάτω παίρνει το sticker." />
          <OptionCard on={exclude} onClick={() => setExclude(true)} tone="red" title="Εξαίρεση" desc="Ό,τι διαλέξεις από κάτω δεν το παίρνει ποτέ — ακόμη κι αν ανήκει σε κατηγορία ή μάρκα του κανόνα." />
        </div>
        <div className="rounded-2xl bg-eu-surface p-3 grid gap-2" aria-live="polite">
          <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-14)]">Ισχύει σε</h4>
          {inc.length ? <TargetChips list={inc} names={names} onRemove={remove} tone="in" /> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Τίποτα ακόμη — διάλεξε κατηγορία, μάρκα ή προϊόντα (ή μόνο εύρος τιμής).</p>}
          {exc.length > 0 && <><h4 className="m-0 mt-1 font-extrabold text-eu-red text-[length:var(--fs-14)]">Εκτός</h4><TargetChips list={exc} names={names} onRemove={remove} tone="out" /></>}
          <p className="m-0 text-eu-muted text-[length:var(--fs-12)]">Κατηγορία = μαζί με όλες τις υποκατηγορίες της. Πολλές επιλογές = ισχύει σε οποιαδήποτε από αυτές.</p>
        </div>
        <ProductBrowser mode="targets" selected={new Set(r.targets.map((t) => t.refId))} addLabel={exclude ? "Εξαίρεση" : "Προσθήκη"}
          onCategory={(c) => add("category", c.id, c.name)}
          onBrandInCategory={(b, c) => add("brandcat", `${b.id}|${c.id}`, `${b.name} στα ${c.name}`)}
          onProduct={(p) => add("product", p.id, p.title)} />
        <details className="rounded-xl border border-eu-line p-3">
          <summary className="cursor-pointer font-bold text-eu-ink-2 text-[length:var(--fs-14)] min-h-8">Μάρκα σε όλο τον κατάλογο (σε όλες τις κατηγορίες)</summary>
          <div className="mt-2"><Picker kind="brand" onPick={(x) => add("brand", x.id, x.label)} placeholder="Αναζήτηση μάρκας" /></div>
        </details>
      </section>

      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-14)] uppercase tracking-wide">Προϋποθέσεις και διάρκεια</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,11rem),1fr))]">
          <label className={label}>Τιμή από (€)<input inputMode="decimal" value={r.minPrice ?? ""} onChange={(e) => set({ minPrice: num(e.target.value) })} placeholder="—" className={input} /></label>
          <label className={label}>Τιμή έως (€)<input inputMode="decimal" value={r.maxPrice ?? ""} onChange={(e) => set({ maxPrice: num(e.target.value) })} placeholder="—" className={input} /></label>
          <label className={label}>Από<input type="date" value={r.startsAt?.slice(0, 10) ?? ""} onChange={(e) => set({ startsAt: e.target.value || null })} className={input} /></label>
          <label className={label}>Έως<input type="date" value={r.endsAt?.slice(0, 10) ?? ""} onChange={(e) => set({ endsAt: e.target.value || null })} className={input} /></label>
          <label className={label}><span>Προτεραιότητα <span className="text-eu-muted font-normal text-[length:var(--fs-12)]">(μικρότερο = πρώτος)</span></span><input type="number" min={0} max={999} value={r.priority} onChange={(e) => set({ priority: Number(e.target.value) })} className={input} /></label>
        </div>
        <label className="inline-flex items-center gap-2 min-h-11 font-bold text-eu-ink text-[length:var(--fs-14)]"><input type="checkbox" checked={r.onlyInStock} onChange={(e) => set({ onlyInStock: e.target.checked })} className="size-5 accent-eu-navy" /> Μόνο σε διαθέσιμα (απόθεμα στην κεντρική)</label>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Στην κάρτα: έως 2 stickers (1 στο κινητό) με σειρά προσφορά → χειροκίνητα → <strong>κανόνες</strong> → ετικέτες· όσα περισσεύουν εναλλάσσονται.</p>
      </section>

      <section className="rounded-2xl border-2 border-dashed border-eu-blue/40 bg-eu-chip/30 p-4 grid gap-2" aria-live="polite">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-14)]">Προεπισκόπηση</h3>
        {!preview ? <p className="m-0 text-eu-muted text-[length:var(--fs-14)] inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Υπολογισμός…</p>
          : <><p className="m-0 text-eu-ink text-[length:var(--fs-15)]">Πιάνει <strong className="tabular-nums">{preview.count.toLocaleString("el-GR")}</strong> {preview.count === 1 ? "προϊόν" : "προϊόντα"} της βιτρίνας.</p>
            {preview.sample.length > 0 && <ul className="m-0 pl-4 text-eu-ink-2 text-[length:var(--fs-13)]">{preview.sample.map((p) => <li key={p.id}><a href={`/admin/catalog/${p.id}`} target="_blank" rel="noreferrer" className="hover:underline">{p.title}</a></li>)}</ul>}</>}
      </section>
    </div>
  );
}
