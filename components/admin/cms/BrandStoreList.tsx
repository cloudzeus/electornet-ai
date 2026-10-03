"use client";

import Link from "next/link";
import { useDeferredValue, useState, useTransition } from "react";
import { ExternalLink, Plus, Search, Loader2, ChevronRight, Info } from "lucide-react";
import { createStoreAction } from "@/app/admin/(shell)/cms/brand-stores/actions";
import { StatusPill } from "@/components/admin/settings/ui";
import { logoBox } from "@/lib/cms/logo-trim";

export type StoreRow = { slug: string; name: string; logo: string | null; storeLogo: string | null; logoAspect: number | null; accent: string; bg: string; products: number; status: "live" | "changed" | "draft"; updatedAt: string; publishedAt: string | null; blocks: number };
export type BrandOption = { slug: string; name: string; products: number; logo: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ST = { live: ["live", "Δημοσιευμένη"], changed: ["incomplete", "Δημοσιευμένη · αλλαγές στο πρόχειρο"], draft: ["off", "Πρόχειρο — δεν φαίνεται"] } as const;
const date = (s: string) => new Date(s).toLocaleDateString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Mark({ name, logo, bg, accent }: { name: string; logo: string | null; bg?: string; accent?: string }) {
  return (
    <span className="shrink-0 size-14 rounded-xl border border-eu-line inline-flex items-center justify-center overflow-hidden" style={{ background: bg ?? "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- λογότυπο μάρκας (hotlink) */}
      {logo ? <img src={logo} alt="" className="max-h-8 max-w-[80%] object-contain" /> : <span className="font-heading font-extrabold text-[length:var(--fs-15)]" style={{ color: accent ?? "#0a3d91" }}>{name.slice(0, 3)}</span>}
    </span>
  );
}

export function BrandStoreList({ rows, brands }: { rows: StoreRow[]; brands: BrandOption[] }) {
  const [q, setQ] = useState("");
  const dq = norm(useDeferredValue(q).trim());
  const [creating, setCreating] = useState<string | null>(null);
  const [, start] = useTransition();
  const hits = dq ? brands.filter((b) => norm(b.name).includes(dq)) : brands.slice(0, 12);
  return (
    <div className="grid gap-6 min-w-0">
      <header className="grid gap-2">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Περιεχόμενο</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Σελίδες μαρκών</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Η «βιτρίνα» κάθε κατασκευαστή μέσα στο e-shop (/brands/…): χρώματα της μάρκας, hero με το κορυφαίο προϊόν, νέα προϊόντα, σειρές, προσφορές, τεχνολογία, εγγύηση. Μάρκα χωρίς σελίδα δείχνει απλώς τον κατάλογό της.</p>
        <p className="m-0 inline-flex items-start gap-2 text-eu-ink-2 text-[length:var(--fs-14)] max-w-[75ch]"><Info className="size-4 mt-0.5 shrink-0 text-eu-blue" aria-hidden /><span>Οι αλλαγές αποθηκεύονται αυτόματα ως <b>πρόχειρο</b>. Οι πελάτες βλέπουν μόνο ό,τι <b>δημοσιεύσεις</b> — μέχρι τότε η σελίδα μένει όπως ήταν.</span></p>
      </header>

      {rows.some((r) => r.storeLogo) && (
        <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3" aria-labelledby="h-logos">
          <div>
            <h3 id="h-logos" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Ομοιομορφία λογοτύπων</h3>
            <p className="m-0 mt-0.5 text-eu-muted text-[length:var(--fs-14)]">Όλα τα λογότυπα με το ίδιο οπτικό βάρος, όπως στις σελίδες. Αν κάποιο φαίνεται μικρό ή με φόντο, άνοιξε τη σελίδα του και πάτα «Περικοπή & ομοιομορφία».</p>
          </div>
          <ul className="m-0 p-0 list-none flex flex-wrap items-center gap-x-8 gap-y-4">
            {rows.filter((r) => r.storeLogo).map((r) => { const box = logoBox(r.logoAspect ?? undefined, 2); return (
              <li key={r.slug} className="grid justify-items-start gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- λογότυπο */}
                <img src={r.storeLogo!} alt={r.name} style={{ height: box.height, maxWidth: box.maxWidth }} className="block w-auto object-contain" />
                <span className={`text-[length:var(--fs-13)] font-bold ${r.logoAspect ? "text-eu-muted" : "text-eu-amber"}`}>{r.name}{r.logoAspect ? "" : " · χωρίς περικοπή"}</span>
              </li>
            ); })}
          </ul>
        </section>
      )}

      <section className="grid gap-3" aria-labelledby="h-stores">
        <h3 id="h-stores" className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Σελίδες ({rows.length})</h3>
        {rows.length ? (
          <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 @6xl:grid-cols-3 gap-3">
            {rows.map((r) => {
              const [s, t] = ST[r.status];
              return (
                <li key={r.slug} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
                  <div className="flex items-start gap-3 min-w-0">
                    <Mark name={r.name} logo={r.logo} bg={r.bg} accent={r.accent} />
                    <div className="min-w-0 grid gap-1">
                      <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{r.name}</div>
                      <StatusPill status={s} text={t} />
                    </div>
                    <span className="ml-auto shrink-0 size-6 rounded-full border border-eu-line" style={{ background: r.accent }} title={`Χρώμα μάρκας ${r.accent}`} aria-hidden />
                  </div>
                  <div className="text-eu-muted text-[length:var(--fs-13)]">{r.blocks} ενότητες · {r.products} προϊόντα στον κατάλογο · αλλαγή {date(r.updatedAt)}{r.publishedAt ? ` · δημοσίευση ${date(r.publishedAt)}` : ""}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/cms/brand-stores/${r.slug}`} className="inline-flex items-center justify-center gap-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue grow @md:grow-0">Επεξεργασία <ChevronRight className="size-4" aria-hidden /></Link>
                    {r.status !== "draft" && <a href={`/brands/${r.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 rounded-full border-2 border-eu-line font-bold text-[length:var(--fs-14)] px-4 min-h-11 hover:border-eu-navy grow @md:grow-0">Στο site <ExternalLink className="size-4" aria-hidden /></a>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 rounded-2xl bg-white border border-eu-line p-6 text-eu-muted">Καμία σελίδα μάρκας ακόμη. Ξεκίνα από μια μάρκα παρακάτω.</p>
        )}
      </section>

      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4" aria-labelledby="h-new">
        <div>
          <h3 id="h-new" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Νέα σελίδα μάρκας</h3>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-14)]">Διάλεξε μάρκα: η σελίδα ξεκινά ως πρόχειρο με το ακριβότερο προϊόν στο hero, τα νεότερα στα «Νέα προϊόντα» και έτοιμη ενότητα εγγύησης. Μετά πατάς «Στυλ από το επίσημο site» για τα χρώματα.</p>
        </div>
        <label className="relative block max-w-xl">
          <span className="sr-only">Αναζήτηση μάρκας</span>
          <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-eu-muted pointer-events-none" aria-hidden />
          <input type="text" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Γράψε μάρκα… (${brands.length} χωρίς σελίδα)`} className="w-full rounded-full border-2 border-eu-line bg-white pl-11 pr-4 min-h-12 text-[length:var(--fs-16)] outline-none focus:border-eu-blue" />
        </label>
        <ul className="m-0 p-0 list-none grid grid-cols-1 @lg:grid-cols-2 @4xl:grid-cols-3 gap-2">
          {hits.slice(0, 30).map((b) => (
            <li key={b.slug}>
              <button
                type="button"
                disabled={creating !== null}
                onClick={() => { setCreating(b.slug); start(() => createStoreAction(b.slug)); }}
                className="w-full flex items-center gap-3 rounded-xl border-2 border-eu-line px-3 py-2 min-h-14 text-left hover:border-eu-navy disabled:opacity-50"
              >
                <Mark name={b.name} logo={b.logo} />
                <span className="grid min-w-0 flex-1"><span className="font-bold text-eu-ink text-[length:var(--fs-15)] truncate">{b.name}</span><span className="text-eu-muted text-[length:var(--fs-13)]">{b.products} προϊόντα</span></span>
                {creating === b.slug ? <Loader2 className="size-5 animate-spin text-eu-blue" aria-hidden /> : <Plus className="size-5 text-eu-blue shrink-0" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        {!dq && brands.length > 12 && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Εμφανίζονται οι 12 μάρκες με τα περισσότερα προϊόντα — γράψε για να βρεις άλλη.</p>}
        {dq && !hits.length && <p className="m-0 text-eu-muted">Καμία μάρκα για «{q}».</p>}
      </section>
    </div>
  );
}
