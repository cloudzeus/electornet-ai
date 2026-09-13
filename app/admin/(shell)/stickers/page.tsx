import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { listStickers } from "./actions";
import { STICKER_PRESETS } from "@/lib/stickers/model";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import { StickerListActions } from "@/components/admin/stickers/StickerListActions";

export const metadata = { title: "Stickers" };
export const dynamic = "force-dynamic";

/** Saved stickers + brand templates to start from. */
export default async function StickersPage() {
  await requirePermission("catalog.promos.write");
  const stickers = await listStickers();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Προσφορές</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Stickers προϊόντων</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Σχεδίασε SVG stickers (1+1, δώρο, έκπτωση, διαγωνισμός…) που μπαίνουν πάνω στις κάρτες προϊόντων από τους κανόνες προσφορών και τις καμπάνιες. Εξάγονται και ως SVG/PNG στη βιβλιοθήκη media.</p>
        </div>
        <Link href="/admin/stickers/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέο sticker</Link>
      </div>
      <section className="grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Αποθηκευμένα ({stickers.length})</h3>
        {stickers.length === 0 ? (
          <p className="m-0 rounded-2xl bg-white border border-eu-line p-6 text-eu-muted text-[length:var(--fs-15)]">Κανένα sticker ακόμη. Ξεκίνα από ένα πρότυπο παρακάτω.</p>
        ) : (
          <ul className="m-0 p-0 list-none grid grid-cols-2 @lg:grid-cols-3 @5xl:grid-cols-4 gap-3">
            {stickers.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 hover:border-eu-blue transition-colors">
                <Link href={`/admin/stickers/${s.id}`} className="grid place-items-center h-36 rounded-xl bg-[repeating-conic-gradient(#eef0f4_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                  <StickerSvg p={{ ...s.params, size: Math.min(120, s.params.size) }} id={`l-${s.id}`} />
                </Link>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-bold text-eu-ink text-[length:var(--fs-15)] truncate">{s.name}</div><div className="text-eu-muted text-[length:var(--fs-13)] font-mono truncate">{s.key}</div></div>
                  {!s.active && <span className="rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-bold text-eu-muted">ανενεργό</span>}
                </div>
                <StickerListActions id={s.id} name={s.name} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-3">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Πρότυπα brand</h3>
        <ul className="m-0 p-0 list-none grid grid-cols-2 @lg:grid-cols-4 @5xl:grid-cols-8 gap-3">
          {STICKER_PRESETS.map((t) => (
            <li key={t.key}>
              <Link href={`/admin/stickers/new?preset=${t.key}`} className="grid gap-2 rounded-2xl bg-white border border-eu-line p-3 hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
                <span className="grid place-items-center h-24"><StickerSvg p={{ ...t.params, size: Math.min(88, t.params.size) }} id={`p-${t.key}`} /></span>
                <span className="text-center font-bold text-eu-ink text-[length:var(--fs-14)]">{t.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
