"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X, RefreshCw, ChevronDown } from "lucide-react";
import type { InfoTagDef, TagConfig, TagMode } from "@/lib/promo/tags";
import { ProductBrowser } from "./ProductBrowser";
import { Picker } from "./PromoWizard";
import { saveTagConfigAction, setManualTagAction, setTagStickerAction } from "@/app/admin/(shell)/prosfores/actions";
import { StickerPicker } from "@/components/admin/stickers/StickerPicker";

type Row = InfoTagDef & { config: TagConfig[string]; stickerKey: string | null; count: number; products: { id: string; label: string }[] };
const input = "rounded-xl border-2 border-eu-line px-2.5 min-h-10 text-[length:var(--fs-15)] bg-white";

const MODES: { v: TagMode; t: string }[] = [{ v: "off", t: "Κλειστή" }, { v: "manual", t: "Χειροκίνητα" }, { v: "auto", t: "Αυτόματα" }];

/**
 * Οι ενημερωτικές ετικέτες σε κάρτες: πώς φαίνεται, σε πόσα προϊόντα, λειτουργία (κλειστή / χειροκίνητα / αυτόματα) με
 * ένα πάτημα, παράμετροι του κανόνα, sticker, και για τις χειροκίνητες τα προϊόντα με αναζήτηση. Η «Αποθήκευση &
 * υπολογισμός» εμφανίζεται μόνο όταν άλλαξε κάτι.
 */
export function InfoTagsEditor({ tags }: { tags: Row[] }) {
  const router = useRouter();
  const initial = Object.fromEntries(tags.map((t) => [t.slug, t.config])) as TagConfig;
  const [cfg, setCfg] = useState<TagConfig>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [stk, setStk] = useState<Record<string, string | null>>(Object.fromEntries(tags.map((t) => [t.slug, t.stickerKey])));
  const set = (slug: string, p: Partial<TagConfig[string]>) => setCfg((c) => ({ ...c, [slug]: { ...c[slug], ...p } }));
  const dirty = JSON.stringify(cfg) !== saved;
  const save = () => start(async () => { const n = await saveTagConfigAction(cfg); setSaved(JSON.stringify(cfg)); setMsg(`Αποθηκεύτηκε και υπολογίστηκε: ${tags.map((t) => `${t.name} ${n[t.slug] ?? 0}`).join(" · ")}.`); router.refresh(); });
  return (
    <section data-help="promo.tags.info" aria-labelledby="tags-info" className="grid gap-3">
      <div className="grid gap-0.5">
        <h3 id="tags-info" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Ενημερωτικές ετικέτες</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Φαίνονται στην κάρτα όταν δεν υπάρχει ετικέτα προσφοράς. Οι αυτόματες ξαναϋπολογίζονται κάθε ώρα.</p>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green px-4 py-2 font-semibold text-[length:var(--fs-14)]">{msg}</p>}
      <ul className="m-0 p-0 list-none grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-3 items-start">
        {tags.map((t) => {
          const c = cfg[t.slug];
          const manualOnly = t.slug === "apokleistiko" || t.slug === "proparaggelia";
          return (
            <li key={t.slug} className={`rounded-2xl bg-white border p-3 grid gap-2.5 ${c.mode === "off" ? "border-dashed border-eu-line" : "border-eu-line"}`}>
              <div className="flex items-start gap-2">
                <span className={`inline-flex rounded-full font-extrabold px-3 py-1 text-[length:var(--fs-13)] ${c.mode === "off" ? "bg-eu-surface text-eu-muted" : "bg-eu-navy text-white"}`}>{t.name}</span>
                <span className="ml-auto font-heading font-extrabold text-eu-ink text-[length:var(--fs-18)] tabular-nums leading-none">{t.count.toLocaleString("el-GR")}<span className="block text-right text-eu-muted font-sans font-normal text-[length:var(--fs-12)]">προϊόντα</span></span>
              </div>
              <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] leading-snug">{t.rule}</p>
              <div role="radiogroup" aria-label={`Λειτουργία: ${t.name}`} className={`grid ${manualOnly ? "grid-cols-2" : "grid-cols-3"} gap-1 rounded-xl bg-eu-surface p-1`}>
                {MODES.filter((m) => !(manualOnly && m.v === "auto")).map((m) => <button key={m.v} type="button" role="radio" aria-checked={c.mode === m.v} onClick={() => set(t.slug, { mode: m.v })} className={`rounded-lg min-h-10 font-bold text-[length:var(--fs-13)] ${c.mode === m.v ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-blue"}`}>{m.t}</button>)}
              </div>
              {c.mode === "auto" && (
                <div className="flex flex-wrap gap-x-3 gap-y-2 text-[length:var(--fs-13)] font-bold text-eu-ink-2">
                  {t.defaults.days != null && <label className="inline-flex items-center gap-1.5">Ημέρες <input inputMode="numeric" className={`${input} w-20`} value={c.days ?? ""} onChange={(e) => set(t.slug, { days: Number(e.target.value) || undefined })} /></label>}
                  {t.defaults.top != null && <label className="inline-flex items-center gap-1.5">Πρώτα <input inputMode="numeric" className={`${input} w-20`} value={c.top ?? ""} onChange={(e) => set(t.slug, { top: Number(e.target.value) || undefined })} /></label>}
                  {t.defaults.minRating != null && <label className="inline-flex items-center gap-1.5">Βαθμολογία από <input inputMode="decimal" className={`${input} w-16`} value={c.minRating ?? ""} onChange={(e) => set(t.slug, { minRating: Number(e.target.value.replace(",", ".")) || undefined })} /></label>}
                  {t.defaults.minReviews != null && <label className="inline-flex items-center gap-1.5">Κριτικές από <input inputMode="numeric" className={`${input} w-16`} value={c.minReviews ?? ""} onChange={(e) => set(t.slug, { minReviews: Number(e.target.value) || undefined })} /></label>}
                  {t.slug === "neo" && <span className="basis-full font-normal text-eu-amber">Όλος ο κατάλογος εισήχθη πρόσφατα — ο κανόνας έχει νόημα για προϊόντα που προστίθενται από εδώ και πέρα.</span>}
                </div>
              )}
              {c.mode === "manual" && <ManualList slug={t.slug} products={t.products} total={t.count} />}
              <details className="group rounded-xl border border-eu-line" open={!!stk[t.slug]}>
                <summary className="list-none cursor-pointer px-3 min-h-10 flex items-center gap-2 font-bold text-eu-ink-2 text-[length:var(--fs-13)] [&::-webkit-details-marker]:hidden"><span className="flex-1">Sticker στις κάρτες · {stk[t.slug] ?? "κανένα"}</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
                <div className="p-2 pt-0"><StickerPicker value={stk[t.slug] ?? null} onChange={(v) => { setStk((m) => ({ ...m, [t.slug]: v })); start(async () => { await setTagStickerAction(t.slug, t.name, v); setMsg(`«${t.name}»: ${v ? `sticker ${v}` : "χωρίς sticker"}.`); }); }} /></div>
              </details>
            </li>
          );
        })}
      </ul>
      {dirty && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-eu-navy text-white px-4 py-2.5 shadow-[var(--shadow-raised)]">
          <span className="font-bold text-[length:var(--fs-14)]">Άλλαξαν ρυθμίσεις ετικετών</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setCfg(JSON.parse(saved))} className="rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-white/10">Αναίρεση</button>
            <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy px-5 min-h-11 font-extrabold text-[length:var(--fs-14)] disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden /> Αποθήκευση & υπολογισμός</button>
          </span>
        </div>
      )}
    </section>
  );
}

