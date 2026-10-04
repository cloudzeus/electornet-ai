"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { StickerSvg } from "@/components/stickers/StickerSvg";
import { StickerPicker } from "@/components/admin/stickers/StickerPicker";
import { fitWidth } from "@/lib/stickers/art";
import type { CardSticker } from "@/lib/stickers/layout";
import { addProductSticker, removeProductSticker, moveProductSticker, type ProductStickerDTO } from "@/app/admin/(shell)/catalog/actions";

const input = "rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)]";
const icon = "size-11 grid place-items-center rounded-full hover:bg-eu-surface text-eu-ink-3 disabled:opacity-40";
const SRC: Record<CardSticker["source"], string> = { promo: "από προσφορά", tag: "από ετικέτα", manual: "χειροκίνητο" };

/**
 * Stickers του προϊόντος: όσα μπαίνουν χειροκίνητα (με προαιρετικές ημερομηνίες και σειρά) και, για πληροφορία, όσα έρχονται
 * αυτόματα από προσφορές και ετικέτες. Στην κάρτα φαίνονται έως 2 (1 στο κινητό) με σειρά προτεραιότητας· η σελίδα τα δείχνει όλα.
 */
export function ProductStickersAdmin({ productId, initial, auto, canWrite }: { productId: string; initial: ProductStickerDTO[]; auto: CardSticker[]; canWrite: boolean }) {
  const [list, setList] = useState(initial);
  const [pick, setPick] = useState<string | null>(null);
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const add = () => { if (!pick) return; start(async () => { const r = await addProductSticker(productId, pick, from || null, to || null); setList(r.list); setErr(r.ok ? null : r.error ?? null); if (r.ok) { setPick(null); setFrom(""); setTo(""); } }); };
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("el-GR") : null);
  const thumb = (p: CardSticker["params"], id: string) => <StickerSvg p={{ ...p, size: p.art ? fitWidth(p.art, 44) : 44, rotate: 0, animation: "none" }} id={id} />;
  return (
    <div className="grid gap-3">
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Στην κάρτα φαίνονται έως <strong>2</strong> (1 στο κινητό), με σειρά: προσφορά → χειροκίνητα → ετικέτες· όσα περισσεύουν εναλλάσσονται. Τοποθετούνται αυτόματα σε ελεύθερες θέσεις — ποτέ πάνω στην καρδιά, στην έκπτωση ή στη γρήγορη προβολή. Η σελίδα του προϊόντος τα δείχνει όλα.</p>
      {auto.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
          {auto.map((s) => <li key={s.key} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-eu-line px-2 py-1"><span className="grid place-items-center h-12">{thumb(s.params, `auto-${s.key}`)}</span><span className="text-[length:var(--fs-12)] text-eu-muted">{SRC[s.source]}</span></li>)}
        </ul>
      )}
      {list.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2">
          {list.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-eu-line p-2">
              <span className="grid place-items-center h-12 w-16">{thumb(s.params, `m-${s.id}`)}</span>
              <span className="min-w-0 flex-1 grid"><span className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{s.name}</span><span className="text-eu-muted text-[length:var(--fs-12)]">{s.startsAt || s.endsAt ? `${d(s.startsAt) ?? "από τώρα"} → ${d(s.endsAt) ?? "χωρίς λήξη"}` : "πάντα"}</span></span>
              {canWrite && <>
                <button type="button" className={icon} disabled={pending || i === 0} onClick={() => start(async () => setList(await moveProductSticker(productId, s.id, -1)))} aria-label={`Πιο πάνω: ${s.name}`}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" className={icon} disabled={pending || i === list.length - 1} onClick={() => start(async () => setList(await moveProductSticker(productId, s.id, 1)))} aria-label={`Πιο κάτω: ${s.name}`}><ArrowDown className="size-4" aria-hidden /></button>
                <button type="button" className={`${icon} hover:text-eu-red`} disabled={pending} onClick={() => start(async () => setList(await removeProductSticker(productId, s.id)))} aria-label={`Αφαίρεση: ${s.name}`}><Trash2 className="size-4" aria-hidden /></button>
              </>}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="grid gap-2 rounded-xl bg-eu-surface p-3">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Νέο sticker στο προϊόν</span>
          <StickerPicker by="id" allowNone={false} value={pick} onChange={(v) => setPick(v)} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Από (προαιρετικό)<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Έως (προαιρετικό)<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
            <button type="button" onClick={add} disabled={!pick || pending} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Προσθήκη</button>
          </div>
          {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
        </div>
      )}
    </div>
  );
}
