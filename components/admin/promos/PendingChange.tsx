"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X, Hourglass } from "lucide-react";
import { approveAction, bulkAction } from "@/app/admin/(shell)/prosfores/actions";

/** Αλλαγή (ή νέα προσφορά) που περιμένει έγκριση δεύτερου προσώπου. Μέχρι τότε ισχύει η εγκεκριμένη έκδοση. */
export function PendingChange({ id, summary, by, at, canApprove, isNew }: { id: string; summary: string; by: string | null; at: string; canApprove: boolean; isNew: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const approve = () => start(async () => { const r = await approveAction(id); setMsg(r.ok ? "Εγκρίθηκε και δημοσιεύτηκε." : r.error ?? "Δεν εγκρίθηκε."); router.refresh(); });
  const reject = () => start(async () => { if (!confirm(isNew ? "Επιστροφή σε πρόχειρο;" : "Απόρριψη της αλλαγής; Μένει η τρέχουσα έκδοση.")) return; await bulkAction([id], "reject"); setMsg("Απορρίφθηκε."); router.refresh(); });
  return (
    <div role="status" className="rounded-2xl border-2 border-eu-yellow bg-eu-yellow/15 p-4 grid gap-2">
      <div className="font-extrabold text-eu-navy text-[length:var(--fs-15)] inline-flex items-center gap-1.5"><Hourglass className="size-4" aria-hidden /> {isNew ? "Αναμένει έγκριση για δημοσίευση" : "Αλλαγή αναμένει έγκριση — μέχρι τότε ισχύει η τρέχουσα έκδοση"}</div>
      <div className="text-eu-ink-2 text-[length:var(--fs-14)]">{summary}{by && <> · από <strong>{by}</strong></>} · {new Date(at).toLocaleString("el-GR")}</div>
      {canApprove && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={approve} className="inline-flex items-center gap-1 rounded-full bg-eu-green text-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><Check className="size-4" aria-hidden /> Έγκριση</button>
          <button type="button" disabled={busy} onClick={reject} className="inline-flex items-center gap-1 rounded-full border-2 border-eu-red text-eu-red px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50"><X className="size-4" aria-hidden /> Απόρριψη</button>
        </div>
      )}
      {msg && <p className="m-0 font-semibold text-[length:var(--fs-14)]">{msg}</p>}
    </div>
  );
}