function ManualList({ slug, products, total }: { slug: string; products: { id: string; label: string }[]; total: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [mine, setMine] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  const toggle = (id: string, on: boolean) => start(async () => { await setManualTagAction(slug, [id], on); setMine((m) => { const n = new Set(m); if (on) n.add(id); else n.delete(id); return n; }); router.refresh(); });
  return (
    <div className="grid gap-2">
      {products.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
          {products.map((p) => <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-eu-surface pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] max-w-full"><span className="truncate">{p.label}</span><button type="button" aria-label={`Αφαίρεση ${p.label}`} disabled={busy} onClick={() => toggle(p.id, false)} className="size-9 shrink-0 grid place-items-center rounded-full hover:bg-black/5"><X className="size-4" aria-hidden /></button></li>)}
          {total > products.length && <li className="text-eu-muted text-[length:var(--fs-14)] self-center">+{(total - products.length).toLocaleString("el-GR")} ακόμη</li>}
        </ul>
      )}
      <Picker kind="product" placeholder="Πρόσθεσε προϊόν: όνομα ή κωδικός…" onPick={(x) => { if (!mine.has(x.id)) toggle(x.id, true); }} />
      <details className="rounded-xl border border-eu-line p-3">
        <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-13)] min-h-8">Περιήγηση στον κατάλογο</summary>
        <div className="mt-3"><ProductBrowser mode="products" selected={mine} onProduct={(p) => toggle(p.id, !mine.has(p.id))} addLabel="Ετικέτα" /></div>
      </details>
    </div>
  );
}
