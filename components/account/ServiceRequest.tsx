"use client";

import { useState } from "react";
import { Wrench, Camera, Check, CalendarClock } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("serviceRequest");

/**
 * @dynamic Fault report / service booking for a device: symptom, photo or
 * video, preferred slot; in warranty → free pickup or technician visit.
 * Demo: local confirmation with a ticket number; production: SoftOne SRVJOB
 * + store calendar, SMS/email confirmation, status in the account.
 */
export function ServiceRequest({ device }: { device: { title: string; serial?: string; inWarranty: boolean } }) {
  const [sent, setSent] = useState<string | null>(null);
  const [symptom, setSymptom] = useState("");
  const [slot, setSlot] = useState("Πρωί 9–13");
  const [mode, setMode] = useState<"visit" | "pickup" | "store">("visit");
  if (sent)
    return (
      <div className="rounded-2xl bg-eu-green/10 border border-eu-green/30 p-5 flex items-start gap-3">
        <span className="size-10 shrink-0 rounded-full bg-eu-green text-white inline-flex items-center justify-center">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="text-[length:var(--fs-15)] text-eu-ink-2">
          <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">Το αίτημα #{sent} καταχωρήθηκε</div>
          {c.tha_se_kalesei_o}
        </div>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(`SRV-${Math.floor(Math.random() * 90000 + 10000)}`);
      }}
      className="rounded-2xl bg-eu-navy text-white p-5 @md:p-6 grid gap-4 relative overflow-hidden isolate"
    >
      <span className="eu-ambient" aria-hidden />
      <div className="relative">
        <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
          <Wrench className="size-3.5" aria-hidden /> {c.dilosi_vlavis_service}
        </div>
        <h2 className="m-0 mt-1 font-heading font-bold text-[length:var(--fs-22)] leading-tight">{device.title}</h2>
        <p className="m-0 mt-1 text-eu-on-dark-2 text-[length:var(--fs-14)]">
          {device.serial ? `S/N ${device.serial} · ` : ""}
          {device.inWarranty ? "Εντός εγγύησης: επίσκεψη τεχνικού ή παραλαβή χωρίς χρέωση." : "Εκτός εγγύησης: κόστος διάγνωσης 25 €, συμψηφίζεται με την επισκευή."}
        </p>
      </div>
      <label className="relative grid gap-1.5">
        <span className="font-bold text-[length:var(--fs-15)]">Τι συμβαίνει;</span>
        <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} required rows={3} placeholder={c.p_ch_den_styvei} className="rounded-xl bg-white text-eu-ink px-3 py-2.5 text-[length:var(--fs-16)] outline-none focus:ring-2 ring-eu-yellow" />
      </label>
      <div className="relative grid grid-cols-1 @md:grid-cols-[auto_minmax(0,1fr)] gap-3 items-start">
        <label className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-4 min-h-12 font-bold text-[length:var(--fs-15)] cursor-pointer hover:border-white">
          <Camera className="size-4" aria-hidden /> {c.fotografia_vinteo}
          <input type="file" accept="image/*,video/*" className="sr-only" />
        </label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={c.tropos_exypiretisis}>
          {[
            ["visit", "Επίσκεψη τεχνικού"],
            ["pickup", "Παραλαβή από το σπίτι"],
            ["store", "Στο κατάστημα"],
          ].map(([v, l]) => (
            <label key={v} className={`rounded-xl px-3 min-h-12 inline-flex items-center justify-center text-center text-[length:var(--fs-14)] font-bold cursor-pointer ${mode === v ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}>
              <input type="radio" name="mode" className="sr-only" checked={mode === v} onChange={() => setMode(v as typeof mode)} />
              {l}
            </label>
          ))}
        </div>
      </div>
      <div className="relative flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-15)] font-bold">
          <CalendarClock className="size-4" aria-hidden /> {c.protimisi}
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="rounded-full bg-white text-eu-ink px-3 min-h-11 text-[length:var(--fs-15)] font-semibold">
            {["Πρωί 9–13", "Μεσημέρι 13–17", "Απόγευμα 17–21", "Σάββατο"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="ml-auto rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:bg-eu-yellow-dark">
          {c.apostoli_aitimatos}
        </button>
      </div>
    </form>
  );
}
