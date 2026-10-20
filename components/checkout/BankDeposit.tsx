"use client";

import { useState } from "react";
import { Check, Copy, Landmark } from "lucide-react";
import { priceLong } from "@/lib/format";
import { formatIban, type BankAccount } from "@/lib/payments/bank-accounts";
import { logoBox } from "@/lib/cms/logo-trim";
import { sx } from "@/components/ui/sx";

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2500); } catch { /* χωρίς πρόσβαση στο πρόχειρο: ο πελάτης το επιλέγει με το χέρι */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={`Αντιγραφή ${label}`} className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line bg-white px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] hover:border-eu-blue">
      {done ? <><Check className="size-4" aria-hidden /> Αντιγράφηκε</> : <><Copy className="size-4" aria-hidden /> Αντιγραφή</>}
    </button>
  );
}

function Logo({ a }: { a: BankAccount }) {
  const box = logoBox(a.logoAspect, 1.6);
  const s = sx({ height: box.height, maxWidth: `min(${box.maxWidth}, 100%)` });
  return (
    <>
      {s.node}
      {/* eslint-disable-next-line @next/next/no-img-element -- λογότυπο από τη βιβλιοθήκη, μικρό και χωρίς ανάγκη βελτιστοποίησης */}
      <img src={a.logo} alt={a.bank} className={`block w-auto object-contain ${s.className}`} />
    </>
  );
}

/** Σελίδα επιτυχίας, πληρωμή «Κατάθεση σε τράπεζα»: ποσό, αιτιολογία και οι λογαριασμοί με αντιγραφή IBAN. */
export function BankDeposit({ accounts, number, total }: { accounts: BankAccount[]; number: string; total: number | null }) {
  if (!accounts.length) return null;
  return (
    <section aria-labelledby="bank-deposit" className="bg-white rounded-xl border-2 border-eu-blue p-5 grid gap-4 min-w-0">
      <div className="flex items-start gap-3">
        <Landmark className="size-7 text-eu-blue shrink-0" aria-hidden />
        <div className="min-w-0">
          <h2 id="bank-deposit" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)]">Στοιχεία κατάθεσης</h2>
          <p className="m-0 mt-1 text-eu-ink-2 text-[length:var(--fs-15)]">
            Κατέθεσε {total != null ? <b className="text-eu-ink">{priceLong(total)}</b> : "το ποσό της παραγγελίας"} σε έναν από τους λογαριασμούς, εντός 48 ωρών. Το απόθεμα κρατείται για σένα μέχρι τότε.
          </p>
        </div>
      </div>
      {number && (
        <div className="rounded-xl bg-eu-yellow/20 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-eu-ink-2 text-[length:var(--fs-15)] grow min-w-0">Αιτιολογία κατάθεσης: <b className="font-mono text-eu-ink text-[length:var(--fs-17)] break-words">{number}</b></span>
          <CopyBtn value={number} label="αιτιολογίας" />
        </div>
      )}
      <ul className="m-0 p-0 list-none grid gap-3">
        {accounts.map((a) => (
          <li key={a.iban} className="rounded-xl border border-eu-line p-4 grid gap-2 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              {a.logo && <Logo a={a} />}
              <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-16)] min-w-0 break-words">{a.bank}</span>
            </div>
            <span className="text-eu-ink-2 text-[length:var(--fs-14)]">Δικαιούχος: <b className="text-eu-ink">{a.holder}</b></span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-mono font-bold text-eu-navy text-[length:var(--fs-16)] break-words grow min-w-0">{formatIban(a.iban)}</span>
              <CopyBtn value={a.iban} label={`IBAN ${a.bank}`} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
