"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { X, RefreshCw } from "lucide-react";
import type { InfoTagDef, TagConfig, TagMode } from "@/lib/promo/tags";
import { ProductBrowser } from "./ProductBrowser";
import { saveTagConfigAction, setManualTagAction, setTagStickerAction } from "@/app/admin/(shell)/prosfores/actions";
import { StickerPicker } from "@/components/admin/stickers/StickerPicker";

type Row = InfoTagDef & { config: TagConfig[string]; stickerKey: string | null; count: number; products: { id: string; label: string }[] };
const input = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white";

/** Ρύθμιση των ενημερωτικών ετικετών: κλειστή / χειροκίνητη / αυτόματη, παράμετροι κανόνα, προϊόντα. */
export function InfoTagsEditor({ tags }: { tags: Row[] }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<TagConfig>(Object.fromEntries(tags.map((t) => [t.slug, t.config])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [stk, setStk] = useState<Record<string, string | null>>(Object.fromEntries(tags.map((t) => [t.slug, t.stickerKey])));
  const set = (slug: string, p: Partial<TagConfig[string]>) => setCfg((c) => ({ ...c, [slug]: { ...c[slug], ...p } }));
  const save = () => start(async () => { const n = await saveTagConfigAction(cfg); setMsg(`Αποθηκεύτηκε και υπολογίστηκε: ${tags.map((t) => `${t.name} ${n[t.slug] ?? 0}`).join(" · ")}.`); router.refresh(); });
  return (
    <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Ενημερωτικές</h3>
        <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden /> Αποθήκευση & υπολογισμός</button>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-green/10 text-eu-green px-4 py-2 font-semibold text-[length:var(--fs-14)]">{msg}</p>}
      <ul className="m-0 p-0 list-none grid gap-3">
        {tags.map((t) => {
          const c = cfg[t.slug];
          const manualOnly = t.slug === "apokleistiko" || t.slug === "proparaggelia";
          return (
            <li key={t.slug} className="rounded-2xl border border-eu-line p-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-eu-navy/20 text-eu-navy font-extrabold px-3 py-1 text-[length:var(--fs-14)]">{t.name}</span>
                <span className="text-eu-muted text-[length:var(--fs-14)]">{t.count.toLocaleString("el-GR")} προϊόντα · {t.rule}</span>
                <select aria-label={`Λειτουργία: ${t.name}`} value={c.mode} onChange={(e) => set(t.slug, { mode: e.target.value as TagMode })} className={`${input} ml-auto`}>
                  <option value="off">Κλειστή</option><option value="manual">Χειροκίνητα</option>{!manualOnly && <option value="auto">Αυτόματα (κανόνας)</option>}
                </select>
              </div>
              <details className="rounded-xl border border-eu-line" open={!!stk[t.slug]}>
                <summary className="cursor-pointer px-3 min-h-11 flex items-center font-bold text-eu-ink text-[length:var(--fs-14)]">Sticker στις κάρτες{stk[t.slug] ? ` · ${stk[t.slug]}` : " · κανένα"}</summary>
                <div className="p-2 pt-0"><StickerPicker value={stk[t.slug] ?? null} onChange={(v) => { setStk((m) => ({ ...m, [t.slug]: v })); start(async () => { await setTagStickerAction(t.slug, t.name, v); setMsg(`«${t.name}»: ${v ? `sticker ${v}` : "χωρίς sticker"}.`); }); }} /></div>
              </details>
              {c.mode === "auto" && (
                <div className="flex flex-wrap gap-3 text-[length:var(--fs-14)] font-bold text-eu-ink-2">
                  {t.defaults.days != null && <label className="inline-flex items-center gap-2">Ημέρες <input inputMode="numeric" className={`${input} w-24`} value={c.days ?? ""} onChange={(e) => set(t.slug, { days: Number(e.target.value) || undefined })} /></label>}
                  {t.defaults.top != null && <label className="inline-flex items-center gap-2">Πρώτα <input inputMode="numeric" className={`${input} w-24`} value={c.top ?? ""} onChange={(e) => set(t.slug, { top: Number(e.target.value) || undefined })} /></label>}
                  {t.defaults.minRating != null && <label className="inline-flex items-center gap-2">Βαθμολογία από <input inputMode="decimal" className={`${input} w-20`} value={c.minRating ?? ""} onChange={(e) => set(t.slug, { minRating: Number(e.target.value.replace(",", ".")) || undefined })} /></label>}
                  {t.defaults.minReviews != null && <label className="inline-flex items-center gap-2">Κριτικές από <input inputMode="numeric" className={`${input} w-20`} value={c.minReviews ?? ""} onChange={(e) => set(t.slug, { minReviews: Number(e.target.value) || undefined })} /></label>}
                  {t.slug === "neo" && <span className="font-normal text-eu-amber">Προσοχή: όλος ο κατάλογος εισήχθη πρόσφατα — ο κανόνας έχει νόημα για προϊόντα που προστίθενται από εδώ και πέρα.</span>}
                </div>
              )}
              {c.mode === "manual" && <ManualList slug={t.slug} products={t.products} total={t.count} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ManualList({ slug, products, total }: { slug: string; products: { id: string; label: string }[]; total: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [mine, setMine] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  const toggle = (id: string, on: boolean) => start(async () => { await setManualTagAction(slug, [id], on); setMine((m) => { const n = new Set(m); if (on) n.add(id); else n.delete(id); return n; }); router.refresh(); });
  return (
    <div className="grid gap-3">
      {products.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
          {products.map((p) => <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-eu-surface pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] max-w-full"><span className="truncate">{p.label}</span><button type="button" aria-label={`Αφαίρεση ${p.label}`} disabled={busy} onClick={() => toggle(p.id, false)} className="size-9 shrink-0 grid place-items-center rounded-full hover:bg-black/5"><X className="size-4" aria-hidden /></button></li>)}
          {total > products.length && <li className="text-eu-muted text-[length:var(--fs-14)] self-center">+{(total - products.length).toLocaleString("el-GR")} ακόμη</li>}
        </ul>
      )}
      <details className="rounded-xl border border-eu-line p-3">
        <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-14)] min-h-8">Πρόσθεσε προϊόντα από τον κατάλογο</summary>
        <div className="mt-3"><ProductBrowser mode="products" selected={mine} onProduct={(p) => toggle(p.id, !mine.has(p.id))} addLabel="Ετικέτα" /></div>
      </details>
    </div>
  );
}
