"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Search, UserRoundSearch, X } from "lucide-react";
import { createDevice, searchCustomers, updateDevice, type CustomerHit, type DeviceInput } from "./actions";

const field = "rounded-lg border border-eu-line px-3 min-h-11 md:min-h-10 text-[length:var(--fs-14)] font-normal outline-none focus:border-eu-blue bg-white w-full disabled:bg-eu-surface disabled:text-eu-muted";
const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)] content-start";
const hint = "font-normal text-eu-muted text-[length:var(--fs-12)] leading-snug";
const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50";
const btn2 = "inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-11 md:min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50";

/** Τα στοιχεία συσκευής που χρειάζεται η φόρμα (ημερομηνίες ως ΕΕΕΕ-ΜΜ-ΗΗ). */
export interface DeviceForm { id: string; customerName: string; brand: string; title: string; model: string; serial: string; purchasedAt: string; warrantyMonths: number; warrantyUntil: string; extendedUntil: string; extendedPlan: string; invoiceNo: string; notes: string }

const calcUntil = (purchasedAt: string, months: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchasedAt)) return "";
  const d = new Date(`${purchasedAt}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMonth(d.getUTCMonth() + (Number.isFinite(months) ? months : 0));
  return d.toISOString().slice(0, 10);
};
const fmt = (s: string) => (s ? new Date(`${s}T00:00:00.000Z`).toLocaleDateString("el-GR", { timeZone: "UTC" }) : "—");

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} onClose={onClose} aria-label={title} data-help="eggyiseis.dialog" className="m-auto w-[min(46rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-black/40 @container">
      <div className="bg-white p-4 @md:p-5 grid gap-3">
        <div className="flex items-start justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{title}</h3><button type="button" aria-label="Κλείσιμο" onClick={onClose} className="size-11 shrink-0 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-5" aria-hidden /></button></div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}

/** Η φόρμα στοιχείων συσκευής & εγγύησης — κοινή για διόρθωση και νέα καταχώριση. */
function DeviceFields({ initial, onSubmit, onCancel }: { initial: Omit<DeviceForm, "id" | "customerName">; onSubmit: (d: DeviceInput) => Promise<{ ok: boolean; error?: string }>; onCancel: () => void }) {
  const computed0 = calcUntil(initial.purchasedAt, initial.warrantyMonths);
  const [d, setD] = useState<DeviceInput>({ ...initial, warrantyOverride: !!initial.warrantyUntil && initial.warrantyUntil !== computed0, warrantyUntil: initial.warrantyUntil });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = <K extends keyof DeviceInput>(k: K, v: DeviceInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const computed = calcUntil(d.purchasedAt, d.warrantyMonths);
  const submit = () => start(async () => { setError(""); const r = await onSubmit(d); if (!r.ok) setError(r.error ?? "Αποτυχία αποθήκευσης."); });
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-3">
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
        <label className={label}>Μάρκα<input required value={d.brand} onChange={(e) => set("brand", e.target.value)} className={field} /><span className={hint}>Κατασκευαστής, π.χ. Bosch.</span></label>
        <label className={label}>Περιγραφή<input required value={d.title} onChange={(e) => set("title", e.target.value)} className={field} /><span className={hint}>Τι συσκευή είναι, όπως στο παραστατικό.</span></label>
        <label className={label}>Μοντέλο<input value={d.model} onChange={(e) => set("model", e.target.value)} className={field} /><span className={hint}>Κωδικός μοντέλου από την ετικέτα.</span></label>
        <label className={label}>Σειριακός αριθμός (S/N)<input value={d.serial} onChange={(e) => set("serial", e.target.value)} className={`${field} font-mono`} autoCapitalize="characters" /><span className={hint}>Από την ετικέτα της συσκευής· χρησιμοποιείται για την αναζήτηση στο service.</span></label>
        <label className={label}>Ημερομηνία αγοράς<input type="date" value={d.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} className={field} /><span className={hint}>Από την απόδειξη / το τιμολόγιο.</span></label>
        <label className={label}>Εγγύηση κατασκευαστή (μήνες)<input type="number" inputMode="numeric" min={0} max={240} value={Number.isFinite(d.warrantyMonths) ? d.warrantyMonths : ""} onChange={(e) => set("warrantyMonths", e.target.value === "" ? 0 : Number(e.target.value))} className={field} /><span className={hint}>Συνήθως 24· η λήξη υπολογίζεται από την αγορά + τους μήνες.</span></label>
        <div className="grid gap-1 @xl:col-span-2 rounded-xl border border-eu-line bg-eu-surface/50 p-3">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Λήξη εγγύησης</span>
          <span className={hint}>Υπολογισμένη: <b className="text-eu-ink">{fmt(computed)}</b>{!computed && " (χρειάζεται ημερομηνία αγοράς)"}. Όρισέ την χειροκίνητα μόνο αν ο κατασκευαστής δίνει διαφορετική λήξη.</span>
          <label className="flex items-center gap-2 min-h-11 font-bold text-eu-ink-2 text-[length:var(--fs-14)]"><input type="checkbox" checked={d.warrantyOverride} onChange={(e) => setD((x) => ({ ...x, warrantyOverride: e.target.checked, warrantyUntil: e.target.checked ? x.warrantyUntil || computed : x.warrantyUntil }))} className="size-5 accent-eu-navy" /> Χειροκίνητη λήξη</label>
          <input type="date" aria-label="Λήξη εγγύησης (χειροκίνητα)" disabled={!d.warrantyOverride} value={d.warrantyOverride ? d.warrantyUntil : computed} onChange={(e) => set("warrantyUntil", e.target.value)} className={field} />
        </div>
        <label className={label}>Επέκταση εγγύησης έως<input type="date" value={d.extendedUntil} onChange={(e) => set("extendedUntil", e.target.value)} className={field} /><span className={hint}>Μόνο αν έχει αγοραστεί/δοθεί επέκταση· κενό = χωρίς επέκταση.</span></label>
        <label className={label}>Πρόγραμμα επέκτασης<input value={d.extendedPlan} onChange={(e) => set("extendedPlan", e.target.value)} className={field} /><span className={hint}>Π.χ. «+2 έτη Euronics» ή ο αριθμός EXT-….</span></label>
        <label className={label}>Αριθμός παραστατικού<input value={d.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} className={field} /><span className={hint}>Απόδειξη/τιμολόγιο αγοράς (SoftOne).</span></label>
        <label className={`${label} @xl:col-span-2`}>Σημειώσεις<textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={`${field} py-2`} /><span className={hint}>Εσωτερικές· δεν εμφανίζονται στον πελάτη.</span></label>
      </div>
      {error && <p role="alert" className="m-0 rounded-lg bg-eu-red/10 text-eu-red font-bold px-3 py-2 text-[length:var(--fs-14)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={btn}><Check className="size-4" aria-hidden /> {pending ? "Αποθήκευση…" : "Αποθήκευση"}</button>
        <button type="button" onClick={onCancel} className={btn2}>Άκυρο</button>
      </div>
    </form>
  );
}

/** «Διόρθωση» σε γραμμή του πίνακα. */
export function EditDeviceButton({ device }: { device: DeviceForm }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { id, customerName, ...initial } = device;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-help="eggyiseis.edit" className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white px-3 min-h-11 @5xl:min-h-9 font-bold text-eu-ink text-[length:var(--fs-13)] hover:border-eu-navy"><Pencil className="size-3.5" aria-hidden /> Διόρθωση</button>
      {open && (
        <Modal title={`Διόρθωση: ${device.brand} ${device.title}`} onClose={() => setOpen(false)}>
          <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Πελάτης: <b className="text-eu-ink">{customerName}</b>. Οι αλλαγές καταγράφονται στο ιστορικό του πελάτη με το όνομά σου.</p>
          <DeviceFields initial={initial} onCancel={() => setOpen(false)} onSubmit={async (d) => { const r = await updateDevice(id, d); if (r.ok) { setOpen(false); router.refresh(); } return r; }} />
        </Modal>
      )}
    </>
  );
}

const EMPTY: Omit<DeviceForm, "id" | "customerName"> = { brand: "", title: "", model: "", serial: "", purchasedAt: "", warrantyMonths: 24, warrantyUntil: "", extendedUntil: "", extendedPlan: "", invoiceNo: "", notes: "" };

/** «Νέα καταχώριση»: πρώτα επιλογή πελάτη, μετά τα στοιχεία της συσκευής. */
export function NewDeviceButton() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[] | null>(null);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [searching, start] = useTransition();
  const router = useRouter();
  const close = () => { setOpen(false); setCustomer(null); setHits(null); setQ(""); };
  const search = () => start(async () => setHits(await searchCustomers(q)));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-help="eggyiseis.new" className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-bold text-[length:var(--fs-13)] px-3.5 min-h-11 md:min-h-9 hover:bg-eu-blue"><Plus className="size-4" aria-hidden /> Νέα καταχώριση</button>
      {open && (
        <Modal title="Νέα καταχώριση συσκευής" onClose={close}>
          {!customer ? (
            <div className="grid gap-2">
              <form onSubmit={(e) => { e.preventDefault(); search(); }} className="grid gap-1">
                <label htmlFor="dev-cust-q" className="font-bold text-eu-ink text-[length:var(--fs-14)]">1. Πελάτης</label>
                <span className={hint}>Όνομα, επώνυμο, email, κινητό ή αριθμός πελάτη (τουλάχιστον 2 χαρακτήρες).</span>
                <div className="flex gap-1.5">
                  <input id="dev-cust-q" type="search" enterKeyHint="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} className={field} placeholder="π.χ. Παπαδόπουλος ή 69…" />
                  <button type="submit" disabled={searching || q.trim().length < 2} className={btn}><Search className="size-4" aria-hidden /><span className="sr-only @sm:not-sr-only">Αναζήτηση</span></button>
                </div>
              </form>
              {searching && <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Αναζήτηση…</p>}
              {hits && !searching && (hits.length ? (
                <ul className="m-0 p-0 list-none grid gap-1.5">
                  {hits.map((h) => (
                    <li key={h.id}><button type="button" onClick={() => setCustomer(h)} className="w-full text-left rounded-xl border border-eu-line px-3 py-2 min-h-11 hover:border-eu-blue grid gap-0.5">
                      <span className="font-bold text-eu-ink text-[length:var(--fs-14)] break-words">{h.name} <span className="text-eu-muted font-normal">#{h.number}</span></span>
                      <span className="text-eu-ink-3 text-[length:var(--fs-13)] break-all">{[h.email, h.phone].filter(Boolean).join(" · ") || "χωρίς στοιχεία επικοινωνίας"}</span>
                    </button></li>
                  ))}
                </ul>
              ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κανένας πελάτης. Δημιούργησέ τον πρώτα από τους Πελάτες.</p>)}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-eu-chip px-3 py-2">
                <UserRoundSearch className="size-4 text-eu-blue" aria-hidden />
                <span className="text-[length:var(--fs-14)] text-eu-ink min-w-0 break-words"><b>{customer.name}</b> #{customer.number}</span>
                <button type="button" onClick={() => setCustomer(null)} className="ml-auto font-bold text-eu-blue text-[length:var(--fs-13)] min-h-11 px-2 hover:underline">Αλλαγή πελάτη</button>
              </div>
              <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">2. Στοιχεία συσκευής</span>
              <DeviceFields initial={EMPTY} onCancel={close} onSubmit={async (d) => { const r = await createDevice(customer.id, d); if (r.ok) { close(); router.refresh(); } return r; }} />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
