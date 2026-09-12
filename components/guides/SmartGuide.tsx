"use client";


import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, RotateCcw, Sparkles, Scale, Heart } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { GUIDES, evaluate, type Answers, type GuideKind } from "@/lib/guides/smart";
import { instalment, priceLong, priceShort } from "@/lib/format";
import { useCart } from "@/components/commerce/CartProvider";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("smartGuide");

/**
 * Smart buying guide wizard: one question per screen, big tappable
 * option cards, progress, then a result page with «τι χρειάζεσαι», the
 * top pick with its reasons and trade-offs, two alternatives, and a link
 * to the listing pre-filtered to the derived needs. Answers stay in the
 * component; «Αλλαγή απαντήσεων» goes back without losing them.
 */
export function SmartGuide({ kind, products }: { kind: GuideKind; products: Product[] }) {
  const def = GUIDES[kind];
  const [i, setI] = useState(0);
  const [a, setA] = useState<Answers>({});
  const [done, setDone] = useState(false);
  const q = def.questions[i];
  const chosen = a[q.id] ?? [];
  const canNext = chosen.length > 0;
  const result = useMemo(() => (done ? evaluate(kind, products, a) : null), [done, kind, products, a]);

  const pick = (v: string) => {
    setA((s) => {
      const cur = s[q.id] ?? [];
      const next = q.multi ? (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]) : [v];
      return { ...s, [q.id]: next };
    });
    if (!q.multi) setTimeout(() => step(1), 180);
  };
  const step = (d: 1 | -1) => {
    if (d === 1 && i === def.questions.length - 1) {
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setI((x) => Math.max(0, Math.min(def.questions.length - 1, x + d)));
  };

  if (done && result) return <Results kind={kind} a={a} result={result} onEdit={() => setDone(false)} onReset={() => (setA({}), setI(0), setDone(false))} />;

  return (
    <div className="grid gap-6 max-w-[860px] mx-auto">
      <div className="grid gap-2">
        <div className="flex justify-between text-[length:var(--fs-14)] font-bold text-eu-muted">
          <span>
            Ερώτηση {i + 1} από {def.questions.length}
          </span>
          <span>{Math.round((i / def.questions.length) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-eu-surface-2 overflow-hidden">
          <div className="h-full bg-eu-yellow rounded-full transition-[width]" style={{ width: `${((i + (canNext ? 1 : 0)) / def.questions.length) * 100}%` }} />
        </div>
      </div>
      <div key={q.id} className="grid gap-5 motion-safe:animate-[fade-up_.3s_ease-out]">
        <div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] leading-tight">{q.title}</h2>
          {q.help && <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-16)]">{q.help}</p>}
          {q.multi && <p className="m-0 mt-1 text-eu-blue font-bold text-[length:var(--fs-14)]">{c.dialexe_ena_i_perissotera}</p>}
        </div>
        <div className={`grid gap-3 ${q.options.length > 3 ? "grid-cols-1 @md:grid-cols-2" : "grid-cols-1 @md:grid-cols-3"}`}>
          {q.options.map((o) => {
            const on = chosen.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} onClick={() => pick(o.value)} className={`text-left rounded-2xl border-2 p-4 @md:p-5 min-h-[76px] grid grid-cols-[auto_1fr] gap-3 items-center transition-colors ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue"}`}>
                <span className={`size-7 rounded-full border-2 inline-flex items-center justify-center shrink-0 ${on ? "border-eu-yellow bg-eu-yellow text-eu-navy" : "border-eu-line-3"}`}>{on && <Check className="size-4" aria-hidden />}</span>
                <span>
                  <span className="block font-extrabold text-[length:var(--fs-17)] leading-tight">{o.label}</span>
                  {o.sub && <span className={`block text-[length:var(--fs-14)] mt-0.5 ${on ? "text-eu-on-dark" : "text-eu-muted"}`}>{o.sub}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => step(-1)} disabled={i === 0} className="inline-flex items-center gap-1.5 font-bold text-eu-blue text-[length:var(--fs-15)] min-h-12 disabled:opacity-30">
          <ArrowLeft className="size-4" aria-hidden /> {c.piso}
        </button>
        <button type="button" onClick={() => step(1)} disabled={!canNext} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] px-7 min-h-14 hover:bg-eu-blue disabled:opacity-40">
          {i === def.questions.length - 1 ? "Δες την πρότασή μας" : "Επόμενο"} <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Results({ kind, a, result, onEdit, onReset }: { kind: GuideKind; a: Answers; result: ReturnType<typeof evaluate>; onEdit: () => void; onReset: () => void }) {
  const def = GUIDES[kind];
  const { add, openQuickBuy, toggleCompare, compare, toggleWishlist, wishlist } = useCart();
  const [top, ...rest] = result.ranked;
  const alts = rest.slice(0, 2);
  const summary = def.questions.map((q) => (a[q.id] ?? []).map((v) => q.options.find((o) => o.value === v)?.label).filter(Boolean).join(", ")).filter(Boolean);

  if (!top) return null;
  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-1 @3xl:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
        <aside className="grid gap-4 @3xl:sticky @3xl:top-16">
          <div className="rounded-2xl bg-eu-navy text-white p-5">
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide mb-2 flex items-center gap-1.5">
              <Sparkles className="size-4" aria-hidden /> {c.ti_chreiazesai}
            </div>
            <dl className="m-0 grid gap-2.5">
              {result.needs.map((n) => (
                <div key={n.label} className="flex justify-between gap-3 text-[length:var(--fs-15)] border-b border-white/10 pb-2 last:border-0">
                  <dt className="text-eu-on-dark">{n.label}</dt>
                  <dd className="m-0 font-extrabold text-right">{n.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-eu-line bg-white p-5 grid gap-2">
            <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{c.oi_apantiseis_soy}</div>
            <ul className="m-0 p-0 list-none grid gap-1 text-eu-ink-2 text-[length:var(--fs-14)]">
              {summary.map((s, k) => (
                <li key={k} className="flex gap-2">
                  <span className="text-eu-blue">•</span> {s}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-1 text-[length:var(--fs-14)] font-bold">
              <button type="button" onClick={onEdit} className="text-eu-blue hover:underline min-h-9">
                {c.allagi_apantiseon}
              </button>
              <button type="button" onClick={onReset} className="inline-flex items-center gap-1 text-eu-muted hover:text-eu-ink min-h-9">
                <RotateCcw className="size-3.5" aria-hidden /> {c.apo_tin_archi}
              </button>
            </div>
          </div>
          <Link href={result.listHref} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center hover:bg-eu-surface">
            {c.ola_ta_montela_me}
          </Link>
        </aside>

        <div className="grid gap-5 min-w-0 eu-container">
          <Pick s={top} rank={1} noun={def.noun} onAdd={() => add(top.product)} onQuick={() => openQuickBuy(top.product)} onCompare={() => toggleCompare(top.product.id)} compared={compare.includes(top.product.id)} onLike={() => toggleWishlist(top.product.id)} liked={wishlist.includes(top.product.id)} />
          {alts.length > 0 && (
            <div className="grid gap-3">
              <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">{c.enallaktikes_poy_axizei_na}</h3>
              <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
                {alts.map((s, k) => (
                  <Pick key={s.product.id} s={s} rank={k + 2} noun={def.noun} compact onAdd={() => add(s.product)} onQuick={() => openQuickBuy(s.product)} onCompare={() => toggleCompare(s.product.id)} compared={compare.includes(s.product.id)} onLike={() => toggleWishlist(s.product.id)} liked={wishlist.includes(s.product.id)} />
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl bg-eu-surface p-5 text-[length:var(--fs-15)] text-eu-ink-2 flex flex-wrap items-center justify-between gap-3">
            <span>
              Θες να τα δεις δίπλα-δίπλα; Πρόσθεσέ τα στη σύγκριση —{" "}
              <button type="button" onClick={() => [top, ...alts].forEach((s) => !compare.includes(s.product.id) && toggleCompare(s.product.id))} className="text-eu-blue font-bold hover:underline">
                και τα {alts.length + 1} με ένα κλικ
              </button>
              .
            </span>
            <Link href="/sygkrisi" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue">
              <Scale className="size-4" aria-hidden /> {c.sygkrisi}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pick({ s, rank, noun, compact = false, onAdd, onQuick, onCompare, compared, onLike, liked }: { s: ReturnType<typeof evaluate>["ranked"][number]; rank: number; noun: string; compact?: boolean; onAdd: () => void; onQuick: () => void; onCompare: () => void; compared: boolean; onLike: () => void; liked: boolean }) {
  const p = s.product;
  const reasons = compact ? s.reasons.slice(0, 3) : s.reasons;
  const cons = compact ? s.cons.slice(0, 2) : s.cons;
  return (
    <article className={`bg-white rounded-2xl border-2 overflow-hidden ${rank === 1 ? "border-eu-yellow shadow-[var(--shadow-raised)]" : "border-eu-line"}`}>
      <div className={`px-5 py-3 flex items-center justify-between gap-3 ${rank === 1 ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface text-eu-ink"}`}>
        <span className="font-extrabold text-[length:var(--fs-15)] flex items-center gap-2">
          {rank === 1 ? <Sparkles className="size-4" aria-hidden /> : null}
          {rank === 1 ? `Η ${noun === "υπολογιστή" ? "πρότασή μας" : "πρότασή μας"}` : `Εναλλακτική ${rank - 1}`}
          {s.overBudget && <span className="rounded-full bg-eu-red text-white text-[length:var(--fs-13)] px-2 py-0.5">{c.ektos_proypologismoy}</span>}
        </span>
        <span className="font-extrabold text-[length:var(--fs-15)] tabular-nums">{s.pct}% ταίριασμα</span>
      </div>
      <div className={`p-5 grid gap-4 ${compact ? "" : "@2xl:grid-cols-[260px_minmax(0,1fr)]"}`}>
        <div className="grid gap-3">
          <Link href={`/proion/${p.slug}`} className="block">
            <ProductImage src={p.image} sizes="260px" />
          </Link>
          <div>
            <div className="font-bold text-eu-muted-2 text-[length:var(--fs-13)] uppercase tracking-wide">{p.brand}</div>
            <Link href={`/proion/${p.slug}`} className="block font-bold text-eu-ink text-[length:var(--fs-18)] leading-tight hover:text-eu-blue line-clamp-2 min-h-[2.4em]">
              {p.title}
            </Link>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-extrabold text-eu-ink text-[length:var(--fs-28)] leading-none">{priceShort(p.price)}</span>
              {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-15)]">{priceShort(p.wasPrice)}</s>}
            </div>
            <div className="text-eu-blue font-bold text-[length:var(--fs-14)] mt-1">ή 12 × {priceLong(instalment(p.price))} χωρίς κάρτα</div>
          </div>
        </div>
        <div className="grid gap-4 content-start">
          <div className="h-2 rounded-full bg-eu-surface-2 overflow-hidden">
            <div className={`h-full rounded-full ${s.pct >= 75 ? "bg-eu-green" : s.pct >= 50 ? "bg-eu-yellow" : "bg-eu-amber"}`} style={{ width: `${s.pct}%` }} />
          </div>
          <div>
            <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)] mb-2">{c.giati_soy_tairiazei}</div>
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {reasons.map((r) => (
                <li key={r} className="flex gap-2 text-[length:var(--fs-15)] text-eu-ink-2 leading-snug">
                  <Check className="size-5 text-eu-green shrink-0" aria-hidden /> {r}
                </li>
              ))}
            </ul>
          </div>
          {cons.length > 0 && (
            <div>
              <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)] mb-2">{c.ti_na_echeis_ypopsi}</div>
              <ul className="m-0 p-0 list-none grid gap-1.5">
                {cons.map((r) => (
                  <li key={r} className="flex gap-2 text-[length:var(--fs-15)] text-eu-ink-2 leading-snug">
                    <AlertTriangle className="size-5 text-eu-amber shrink-0" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={onQuick} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-yellow-dark">
              {c.agora_me_1_klik}
            </button>
            <button type="button" onClick={onAdd} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue">
              {c.sto_kalathi}
            </button>
            <button type="button" onClick={onCompare} aria-pressed={compared} className={`inline-flex items-center gap-1.5 rounded-full border-2 font-bold text-[length:var(--fs-14)] px-4 min-h-12 ${compared ? "border-eu-blue text-eu-blue bg-eu-chip" : "border-eu-line text-eu-ink-2 hover:border-eu-blue"}`}>
              <Scale className="size-4" aria-hidden /> {c.sygkrisi}
            </button>
            <button type="button" onClick={onLike} aria-pressed={liked} aria-label={c.lista_epithymion} className={`size-12 rounded-full border-2 inline-flex items-center justify-center ${liked ? "border-eu-red text-eu-red" : "border-eu-line text-eu-muted hover:text-eu-red"}`}>
              <Heart className="size-4" fill={liked ? "currentColor" : "none"} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
