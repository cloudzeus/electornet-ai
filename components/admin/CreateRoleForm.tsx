"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createRole } from "@/app/admin/(shell)/roles/actions";

export function CreateRoleForm() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue">
        <Plus className="size-4" aria-hidden /> Νέος ρόλος
      </button>
      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="new-role">
          <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label="Κλείσιμο" onClick={() => setOpen(false)} />
          <form
            action={(fd) =>
              start(async () => {
                const r = await createRole(fd);
                if (r.ok) setOpen(false);
                else setError(r.error ?? "Σφάλμα");
              })
            }
            className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(480px,92vw)] bg-white rounded-t-3xl @md:rounded-3xl p-6 grid gap-4 shadow-[var(--shadow-overlay)]"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 id="new-role" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">Νέος ρόλος</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {error && <p className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">{error}</p>}
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
              Όνομα
              <input name="name" required placeholder="π.χ. Marketing" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
            </label>
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
              Κλειδί <span className="font-normal text-eu-muted">(προαιρετικό, λατινικά)</span>
              <input name="key" placeholder="marketing" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
            </label>
            <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
              Περιγραφή
              <textarea name="description" rows={2} className="rounded-xl border-2 border-eu-line px-3 py-2 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
            </label>
            <button type="submit" disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue disabled:opacity-50">
              {pending ? "Αποθήκευση…" : "Δημιουργία"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
