"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Camera, Loader2, MessageSquare, X } from "lucide-react";
import { SLOTS } from "@/lib/service/core";

/**
 * Ενέργειες του πελάτη σε ανοιχτό αίτημα service: αίτημα αλλαγής ώρας (ημέρα + ζώνη + σχόλιο) και μήνυμα με
 * φωτογραφίες / βίντεο. Το κατάστημα απαντά — το ραντεβού αλλάζει μόνο όταν το επιβεβαιώσει.
 */
export function TicketActions({ id, pendingRequest }: { id: string; pendingRequest: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"reschedule" | "message" | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>(SLOTS[0]);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const today = new Date().toISOString().slice(0, 10);

  const done = (r: { ok: boolean; error?: string }, ok: string) => {
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Δεν στάλθηκε." });
    setMsg({ ok: true, text: ok }); setOpen(null); setNote(""); setFiles([]); setDate("");
    router.refresh();
  };
  const sendReschedule = () => {
    setBusy(true); setMsg(null);
    fetch(`/api/account/tickets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reschedule", date, slot, note }) })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "Σφάλμα δικτύου." }))
      .then((r) => done(r, "Στείλαμε το αίτημα — το κατάστημα θα σε καλέσει να επιβεβαιώσει τη νέα ώρα."));
  };
  const sendMessage = () => {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("note", note);
    files.forEach((f) => fd.append("files", f));
    fetch(`/api/account/tickets/${id}`, { method: "POST", body: fd })
      .then((r) => r.json()).catch(() => ({ ok: false, error: "Σφάλμα δικτύου." }))
      .then((r) => done(r, "Στάλθηκε στο κατάστημα."));
  };

  const btn = "inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface cursor-pointer";
  const field = "rounded-xl border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-16)] w-full";
  const label = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink min-w-0";

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(open === "reschedule" ? null : "reschedule")} aria-expanded={open === "reschedule"} className={btn}>
          <CalendarClock className="size-4" aria-hidden /> {pendingRequest ? "Νέα πρόταση ώρας" : "Αλλαγή ώρας"}
        </button>
        <button type="button" onClick={() => setOpen(open === "message" ? null : "message")} aria-expanded={open === "message"} className={btn}>
          <MessageSquare className="size-4" aria-hidden /> Μήνυμα / φωτογραφίες
        </button>
      </div>
      {open === "reschedule" && (
        <div className="rounded-xl bg-eu-surface p-3 grid gap-3">
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
            <label className={label}>Ποια ημέρα σε βολεύει;<input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
            <label className={label}>Ζώνη ώρας<select value={slot} onChange={(e) => setSlot(e.target.value)} className={field}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <label className={label}>Σχόλιο <span className="font-normal text-eu-muted">(προαιρετικό — π.χ. «οποιαδήποτε μέρα μετά τις 17:00»)</span><input value={note} onChange={(e) => setNote(e.target.value)} className={field} /></label>
          <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το ραντεβού αλλάζει όταν το επιβεβαιώσει το κατάστημα — θα λάβεις email.</p>
          <button type="button" disabled={busy || (!date && !note.trim())} onClick={sendReschedule} className="w-fit rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 inline-flex items-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Αποστολή αιτήματος
          </button>
        </div>
      )}
      {open === "message" && (
        <div className="rounded-xl bg-eu-surface p-3 grid gap-3">
          <label className={label}>Μήνυμα προς το κατάστημα<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} py-2`} placeholder="π.χ. Το πρόβλημα εμφανίζεται μόνο στο πρόγραμμα βαμβακερών" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line bg-white px-4 min-h-11 font-bold text-[length:var(--fs-14)] cursor-pointer hover:border-eu-navy focus-within:ring-2 ring-eu-blue">
              <Camera className="size-4" aria-hidden /> Φωτογραφία / βίντεο
              <input type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 5)); e.target.value = ""; }} />
            </label>
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white border border-eu-line pl-3 pr-1 min-h-10 text-[length:var(--fs-13)] max-w-full">
                <span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Αφαίρεση ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="size-9 inline-flex items-center justify-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
              </span>
            ))}
          </div>
          <button type="button" disabled={busy || (!note.trim() && !files.length)} onClick={sendMessage} className="w-fit rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 inline-flex items-center gap-2 disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />} {busy && files.length ? "Ανέβασμα…" : "Αποστολή"}
          </button>
        </div>
      )}
      {msg && <p role="status" className={`m-0 font-bold text-[length:var(--fs-14)] ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}
