import type { Product } from "@/lib/data/types";
import { discountPct, priceShort } from "@/lib/format";

export type Sticker =
  | { kind: "discount"; pct: number; save: number }
  | { kind: "gift"; label: string }
  | { kind: "new" }
  | { kind: "renew"; grade?: "A" | "B" }
  | { kind: "last"; n: number }
  | { kind: "ends"; days: number }
  | { kind: "pick"; store: string }
  | { kind: "bogo"; label: string }
  | { kind: "bundle"; with: string }
  | { kind: "contest"; label: string }
  | { kind: "cashback"; amount: number; by: string };

/**
 * @dynamic Sticker system for offers. Every sticker is derived from data
 * (price rule, stock, campaign end, store pick), never hand-placed:
 *  · discount → red, with the euro saving (Omnibus stays as the price line)
 *  · gift → yellow ribbon, · new → navy, · renew → green
 *  · «Τελευταία N» when stockLeft ≤ 5, · «Λήγει σε N ημ.» from the deal's end
 *  · «Επιλογή καταστήματος» → navy stamp with the store name
 *  · promos from CMS campaigns: «1+1» burst, «Δώρο + προϊόν» ribbon,
 *    «Διαγωνισμός» star pill, «Επιστροφή N €» cashback pill.
 * Each kind has a fixed slot on the card so stickers never collide.
 */
export function stickersFor(p: Product, dealEndsAt?: string, now = Date.now()): Sticker[] {
  const out: Sticker[] = [];
  const pct = discountPct(p.price, p.wasPrice);
  if (p.badge?.kind === "discount" && pct !== null && p.wasPrice) out.push({ kind: "discount", pct, save: Math.round(p.wasPrice - p.price) });
  if (p.badge?.kind === "gift") out.push({ kind: "gift", label: p.badge.label });
  if (p.badge?.kind === "new") out.push({ kind: "new" });
  if (p.badge?.kind === "renew") out.push({ kind: "renew", grade: p.badge.grade });
  else if (p.isRenew) out.push({ kind: "renew" });
  if (p.stockLeft !== undefined && p.stockLeft <= 5) out.push({ kind: "last", n: p.stockLeft });
  if (dealEndsAt) {
    const days = Math.ceil((new Date(dealEndsAt).getTime() - now) / 86400000);
    if (days >= 0 && days <= 3) out.push({ kind: "ends", days });
  }
  if (p.storePick) out.push({ kind: "pick", store: p.storePick });
  if (p.promo?.kind === "bogo") out.push({ kind: "bogo", label: p.promo.label ?? "1+1" });
  if (p.promo?.kind === "bundle") out.push({ kind: "bundle", with: p.promo.with });
  if (p.promo?.kind === "contest") out.push({ kind: "contest", label: p.promo.label });
  if (p.promo?.kind === "cashback") out.push({ kind: "cashback", amount: p.promo.amount, by: p.promo.by });
  return out;
}

/** Top-left corner: the one "value" sticker (discount / new / renew). */
export function CornerSticker({ s, compact = false }: { s: Sticker; compact?: boolean }) {
  if (s.kind === "discount")
    return (
      <span className="eu-shimmer inline-flex flex-col items-start bg-eu-red text-white rounded-br-2xl rounded-tl-2xl px-3 py-1.5 leading-none shadow-[0_6px_16px_rgba(214,40,40,.35)]">
        <span className="font-extrabold text-[length:var(--fs-19)] tracking-[-0.02em]">−{s.pct}%</span>
        {!compact && <span className="font-bold text-[length:var(--fs-13)] mt-1 opacity-95">κερδίζεις {priceShort(s.save)}</span>}
      </span>
    );
  if (s.kind === "new") return <span className="inline-flex bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] rounded-br-2xl rounded-tl-2xl px-3 py-2 leading-none">Νέο</span>;
  if (s.kind === "renew") return <span className="inline-flex bg-eu-green text-white font-extrabold text-[length:var(--fs-14)] rounded-br-2xl rounded-tl-2xl px-3 py-2 leading-none">Renew{s.grade ? ` · ${s.grade}` : ""}</span>;
  return null;
}

