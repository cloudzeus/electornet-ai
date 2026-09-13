"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Trash2, Pencil, LocateFixed, Loader2, Check, Store } from "lucide-react";

/**
 * @dynamic Customer address book (signed-in). Saves through /api/account/addresses;
 * the server geocodes every address and links it to the nearest store, which
 * the customer sees as «Το κατάστημά σου για αυτή τη διεύθυνση». «Χρήση της
 * θέσης μου» sends the device GPS as exact coordinates.
 */
export interface AddressRow { id: string; label: string | null; recipient: string | null; street: string; number: string | null; floor: string | null; doorbell: string | null; city: string; zip: string; region: string; phone: string | null; notes: string | null; isDefault: boolean; isBilling: boolean; lat: number | null; lng: number | null; nearestKm: number | null; nearestStoreName?: string | null }
type Form = Omit<AddressRow, "id" | "nearestKm" | "nearestStoreName"> & { id?: string };
const EMPTY: Form = { label: "Σπίτι", recipient: "", street: "", number: "", floor: "", doorbell: "", city: "", zip: "", region: "", phone: "", notes: "", isDefault: false, isBilling: false, lat: null, lng: null };
const field = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-16)] outline-none focus:border-eu-blue bg-white";
const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";

export function AddressBook({ initial, stores }: { initial: AddressRow[]; stores: Record<string, string> }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Form | null>(initial.length ? null : { ...EMPTY, isDefault: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    if (!edit) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/account/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const j = (await r.json()) as { ok: boolean; error?: string; nearestStore?: { name: string; city: string; km: number } | null };
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "Κάτι πήγε στραβά.");
    setMsg(j.nearestStore ? `Αποθηκεύτηκε. Το κοντινότερο κατάστημα είναι ${j.nearestStore.name} (${j.nearestStore.city}, ${j.nearestStore.km} km).` : "Αποθηκεύτηκε.");
    setEdit(null); router.refresh();
  };
  const remove = async (id: string) => { if (!confirm("Διαγραφή διεύθυνσης;")) return; await fetch(`/api/account/addresses?id=${id}`, { method: "DELETE" }); router.refresh(); };
  const locate = () => { if (!navigator.geolocation || !edit) return; navigator.geolocation.getCurrentPosition((p) => setEdit({ ...edit, lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }), () => setMsg("Δεν δόθηκε άδεια τοποθεσίας — θα βρούμε τη θέση από τη διεύθυνση."), { timeout: 8000 }); };
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Διευθύνσεις</h1>
        <button type="button" onClick={() => setEdit({ ...EMPTY, isDefault: initial.length === 0 })} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα διεύθυνση</button>
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      {edit && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="rounded-2xl bg-white border-2 border-eu-blue p-4 grid gap-3">
          <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
            <label className={label}>Ετικέτα<input value={edit.label ?? ""} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Σπίτι, Γραφείο…" className={field} /></label>
            <label className={label}>Παραλήπτης<input value={edit.recipient ?? ""} onChange={(e) => setEdit({ ...edit, recipient: e.target.value })} autoComplete="name" className={field} /></label>
            <label className={label}>Τηλέφωνο<input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} autoComplete="tel" inputMode="tel" className={field} /></label>
            <label className={`${label} @md:col-span-2`}>Οδός<input required value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} autoComplete="address-line1" className={field} /></label>
            <label className={label}>Αριθμός<input value={edit.number ?? ""} onChange={(e) => setEdit({ ...edit, number: e.target.value })} className={field} /></label>
            <label className={label}>Όροφος<input value={edit.floor ?? ""} onChange={(e) => setEdit({ ...edit, floor: e.target.value })} className={field} /></label>
            <label className={label}>Κουδούνι<input value={edit.doorbell ?? ""} onChange={(e) => setEdit({ ...edit, doorbell: e.target.value })} className={field} /></label>
            <label className={label}>Τ.Κ.<input required value={edit.zip} onChange={(e) => setEdit({ ...edit, zip: e.target.value })} autoComplete="postal-code" inputMode="numeric" className={field} /></label>
            <label className={label}>Πόλη<input required value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} autoComplete="address-level2" className={field} /></label>
            <label className={label}>Νομός<input value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })} autoComplete="address-level1" className={field} /></label>
            <label className={label}>Οδηγίες παράδοσης<input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="π.χ. χωρίς ασανσέρ, τηλέφωνο πριν" className={field} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[length:var(--fs-14)] font-bold">
            <label className="inline-flex items-center gap-2 min-h-11"><input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} className="size-4 accent-eu-navy" /> Προεπιλογή αποστολής</label>
            <label className="inline-flex items-center gap-2 min-h-11"><input type="checkbox" checked={edit.isBilling} onChange={(e) => setEdit({ ...edit, isBilling: e.target.checked })} className="size-4 accent-eu-navy" /> Διεύθυνση τιμολόγησης</label>
            <button type="button" onClick={locate} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 hover:border-eu-navy"><LocateFixed className="size-4" aria-hidden /> {edit.lat ? "Η θέση σου ορίστηκε" : "Χρήση της θέσης μου (ακρίβεια)"}</button>
          </div>
          <div className="flex gap-2"><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Αποθήκευση</button><button type="button" onClick={() => setEdit(null)} className="rounded-full border-2 border-eu-line px-4 min-h-11 font-bold text-[length:var(--fs-14)]">Άκυρο</button></div>
        </form>
      )}
      <ul className="m-0 p-0 list-none grid grid-cols-1 @md:grid-cols-2 gap-3">
        {initial.map((a) => (
          <li key={a.id} className={`bg-white rounded-xl border-2 p-4 text-[length:var(--fs-15)] ${a.isDefault ? "border-eu-blue" : "border-eu-line"}`}>
            <div className="flex justify-between items-center mb-1 gap-2"><span className="font-extrabold text-eu-ink">{a.label ?? "Διεύθυνση"}</span><span className="flex gap-1">{a.isDefault && <span className="rounded-full bg-eu-chip text-eu-blue font-bold text-[length:var(--fs-13)] px-2 py-0.5">Προεπιλογή</span>}{a.isBilling && <span className="rounded-full bg-eu-yellow/50 text-eu-navy font-bold text-[length:var(--fs-13)] px-2 py-0.5">Τιμολόγηση</span>}</span></div>
            <p className="m-0 text-eu-ink-2">{a.recipient && <>{a.recipient}<br /></>}{a.street} {a.number}{a.floor ? `, ${a.floor}` : ""}<br />{a.zip} {a.city}{a.region ? `, ${a.region}` : ""}{a.phone && <><br />{a.phone}</>}</p>
            {a.nearestStoreName && <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-eu-green font-bold text-[length:var(--fs-14)]"><Store className="size-4" aria-hidden /> {a.nearestStoreName} · {a.nearestKm} km</p>}
            {!a.lat && <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-13)]"><MapPin className="size-3.5" aria-hidden /> Εντοπίζουμε τη θέση…</p>}
            <div className="flex gap-2 mt-3"><button type="button" onClick={() => setEdit({ ...a, label: a.label ?? "", recipient: a.recipient ?? "", number: a.number ?? "", floor: a.floor ?? "", doorbell: a.doorbell ?? "", phone: a.phone ?? "", notes: a.notes ?? "" })} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-[length:var(--fs-14)] hover:border-eu-navy"><Pencil className="size-4" aria-hidden /> Επεξεργασία</button><button type="button" onClick={() => remove(a.id)} className="inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-eu-red text-[length:var(--fs-14)] hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /> Διαγραφή</button></div>
          </li>
        ))}
      </ul>
      {stores && null}
    </div>
  );
}
