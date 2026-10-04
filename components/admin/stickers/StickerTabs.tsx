import Link from "next/link";

/** Καρτέλες της ενότητας: τα stickers και οι κανόνες εφαρμογής τους. */
export function StickerTabs({ active }: { active: "stickers" | "rules" }) {
  const tab = (on: boolean) => `inline-flex items-center rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] ${on ? "bg-white text-eu-navy shadow-sm" : "text-eu-ink-3 hover:text-eu-navy"}`;
  return (
    <nav aria-label="Stickers" className="flex flex-wrap gap-1 rounded-full bg-eu-surface p-1 w-fit max-w-full">
      <Link href="/admin/stickers" className={tab(active === "stickers")} aria-current={active === "stickers" ? "page" : undefined}>Stickers</Link>
      <Link href="/admin/stickers/kanones" className={tab(active === "rules")} aria-current={active === "rules" ? "page" : undefined}>Κανόνες εφαρμογής</Link>
    </nav>
  );
}