/** «1+1» starburst, bottom-right of the photo — rotates slightly on hover. */
export function BurstSticker({ s }: { s: Sticker }) {
  if (s.kind !== "bogo" && s.kind !== "cashback") return null;
  const big = s.kind === "bogo" ? s.label : `−${s.amount} €`;
  const small = s.kind === "bogo" ? "δώρο" : s.by;
  return (
    <span className="pointer-events-none absolute right-3 bottom-12 size-[84px] grid place-items-center text-center rotate-[-8deg] transition-transform duration-300 group-hover/card:rotate-[4deg] group-hover/card:scale-105" aria-label={`${big} ${small}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full drop-shadow-[0_6px_10px_rgba(18,42,88,.25)]" aria-hidden>
        <polygon fill={s.kind === "bogo" ? "var(--eu-yellow)" : "var(--eu-green)"} points="50,2 58,14 72,8 74,23 89,24 84,38 97,45 87,55 95,68 80,72 80,87 66,84 60,98 50,88 40,98 34,84 20,87 20,72 5,68 13,55 3,45 16,38 11,24 26,23 28,8 42,14" />
      </svg>
      <span className={`relative leading-none ${s.kind === "bogo" ? "text-eu-navy" : "text-white"}`}>
        <span className="block font-heading font-extrabold text-[length:var(--fs-20)] tracking-[-0.03em]">{big}</span>
        <span className="block font-bold text-[length:var(--fs-14)] leading-none mt-0.5 px-1">{small}</span>
      </span>
    </span>
  );
}

/** Contest pill (navy with star) under the corner sticker. */
export function ContestSticker({ s }: { s: Sticker }) {
  if (s.kind !== "contest") return null;
  return (
    <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-eu-navy text-eu-yellow font-extrabold text-[length:var(--fs-13)] px-2.5 py-1 leading-none shadow-[0_4px_12px_rgba(18,42,88,.25)] eu-shimmer">
      <span aria-hidden>★</span> {s.label}
    </span>
  );
}

/** Diagonal yellow ribbon, top-right corner (gift / bundle / store pick). */
export function RibbonSticker({ s }: { s: Sticker }) {
  const text = s.kind === "gift" ? "Δώρο" : s.kind === "bundle" ? "Δώρο μαζί" : s.kind === "pick" ? "Επιλογή καταστήματος" : null;
  const title = s.kind === "gift" ? `Δώρο ${s.label}` : s.kind === "bundle" ? `Δώρο μαζί: ${s.with}` : s.kind === "pick" ? `Επιλογή καταστήματος · ${s.store}` : "";
  if (!text) return null;
  return (
    <span className="pointer-events-none absolute -right-14 top-5 w-48 rotate-45 bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-13)] text-center py-1.5 shadow-[0_4px_12px_rgba(18,42,88,.2)] eu-shimmer" aria-label={title} title={title}>
      {text}
    </span>
  );
}

/** Small urgency pills next to availability (last units / ends in). */
export function UrgencyPill({ s }: { s: Sticker }) {
  if (s.kind === "last") return <span className="inline-flex items-center gap-1 rounded-full bg-eu-red/10 text-eu-red font-extrabold text-[length:var(--fs-13)] px-2 py-1 leading-none">Τελευταία {s.n}</span>;
  if (s.kind === "ends") return <span className="inline-flex items-center gap-1 rounded-full bg-eu-yellow/60 text-eu-navy font-extrabold text-[length:var(--fs-13)] px-2 py-1 leading-none">{s.days === 0 ? "Λήγει σήμερα" : s.days === 1 ? "Λήγει αύριο" : `Λήγει σε ${s.days} ημ.`}</span>;
  return null;
}
