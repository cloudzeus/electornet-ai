import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import { StickerTabs } from "@/components/admin/stickers/StickerTabs";
import { fitWidth } from "@/lib/stickers/art";
import type { StickerParams } from "@/lib/stickers/model";
import type { PromoTarget } from "@/lib/promo/engine";

export const metadata = { title: "Κανόνες stickers" };
export const dynamic = "force-dynamic";

const d = (x: Date | null) => (x ? x.toLocaleDateString("el-GR") : null);

/** Γενικοί κανόνες: ποιο sticker μπαίνει σε ποιες μάρκες / κατηγορίες / προϊόντα. */
export default async function StickerRulesPage() {
  await requirePermission("catalog.promos.write");
  const rules = await db.stickerRule.findMany({ orderBy: [{ active: "desc" }, { priority: "asc" }, { createdAt: "desc" }], include: { sticker: { select: { name: true, params: true } } } }).catch(() => null);
  const now = new Date();
  return (
    <div className="grid gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Κανόνες εφαρμογής stickers</h2>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] max-w-[75ch]">Ένα sticker σε όλα τα προϊόντα μιας μάρκας, μιας κατηγορίας (μαζί με τις υποκατηγορίες), μάρκας μέσα σε κατηγορία ή επιλεγμένων προϊόντων — με εξαιρέσεις, εύρος τιμής, διαθεσιμότητα και ημερομηνίες.</p>
        </div>
        <Link href="/admin/stickers/kanones/new" className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέος κανόνας</Link>
      </div>
      <StickerTabs active="rules" />
      {rules === null ? <p className="m-0 rounded-xl bg-eu-yellow/20 px-3 py-2 text-[length:var(--fs-14)]">Ο πίνακας κανόνων δεν υπάρχει ακόμη στη βάση — χρειάζεται εφαρμογή του σχήματος.</p>
        : !rules.length ? <p className="m-0 rounded-2xl bg-white border border-eu-line p-6 text-eu-muted text-[length:var(--fs-15)]">Κανένας κανόνας ακόμη. Π.χ. «Eco» σε όλα τα πλυντήρια Α κλάσης, «Premium» σε τηλεοράσεις άνω των 1.500 €.</p>
        : (
          <ul className="m-0 p-0 list-none grid gap-2">
            {rules.map((r) => {
              const t = (r.targets as unknown as PromoTarget[]) ?? [], params = r.sticker.params as unknown as StickerParams;
              const live = r.active && !(r.startsAt && r.startsAt > now) && !(r.endsAt && r.endsAt < now);
              const count = (k: PromoTarget["kind"]) => t.filter((x) => x.kind === k && !x.exclude).length;
              const what = [count("category") && `${count("category")} κατηγορίες`, count("brand") && `${count("brand")} μάρκες`, count("brandcat") && `${count("brandcat")} μάρκα σε κατηγορία`, count("product") && `${count("product")} προϊόντα`, t.some((x) => x.exclude) && `${t.filter((x) => x.exclude).length} εξαιρέσεις`].filter(Boolean).join(" · ");
              return (
                <li key={r.id}><Link href={`/admin/stickers/kanones/${r.id}`} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-white border p-3 hover:border-eu-blue ${live ? "border-eu-line" : "border-eu-line opacity-70"}`}>
                  <span className="grid place-items-center w-20 h-14 shrink-0"><StickerSvg p={{ ...params, size: params.art ? fitWidth(params.art, 52) : 52, rotate: 0, animation: "none" }} id={`r-${r.id}`} /></span>
                  <span className="min-w-0 flex-1 grid gap-0.5">
                    <span className="font-bold text-eu-ink text-[length:var(--fs-15)] break-words">{r.name}</span>
                    <span className="text-eu-muted text-[length:var(--fs-13)]">{what || "μόνο εύρος τιμής"}{r.minPrice != null || r.maxPrice != null ? ` · ${r.minPrice ?? 0}–${r.maxPrice ?? "∞"} €` : ""}{r.onlyInStock ? " · μόνο διαθέσιμα" : ""}</span>
                  </span>
                  <span className="text-[length:var(--fs-13)] text-eu-ink-3 tabular-nums">{d(r.startsAt) || d(r.endsAt) ? `${d(r.startsAt) ?? "τώρα"} → ${d(r.endsAt) ?? "χωρίς λήξη"}` : "πάντα"} · προτερ. {r.priority}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${live ? "bg-eu-green/12 text-eu-ink" : "bg-eu-surface text-eu-muted"}`}>{live ? "Ισχύει" : !r.active ? "Ανενεργός" : r.endsAt && r.endsAt < now ? "Έληξε" : "Προγραμματισμένος"}</span>
                </Link></li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
