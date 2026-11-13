"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Pencil, Eye, MousePointerClick, Sparkles } from "lucide-react";
import { SLOTS } from "@/lib/promo/landing-blocks";
import type { PlacementInput } from "@/app/admin/(shell)/prosfores/actions";
import { sx } from "@/components/ui/sx";

type Row = PlacementInput & { id: string; impressions: number; clicks: number; promoLive: boolean | null; /** σχεδιασμένο banner: το χρώμα φόντου του για τη μικρογραφία */ designColor: string | null };
const ST: Record<string, string> = { draft: "Πρόχειρο", active: "Ενεργό", paused: "Σε παύση", archived: "Αρχείο" };

const live = (r: Row, now: number) => r.status === "active" && r.promoLive !== false && (!r.startsAt || +new Date(r.startsAt) <= now) && (!r.endsAt || +new Date(r.endsAt) > now);

/**
 * Οι θέσεις της βιτρίνας σε πυκνό πλέγμα: ανά θέση τι φαίνεται τώρα, τα banners της με προβολές/κλικ/CTR και «+ Banner».
 * Κάθε banner ανοίγει στον δικό του editor (/admin/prosfores/theseis/<id>).
 */
export function PlacementsEditor({ rows }: { rows: Row[] }) {
  const [now] = useState(() => Date.now());

  return (
    <div className="grid gap-4">
      <ul data-help="promo.slots" className="m-0 p-0 list-none grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {SLOTS.map((s) => {
          const list = rows.filter((r) => r.slot === s.key);
          const showing = list.filter((r) => live(r, now)).sort((a, b) => a.priority - b.priority)[0];
          return (
            <li key={s.key} className="rounded-2xl bg-white border border-eu-line p-3 grid gap-2 content-start min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)] leading-snug">{s.label}</h3><div className="text-eu-muted text-[length:var(--fs-12)]">{s.size}</div></div>
                <Link href={`/admin/prosfores/theseis/new?slot=${s.key}`} aria-label={`Νέο banner: ${s.label}`} className="shrink-0 inline-flex items-center gap-1 rounded-full border border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-13)] hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Banner</Link>
              </div>
              <p className={`m-0 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-13)] font-bold ${showing ? "bg-eu-green/10 text-eu-green" : "bg-eu-surface text-eu-muted"}`}>{showing ? `Τώρα φαίνεται: ${showing.title}` : "Κενή — δεν φαίνεται τίποτα"}</p>
              {list.length > 0 && (
                <ul className="m-0 p-0 list-none grid gap-1.5">
                  {list.map((r) => { const sThumb = sx(r.designColor ? { backgroundColor: r.designColor } : { backgroundImage: r.image ? `url("${r.image}")` : undefined }); return (
                    <li key={r.id}>
                      <Link href={`/admin/prosfores/theseis/${r.id}`} className="w-full text-left grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-eu-line p-1.5 hover:border-eu-blue">
                        {sThumb.node}
                        {r.designColor ? <span className={`h-10 rounded-lg border border-eu-line grid place-items-center ${sThumb.className}`} title="Σχεδιασμένο banner"><Sparkles className="size-4 text-white mix-blend-difference" aria-hidden /></span> : r.image ? <span className={`h-10 rounded-lg bg-center bg-cover border border-eu-line ${sThumb.className}`} aria-hidden /> : <span className="h-10 rounded-lg bg-eu-surface grid place-items-center text-eu-muted text-[length:var(--fs-12)]">χωρίς</span>}
                        <span className="min-w-0 grid">
                          <span className="font-bold text-eu-ink text-[length:var(--fs-13)] truncate">{r.title}</span>
                          <span className="text-eu-muted text-[length:var(--fs-12)] tabular-nums inline-flex flex-wrap gap-x-2">
                            <span>{ST[r.status]}{r.promoLive === false ? " · προσφορά ανενεργή" : ""}</span>
                            <span className="inline-flex items-center gap-0.5"><Eye className="size-3" aria-hidden />{r.impressions.toLocaleString("el-GR")}</span>
                            <span className="inline-flex items-center gap-0.5"><MousePointerClick className="size-3" aria-hidden />{r.clicks.toLocaleString("el-GR")}</span>
                            {r.impressions > 0 && <span>CTR {((r.clicks / r.impressions) * 100).toLocaleString("el-GR", { maximumFractionDigits: 2 })} %</span>}
                          </span>
                        </span>
                        <Pencil className="size-4 text-eu-muted mr-1" aria-label="Αλλαγή" />
                      </Link>
                    </li>
                  ); })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
