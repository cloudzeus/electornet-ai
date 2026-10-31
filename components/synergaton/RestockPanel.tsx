"use client";

import { useState, useTransition } from "react";
import { MapPin, PackagePlus, Truck, Zap } from "lucide-react";
import { requestRestock, withdrawRestock } from "@/app/synergaton/actions";
import { linesOf, MAX_QTY, modeOf, OPEN_RESTOCK, restockStatusOf, SHIP_MODE, type ShipMode } from "@/lib/partner-portal/restock-model";
import { Badge, btn, Callout, fmtDateTime } from "./ui";

type Line = { variantId: string; title: string; qty: number; erpCode: string | null };
type Restock = { id: string; number: string; status: string; shipMode: string; approvedMode: string | null; reply: string | null; lines: unknown; note: string | null; createdAt: Date | string; decidedAt: Date | string | null; readyAt: Date | string | null; shippedAt: Date | string | null; pickupStore: { name: string; address: string; city: string; phone: string | null } | null };

/** Αναπλήρωση αποθέματος από τη μαμά εταιρία για μια παραγγελία: τα αιτήματα που έγιναν και η φόρμα νέου αιτήματος. */
export function RestockPanel({ orderId, lines, restocks, closed }: { orderId: string; lines: Line[]; restocks: Restock[]; closed: boolean }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.variantId, l.qty])));
  const [mode, setMode] = useState<ShipMode>("bulk");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasOpen = restocks.some((r) => (OPEN_RESTOCK as string[]).includes(r.status));
  const picked = lines.filter((l) => (qty[l.variantId] ?? 0) > 0).length;

  function submit() {
    setError(null);
    start(async () => {
      const r = await requestRestock(orderId, lines.map((l) => ({ variantId: l.variantId, qty: qty[l.variantId] ?? 0 })), mode, note);
      if (!r.ok) { setError(r.error); return; }
      setDone(r.number); setOpen(false); setNote("");
    });
  }
  function withdraw(id: string) {
    start(async () => {
      const r = await withdrawRestock(id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <section data-help="portal.orders-restock" className="grid gap-2 rounded-xl border border-eu-line p-3 sm:p-4" aria-label="Αναπλήρωση αποθέματος">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 flex items-center gap-2 font-heading text-[length:var(--fs-15)]"><PackagePlus className="size-4 text-eu-blue" aria-hidden /> Αναπλήρωση από την Euronics</h3>
        {!hasOpen && !closed && !open && <button type="button" onClick={() => { setOpen(true); setDone(null); }} className={btn("secondary", "sm")}>Αίτημα αναπλήρωσης</button>}
      </div>

      {done && <Callout tone="good" title={`Στάλθηκε το αίτημα ${done}`}>Θα ενημερωθείτε εδώ και με email μόλις το εγκρίνει η Euronics.</Callout>}
      {error && <Callout tone="bad">{error}</Callout>}

      {restocks.length > 0 && (
        <ul className="m-0 p-0 list-none grid gap-2">
          {restocks.map((r) => {
            const mode = modeOf(r);
            const st = restockStatusOf(r.status, mode);
            const m = SHIP_MODE[mode];
            return (
              <li key={r.id} className="grid gap-1 rounded-lg bg-eu-surface px-3 py-2 text-[length:var(--fs-13)]">
                <span className="flex flex-wrap items-center gap-2"><b className="text-[length:var(--fs-14)]">{r.number}</b><Badge tone={st.tone}>{st.label}</Badge><span className="text-eu-ink-3">{fmtDateTime(r.createdAt)}</span></span>
                <span className="text-eu-ink-2">{linesOf(r.lines).map((l) => `${l.qty} × ${l.title}`).join(" · ")}</span>
                <span className="text-eu-ink-3">{r.status === "requested" ? "Ζητήσατε" : "Αποστολή"}: <b className="text-eu-ink">{m?.label ?? "—"}</b>{r.status === "shipped" && r.shippedAt ? ` · ${mode === "pickup" ? "παραλήφθηκε" : "στάλθηκε"} ${fmtDateTime(r.shippedAt)}` : ""}</span>
                {r.pickupStore && <span className="text-eu-ink-2 break-words"><b>Παραλαβή από:</b> {r.pickupStore.name}, {[r.pickupStore.address, r.pickupStore.city].filter(Boolean).join(", ")}{r.pickupStore.phone ? <> · <a href={`tel:${r.pickupStore.phone}`} className="text-eu-blue font-bold">{r.pickupStore.phone}</a></> : null}{r.status === "ready" ? " — σας περιμένει" : ""}</span>}
                {r.reply && <span className="text-eu-ink-2"><b>Μήνυμα Euronics:</b> {r.reply}</span>}
                {r.status === "requested" && <span><button type="button" disabled={pending} onClick={() => withdraw(r.id)} className={btn("ghost", "sm")}>Ακύρωση αιτήματος</button></span>}
              </li>
            );
          })}
        </ul>
      )}

      {!restocks.length && !open && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{closed ? "Η παραγγελία έκλεισε." : "Αν δεν έχετε απόθεμα για την παραγγελία, ζητήστε το από την Euronics. Την παραγγελία την παραδίδετε στον πελάτη σε κάθε περίπτωση."}</p>}

      {open && (
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <fieldset className="m-0 p-0 border-0 grid gap-1.5">
            <legend className="font-bold text-[length:var(--fs-14)] mb-1">Προϊόντα και ποσότητες</legend>
            {lines.map((l) => (
              <label key={l.variantId} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-2 rounded-lg bg-eu-surface px-3 py-1.5 text-[length:var(--fs-14)]">
                <span className="min-w-0"><b className="block break-words">{l.title}</b>{l.erpCode && <span className="text-eu-ink-3 text-[length:var(--fs-12)]">Κωδ. {l.erpCode}</span>}</span>
                <input type="number" inputMode="numeric" min={0} max={MAX_QTY} value={qty[l.variantId] ?? 0} aria-label={`Ποσότητα για ${l.title}`} onChange={(e) => setQty((q) => ({ ...q, [l.variantId]: Math.max(0, Math.min(MAX_QTY, Math.floor(Number(e.target.value) || 0))) }))} className="min-h-11 w-full rounded-lg border-2 border-eu-line bg-white px-2 text-right tabular-nums outline-none focus:border-eu-blue" />
              </label>
            ))}
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Βάλτε 0 σε όσα δεν χρειάζεστε.</p>
          </fieldset>
          <fieldset className="m-0 p-0 border-0 grid gap-2 lg:grid-cols-3">
            <legend className="font-bold text-[length:var(--fs-14)] mb-1">Πώς να έρθει</legend>
            {(Object.keys(SHIP_MODE) as ShipMode[]).map((k) => {
              const I = k === "express" ? Zap : k === "pickup" ? MapPin : Truck;
              return (
                <label key={k} className={`flex gap-3 items-start rounded-xl border-2 p-3 cursor-pointer min-h-11 ${mode === k ? "border-eu-navy bg-eu-chip" : "border-eu-line bg-white hover:border-eu-navy"}`}>
                  <input type="radio" name={`mode-${orderId}`} value={k} checked={mode === k} onChange={() => setMode(k)} className="mt-1 size-4 accent-[#122a58]" />
                  <span className="grid gap-0.5"><b className="flex items-center gap-1.5 text-[length:var(--fs-14)]"><I className="size-4" aria-hidden /> {SHIP_MODE[k].label}</b><span className="text-eu-ink-3 text-[length:var(--fs-13)]">{SHIP_MODE[k].help}</span></span>
                </label>
              );
            })}
          </fieldset>
          <label className="grid gap-1.5">
            <span className="font-bold text-[length:var(--fs-14)]">Σημείωση <span className="text-eu-muted font-normal text-[length:var(--fs-12)]">(προαιρετικό)</span></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="rounded-xl border-2 border-eu-line bg-white px-3 py-2 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" placeholder="π.χ. ο πελάτης έρχεται την Πέμπτη" />
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className={btn("ghost")}>Άκυρο</button>
            <button type="submit" disabled={pending || !picked} className={btn("primary")}>{pending ? "Αποστολή…" : "Αποστολή αιτήματος"}</button>
          </div>
        </form>
      )}
    </section>
  );
}

