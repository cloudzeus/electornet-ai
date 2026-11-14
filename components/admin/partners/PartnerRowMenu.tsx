"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Menu } from "@base-ui/react/menu";
import { ExternalLink, Loader2, MoreVertical, Store, Trash2 } from "lucide-react";
import { deletePartner, setPartnerCooperating } from "@/app/admin/(shell)/synergates/actions";

const item = "flex items-center gap-2 min-h-11 px-3 rounded-lg text-[length:var(--fs-14)] text-eu-ink cursor-pointer outline-none data-[highlighted]:bg-eu-chip";

/** Διακόπτης «Συνεργαζόμενο κατάστημα» και μενού ενεργειών μιας γραμμής της λίστας συνεργατών. */
export function PartnerRowMenu({ id, name, cooperating }: { id: string; name: string; cooperating: boolean }) {
  const [on, setOn] = useState(cooperating);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const toggle = (v: boolean) => { setOn(v); setErr(""); start(async () => { const r = await setPartnerCooperating(id, v); if (!r.ok) { setOn(!v); setErr(r.error); } }); };
  const del = () => {
    if (!window.confirm(`Διαγραφή του «${name}» από τη βάση του eshop;\n\nΣβήνονται μαζί τα υποκαταστήματα, οι επαφές και οι λογαριασμοί του στην πύλη. Τα καταστήματά του στο eshop μένουν, χωρίς μέλος. Στο SoftOne δεν αλλάζει τίποτα: αν είναι ακόμη μέλος εκεί, η επόμενη «Εισαγωγή από SoftOne» θα τον ξαναφέρει.`)) return;
    setErr(""); start(async () => { const r = await deletePartner(id); if (!r.ok) setErr(r.error); });
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <label className="inline-flex items-center gap-2 min-h-11 cursor-pointer text-[length:var(--fs-13)] font-bold text-eu-ink">
        <input type="checkbox" role="switch" checked={on} disabled={pending} onChange={(e) => toggle(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-eu-line transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue peer-focus-visible:ring-offset-2 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
        <span className={on ? "" : "text-eu-ink-3"}>{on ? "Συνεργαζόμενο" : "Όχι συνεργαζόμενο"}</span>
      </label>
      <Menu.Root>
        <Menu.Trigger aria-label={`Ενέργειες για ${name}`} className="inline-grid place-items-center size-11 rounded-full text-eu-ink-2 hover:bg-eu-chip data-[popup-open]:bg-eu-chip">
          {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <MoreVertical className="size-5" aria-hidden />}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} className="z-50">
            <Menu.Popup className="min-w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-eu-line bg-white p-1 shadow-lg outline-none">
              <Menu.LinkItem render={<Link href={`/admin/synergates/${id}`} />} className={item}><ExternalLink className="size-4 shrink-0 text-eu-ink-3" aria-hidden />Άνοιγμα καρτέλας</Menu.LinkItem>
              <Menu.Item onClick={() => toggle(!on)} className={item}><Store className="size-4 shrink-0 text-eu-ink-3" aria-hidden />{on ? "Δεν είναι συνεργαζόμενο κατάστημα" : "Είναι συνεργαζόμενο κατάστημα"}</Menu.Item>
              <Menu.Separator className="my-1 h-px bg-eu-line" />
              <Menu.Item onClick={del} className={`${item} text-eu-red`}><Trash2 className="size-4 shrink-0" aria-hidden />Διαγραφή από τη βάση μας</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {err && <p role="alert" className="m-0 basis-full text-right text-[length:var(--fs-13)] font-bold text-eu-red">{err}</p>}
    </div>
  );
}
