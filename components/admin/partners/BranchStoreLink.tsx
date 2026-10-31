"use client";

import { useState, useTransition } from "react";
import { linkBranchStore } from "@/app/admin/(shell)/synergates/actions";

export type StoreOption = { id: string; label: string; taken: boolean; near: boolean };

/** Σύνδεση υποκαταστήματος SoftOne με κατάστημα του eshop. Πρώτα τα καταστήματα της ίδιας πόλης/ΤΚ. */
export function BranchStoreLink({ branchId, storeId, options }: { branchId: string; storeId: string | null; options: StoreOption[] }) {
  const [value, setValue] = useState(storeId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const near = options.filter((o) => o.near), rest = options.filter((o) => !o.near);
  const opt = (o: StoreOption) => <option key={o.id} value={o.id}>{o.label}{o.taken && o.id !== storeId ? " (συνδεδεμένο αλλού)" : ""}</option>;
  return (
    <div className="grid gap-1 min-w-0">
      <label className="grid gap-1 min-w-0">
        <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Κατάστημα στο eshop</span>
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setErr(null);
            start(async () => {
              const r = await linkBranchStore(branchId, next || null);
              if (r.ok) setValue(next); else setErr(r.error);
            });
          }}
          className="min-h-11 rounded-lg border border-eu-line px-3 text-[length:var(--fs-14)] w-full min-w-0 max-w-full bg-white"
        >
          <option value="">— χωρίς κατάστημα —</option>
          {near.length > 0 && <optgroup label="Στην ίδια πόλη / ΤΚ">{near.map(opt)}</optgroup>}
          <optgroup label="Όλα τα καταστήματα">{rest.map(opt)}</optgroup>
        </select>
      </label>
      {err && <p role="alert" className="m-0 text-eu-red text-[length:var(--fs-13)]">{err}</p>}
    </div>
  );
}
