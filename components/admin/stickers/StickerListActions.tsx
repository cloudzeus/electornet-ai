"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteSticker } from "@/app/admin/(shell)/stickers/actions";

export function StickerListActions({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Link href={`/admin/stickers/${id}`} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy"><Pencil className="size-4" aria-hidden /> Επεξεργασία</Link>
      <button type="button" disabled={pending} onClick={() => confirm(`Διαγραφή «${name}»;`) && start(async () => { await deleteSticker(id); })} aria-label={`Διαγραφή ${name}`} className="size-10 rounded-full inline-flex items-center justify-center text-eu-muted hover:bg-eu-red/10 hover:text-eu-red disabled:opacity-50"><Trash2 className="size-4" aria-hidden /></button>
    </div>
  );
}
