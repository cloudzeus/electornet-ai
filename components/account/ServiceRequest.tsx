"use client";

import { useState } from "react";
import Link from "next/link";
import { Wrench, Camera, Check, CalendarClock, X } from "lucide-react";
import { copyOf } from "@/lib/cms/copy";
import { SLOTS } from "@/lib/service/core";

const c = copyOf("serviceRequest");

type Device = { id?: string; title: string; serial?: string; inWarranty: boolean };

/**
 * Δήλωση βλάβης / ραντεβού service: για μία συσκευή (από «Οι συσκευές μου») ή γενικό αίτημα με επιλογή είδους και
 * (προαιρετικά) συσκευής — εγκατάσταση, επισκευή, ραντεβού. Σύμπτωμα, προτιμώμενη ζώνη, τρόπος, φωτογραφίες / βίντεο.
 * POST /api/account/tickets (multipart) → αίτημα SRV-…, email επιβεβαίωσης, φαίνεται στα «Ραντεβού & service».
 */
export function ServiceRequest({ device, devices }: { device?: Device; devices?: Device[] }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [symptom, setSymptom] = useState("");
  const [slot, setSlot] = useState<string>(SLOTS[0]);
  const [mode, setMode] = useState<"visit" | "pickup" | "store">("visit");
  const [kind, setKind] = useState<"repair" | "installation" | "appointment">("repair");
  const [pick, setPick] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const dev = device ?? devices?.find((d) => d.id === pick);
  if (sent)
    return (
      <div className="rounded-2xl bg-eu-green/10 border border-eu-green/30 p-5 flex items-start gap-3">
        <span className="size-10 shrink-0 rounded-full bg-eu-green text-white inline-flex items-center justify-center">
          <Check className="size-5" aria-hidden />
        </span>
        <div className="text-[length:var(--fs-15)] text-eu-ink-2">
          <div className="font-bold text-eu-ink text-[length:var(--fs-17)]">Το αίτημα #{sent} καταχωρήθηκε</div>
          {c.tha_se_kalesei_o}{" "}
          <Link href="/logariasmos/rantevou" className="text-eu-blue font-bold underline">Δες το αίτημα</Link>
        </div>
      </div>
    );
  const repair = !!device || kind === "repair";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (symptom.trim().length < 5) return setErr(repair ? "Περιέγραψε λίγο τη βλάβη." : "Γράψε λίγα λόγια για το τι χρειάζεσαι.");
        setBusy(true); setErr(null);
        const fd = new FormData();
        fd.set("kind", repair ? (dev?.inWarranty ? "warranty-claim" : "repair") : kind);
        fd.set("mode", mode);
        if (dev?.id) fd.set("deviceId", dev.id);
        fd.set("slot", slot);
        fd.set("description", symptom.trim());
        files.forEach((f) => fd.append("files", f));
        fetch("/api/account/tickets", { method: "POST", body: fd })
          .then((r) => r.json() as Promise<{ ok: boolean; number?: string; error?: string }>)
          .then((j) => (j.ok ? setSent(j.number ?? "") : setErr(j.error ?? "Το αίτημα δεν καταχωρήθηκε.")))
          .catch(() => setErr("Σφάλμα δικτύου. Δοκίμασε ξανά."))
          .finally(() => setBusy(false));
      }}
      className="rounded-2xl bg-eu-navy text-white p-5 @md:p-6 grid gap-4 relative overflow-hidden isolate"
    >
      <span className="eu-ambient" aria-hidden />
      <div className="relative">
        <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5">
          <Wrench className="size-3.5" aria-hidden /> {device ? c.dilosi_vlavis_service : "Νέο αίτημα service"}
        </div>
        <h2 className="m-0 mt-1 font-heading font-bold text-[length:var(--fs-22)] leading-tight">{device ? device.title : "Τι χρειάζεσαι;"}</h2>
        {device && (
          <p className="m-0 mt-1 text-eu-on-dark-2 text-[length:var(--fs-14)]">
            {device.serial ? `S/N ${device.serial} · ` : ""}
            {device.inWarranty ? "Εντός εγγύησης: επίσκεψη τεχνικού ή παραλαβή χωρίς χρέωση." : "Εκτός εγγύησης: κόστος διάγνωσης 25 €, συμψηφίζεται με την επισκευή."}
          </p>
        )}
      </div>
      {!device && (
        <div className="relative grid grid-cols-1 @md:grid-cols-2 gap-3">
          <div className="grid grid-cols-3 gap-2 @md:col-span-2" role="radiogroup" aria-label="Είδος αιτήματος">
            {([["repair", "Βλάβη / επισκευή"], ["installation", "Εγκατάσταση"], ["appointment", "Άλλο ραντεβού"]] as const).map(([v, l]) => (
              <label key={v} className={`rounded-xl px-3 min-h-12 inline-flex items-center justify-center text-center text-[length:var(--fs-14)] font-bold cursor-pointer ${kind === v ? "bg-eu-yellow text-eu-navy" : "bg-white/10 hover:bg-white/20"}`}>
                <input type="radio" name="kind" className="sr-only" checked={kind === v} onChange={() => setKind(v)} />
                {l}
              </label>
            ))}
          </div>
          {devices && devices.length > 0 && (
            <label className="grid gap-1.5 @md:col-span-2">
              <span className="font-bold text-[length:var(--fs-15)]">Για ποια συσκευή; <span className="font-normal text-eu-on-dark-2">(προαιρετικό)</span></span>
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-xl bg-white text-eu-ink px-3 min-h-12 text-[length:var(--fs-16)]">
                <option value="">Καμία / νέα συσκευή</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.title}{d.inWarranty ? " · σε εγγύηση" : ""}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="relative grid gap-1.5">
        <span className="font-bold text-[length:var(--fs-15)]">{repair ? "Τι συμβαίνει;" : "Περιγραφή"}</span>
        <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} required rows={3} placeholder={repair ? c.p_ch_den_styvei : "π.χ. Εγκατάσταση κλιματιστικού 12.000 BTU σε 2ο όροφο"} className="rounded-xl bg-white text-eu-ink px-3 py-2.5 text-[length:var(--fs-16)] outline-none focus:ring-2 ring-eu-yellow" />
      </label>
      <div className="relative grid grid-cols-1 @md:grid-cols-[auto_minmax(0,1fr)] gap-3 items-start">
        <label className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 px-4 min-h-12 font-bold text-[length:var(--fs-15)] cursor-pointer hover:border-white focus-within:ring-2 ring-eu-yellow">
          <Camera className="size-4" aria-hidden /> {c.fotografia_vinteo}
          <input type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.target.value = ""; }} />
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
      {files.length > 0 ? (
        <ul className="relative m-0 p-0 list-none flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 pl-3 pr-1 min-h-10 text-[length:var(--fs-14)] max-w-full">
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="size-9 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-white/20"><X className="size-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="relative m-0 text-eu-on-dark-2 text-[length:var(--fs-13)]">Έως 5 αρχεία: φωτογραφίες (12 MB) ή σύντομο βίντεο (60 MB) — βοηθούν τον τεχνικό να φέρει το σωστό ανταλλακτικό.</p>
      )}
      <div className="relative flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-15)] font-bold">
          <CalendarClock className="size-4" aria-hidden /> {c.protimisi}
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="rounded-full bg-white text-eu-ink px-3 min-h-11 text-[length:var(--fs-15)] font-semibold">
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className="ml-auto rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 hover:bg-eu-yellow-dark disabled:opacity-60">
          {busy ? (files.length ? "Ανέβασμα αρχείων…" : "Αποστολή…") : c.apostoli_aitimatos}
        </button>
      </div>
      {err && <p role="alert" className="relative m-0 font-bold text-eu-yellow text-[length:var(--fs-15)]">{err}</p>}
    </form>
  );
}
