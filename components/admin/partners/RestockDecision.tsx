"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advancePartnerRestock, cancelPartnerRestock, decidePartnerRestock, restockPickupOptions } from "@/app/admin/(shell)/synergates/actions";
import { isShipMode, SHIP_MODE, type ShipMode } from "@/lib/partner-portal/restock-model";

const BTN = "inline-flex items-center justify-center rounded-full min-h-11 px-4 font-bold text-[length:var(--fs-14)] disabled:opacity-50";
const PRIMARY = `${BTN} bg-eu-navy text-white hover:bg-eu-blue`;
const DANGER = `${BTN} border-2 border-[#f0b8b2] text-[#b3261e] hover:bg-[#fdecea]`;
type Option = { id: string; name: string; city: string; km: number | null; covered: number; total: number; own: boolean };

/**
 * Ενέργειες της διαχείρισης σε αίτημα αναπλήρωσης, ανά κατάσταση:
 * αναμένει → έγκριση (τρόπος + κατάστημα παραλαβής) / απόρριψη · εγκρίθηκε → έτοιμο για παραλαβή ή στάλθηκε · έτοιμο → παραλήφθηκε · ακύρωση με απάντηση.
 */
export function RestockDecision({ id, status, shipMode, approvedMode }: { id: string; status: string; shipMode: string; approvedMode?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<ShipMode>(isShipMode(shipMode) ? shipMode : "bulk");
  const [reply, setReply] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [pickup, setPickup] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const finalMode: ShipMode = isShipMode(approvedMode) ? approvedMode : isShipMode(shipMode) ? shipMode : "bulk";

  useEffect(() => {
    if (status !== "requested" || mode !== "pickup" || options) return;
    restockPickupOptions(id).then((o) => { setOptions(o); const best = o.find((x) => x.covered === x.total) ?? o[0]; if (best) setPickup(best.id); });
  }, [id, mode, options, status]);

  const done = (r: { ok: true; mailed?: boolean } | { ok: false; error: string }, text: string) => {
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: `${text}${"mailed" in r && r.mailed !== undefined ? (r.mailed ? " · στάλθηκε email στο μέλος" : " · χωρίς email (το μέλος δεν έχει λογαριασμό ή δεν υπάρχει πάροχος)") : ""}.` });
    router.refresh();
  };
  const decide = (approve: boolean) => start(async () => done(await decidePartnerRestock(id, approve, mode, mode === "pickup" ? pickup || null : null, reply), approve ? "Εγκρίθηκε" : "Απορρίφθηκε"));
  const advance = (to: "ready" | "shipped") => start(async () => done(await advancePartnerRestock(id, to), to === "ready" ? "Έτοιμο για παραλαβή" : finalMode === "pickup" ? "Παραλήφθηκε" : "Στάλθηκε"));
  const cancel = () => start(async () => done(await cancelPartnerRestock(id, reply), "Ακυρώθηκε"));

  const feedback = msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-[#b3261e]"}`}>{msg.text}</p>;
  const replyBox = (label: string, ph: string) => (
    <label className="grid gap-1">
      <span className="font-bold text-[length:var(--fs-13)]">{label}</span>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={1000} className="rounded-lg border border-eu-line px-3 py-2 text-[length:var(--fs-14)]" placeholder={ph} />
    </label>
  );

  if (status === "approved" || status === "ready") {
    return (
      <div data-help="restock.advance" className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          {status === "approved" && finalMode === "pickup" && <button type="button" disabled={pending} onClick={() => advance("ready")} className={PRIMARY}>Έτοιμο για παραλαβή</button>}
          {(status === "ready" || finalMode !== "pickup") && <button type="button" disabled={pending} onClick={() => advance("shipped")} className={PRIMARY}>{finalMode === "pickup" ? "Παραλήφθηκε" : "Στάλθηκε στο κατάστημα"}</button>}
          {!cancelOpen && <button type="button" disabled={pending} onClick={() => setCancelOpen(true)} className={DANGER}>Ακύρωση…</button>}
        </div>
        {cancelOpen && (
          <div className="grid gap-2">
            {replyBox("Γιατί ακυρώνεται (το βλέπει το μέλος)", "π.χ. το είδος δεν θα έρθει πριν από 15 ημέρες")}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={cancel} className={DANGER}>Ακύρωση αναπλήρωσης</button><button type="button" onClick={() => setCancelOpen(false)} className={`${BTN} text-eu-blue hover:bg-eu-chip`}>Πίσω</button></div>
          </div>
        )}
        {feedback}
      </div>
    );
  }
  if (status !== "requested") return feedback;

  return (
    <div data-help="restock.decide" className="grid gap-2">
      <fieldset className="m-0 p-0 border-0 grid gap-0.5">
        <legend className="font-bold text-[length:var(--fs-13)] mb-1">Τρόπος</legend>
        {(Object.keys(SHIP_MODE) as ShipMode[]).map((k) => (
          <label key={k} className="flex items-center gap-2 min-h-11 text-[length:var(--fs-14)] cursor-pointer">
            <input type="radio" name={`mode-${id}`} checked={mode === k} onChange={() => setMode(k)} className="size-4 accent-[#122a58]" />
            <span>{SHIP_MODE[k].label}{k === shipMode && <span className="text-eu-ink-3 text-[length:var(--fs-12)]"> (ζήτησε το μέλος)</span>}</span>
          </label>
        ))}
      </fieldset>
      {mode === "pickup" && (
        <label data-help="restock.pickup" className="grid gap-1">
          <span className="font-bold text-[length:var(--fs-13)]">Κατάστημα παραλαβής</span>
          {options === null ? <span className="text-eu-ink-3 text-[length:var(--fs-13)]">Αναζήτηση καταστημάτων με απόθεμα…</span> : options.length ? (
            <select value={pickup} onChange={(e) => setPickup(e.target.value)} className="min-h-11 rounded-lg border border-eu-line bg-white px-2 text-[length:var(--fs-14)]">
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}, {o.city} · {o.km !== null ? `${o.km.toLocaleString("el-GR")} km` : "χωρίς θέση"} · απόθεμα {o.covered}/{o.total}{o.own ? " · ίδιο μέλος" : ""}</option>)}
            </select>
          ) : <span className="text-[#b3261e] text-[length:var(--fs-13)] font-bold">Δεν βρέθηκε ενεργό κατάστημα.</span>}
          <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Πρώτα όσα έχουν απόθεμα για όλα τα προϊόντα, μετά κατά απόσταση από το κατάστημα του μέλους.</span>
        </label>
      )}
      {replyBox("Μήνυμα στο μέλος (υποχρεωτικό στην απόρριψη)", "π.χ. φεύγει την Τρίτη με τη μαζική αποστολή")}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || (mode === "pickup" && !pickup)} onClick={() => decide(true)} className={PRIMARY}>Έγκριση & παραγγελία</button>
        <button type="button" disabled={pending} onClick={() => decide(false)} className={DANGER}>Απόρριψη</button>
      </div>
      {feedback}
    </div>
  );
}
