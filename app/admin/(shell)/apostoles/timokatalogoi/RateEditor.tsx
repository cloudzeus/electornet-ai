"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Check, CircleAlert, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import type { RateData } from "@/lib/delivery/rates";
import { saveRateTableAction, testRateAction } from "../delivery-actions";

export interface RateRow { id: string; carrier: string; name: string; status: string; validFrom: string | null; updatedAt: string; data: RateData }
const eur = (c: number) => (c / 100).toLocaleString("el-GR", { style: "currency", currency: "EUR" });
const toC = (v: string) => Math.max(0, Math.round((Number(v.replace(",", ".")) || 0) * 100));
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";

export function RateEditor({ carriers, current, rows, defaults, canWrite }: { carriers: { key: string; label: string }[]; current: string; rows: RateRow[]; defaults: RateData; canWrite: boolean }) {
  const router = useRouter();
  const mine = rows.filter((r) => r.carrier === current);
  const published = mine.find((r) => r.status === "published") ?? null;
  const [edit, setEdit] = useState<RateRow | null>(published ?? mine[0] ?? null);
  const [name, setName] = useState(edit?.name ?? "Τιμοκατάλογος");
  const [validFrom, setValidFrom] = useState(edit?.validFrom ?? "");
  const [d, setD] = useState<RateData>(structuredClone(edit?.data ?? defaults));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [saving, startSave] = useTransition();
  const isAgency = current.startsWith("carrier:");
  const [ver, setVer] = useState(0); // τα πεδία είναι uncontrolled: νέα έκδοση → νέα πεδία

  const load = (r: RateRow | null) => { setEdit(r); setName(r?.name ?? "Τιμοκατάλογος"); setValidFrom(r?.validFrom ?? ""); setD(structuredClone(r?.data ?? defaults)); setMsg(null); setVer((v) => v + 1); };
  const setPrice = (table: "prices" | "costs", zone: string, i: number, v: string) => setD((x) => { const t = { ...(x[table] ?? {}) }; const row = [...(t[zone] ?? [])]; row[i] = toC(v); t[zone] = row; return { ...x, [table]: t }; });
  const save = (publish: boolean) => startSave(async () => {
    try {
      const r = await saveRateTableAction({ id: edit?.id ?? null, carrier: current, name, data: d, publish, validFrom: validFrom || null });
      setMsg({ ok: true, t: publish ? "Δημοσιεύτηκε. Το checkout τον χρησιμοποιεί σε λιγότερο από ένα λεπτό." : "Αποθηκεύτηκε ως πρόχειρο. Το checkout δεν άλλαξε." });
      setEdit((e) => ({ ...(e ?? { carrier: current, updatedAt: "", data: d }), id: r.id, status: r.status, name, validFrom: validFrom || null, data: d } as RateRow));
      router.refresh();
    } catch (e) { setMsg({ ok: false, t: e instanceof Error ? e.message : "Δεν αποθηκεύτηκε" }); }
  });

  return (
    <div className="grid gap-4 min-w-0">
      <div data-help="rates.carrier" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 min-w-[240px] flex-1 max-w-md">
          <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Μεταφορέας</span>
          <select className={field} value={current} onChange={(e) => router.push(`?c=${encodeURIComponent(e.target.value)}`)}>
            {carriers.map((c) => <option key={c.key} value={c.key}>{c.label}{rows.some((r) => r.carrier === c.key && r.status === "published") ? " · δημοσιευμένος" : ""}</option>)}
          </select>
        </label>
        {mine.length > 1 && (
          <label className="grid gap-1 min-w-[200px]">
            <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Έκδοση</span>
            <select className={field} value={edit?.id ?? ""} onChange={(e) => load(mine.find((r) => r.id === e.target.value) ?? null)}>
              {mine.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status === "published" ? "δημοσιευμένος" : "πρόχειρο"}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => load(null)} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-navy hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Νέος</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-13)]">
        {edit?.status === "published" ? <span className="inline-flex items-center gap-1 rounded-full bg-eu-green/10 text-eu-green font-bold px-3 py-1"><Check className="size-3.5" aria-hidden /> Δημοσιευμένος: αυτός υπολογίζει τα μεταφορικά</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-eu-amber/15 text-eu-ink font-bold px-3 py-1"><CircleAlert className="size-3.5 text-eu-amber" aria-hidden /> {edit ? "Πρόχειρο: δεν επηρεάζει το checkout" : "Νέος, δεν έχει αποθηκευτεί"}</span>}
        {!published && !isAgency && <span className="text-eu-muted">Σήμερα ισχύει η σταθερή τιμή των ρυθμίσεων.</span>}
      </div>

      <section key={`a${ver}`} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 @2xl:grid-cols-3">
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Όνομα</span><input className={field} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ισχύει από (προαιρετικό)</span><input type="date" className={field} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Κλίμακες βάρους (ανώτατα κιλά)</span>
          <input className={field} defaultValue={d.brackets.join(", ")} onBlur={(e) => { const b = [...new Set(e.target.value.split(/[\s,;]+/).map(Number).filter((n) => n > 0))].sort((a, z) => a - z).slice(0, 12); if (b.length) setD((x) => ({ ...x, brackets: b })); }} />
          <span className="text-eu-muted text-[length:var(--fs-13)]">π.χ. 2, 5, 10, 20, 30. Πάνω από την τελευταία χρεώνεται ανά κιλό.</span>
        </label>
      </section>

      <section key={`b${ver}`} data-help="rates.grid" className="grid gap-3">
        {d.zones.map((z, zi) => (
          <div key={z.id} className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 min-w-0">
            <div className="grid gap-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end">
              <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ζώνη</span><input className={field} value={z.name} onChange={(e) => setD((x) => ({ ...x, zones: x.zones.map((q, i) => (i === zi ? { ...q, name: e.target.value } : q)) }))} /></label>
              <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Τ.Κ. που ξεκινούν από</span>
                <input className={field} defaultValue={z.prefixes.join(", ")} placeholder="κενό = όλοι οι υπόλοιποι" onBlur={(e) => { const p = [...new Set(e.target.value.split(/[\s,;]+/).filter((s) => /^\d{1,5}$/.test(s)))]; setD((x) => ({ ...x, zones: x.zones.map((q, i) => (i === zi ? { ...q, prefixes: p } : q)) })); }} />
              </label>
              {d.zones.length > 1 && <button type="button" aria-label={`Διαγραφή ζώνης ${z.name}`} onClick={() => setD((x) => ({ ...x, zones: x.zones.filter((_, i) => i !== zi) }))} className="inline-flex items-center justify-center rounded-lg border border-eu-line size-11 text-eu-red hover:border-eu-red"><Trash2 className="size-4" aria-hidden /></button>}
            </div>
            <div className="grid grid-cols-2 @xl:grid-cols-3 @4xl:grid-cols-6 gap-2">
              {d.brackets.map((b, i) => (
                <div key={b} className="grid gap-1 rounded-xl bg-eu-chip/60 p-2">
                  <span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">έως {b} κιλά</span>
                  <label className="grid gap-0.5"><span className="text-eu-muted text-[length:var(--fs-13)]">{isAgency ? "Χρέωση πελάτη" : "Τιμή πελάτη"} €</span><input inputMode="decimal" className={field} defaultValue={((d.prices[z.id]?.[i] ?? 0) / 100).toString()} onBlur={(e) => setPrice("prices", z.id, i, e.target.value)} /></label>
                  <label className="grid gap-0.5"><span className="text-eu-muted text-[length:var(--fs-13)]">Κόστος μας €</span><input inputMode="decimal" className={field} defaultValue={d.costs?.[z.id]?.[i] != null ? (d.costs[z.id][i] / 100).toString() : ""} placeholder="—" onBlur={(e) => setPrice("costs", z.id, i, e.target.value)} /></label>
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setD((x) => ({ ...x, zones: [...x.zones, { id: `z${Date.now().toString(36)}`, name: "Νέα ζώνη", prefixes: [] }] }))} className="justify-self-start inline-flex items-center gap-1.5 rounded-full border border-eu-line px-4 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-navy hover:border-eu-navy"><Plus className="size-4" aria-hidden /> Ζώνη</button>
      </section>

      <section key={`c${ver}`} data-help="rates.extras" className="rounded-2xl bg-white border border-eu-line p-4 grid gap-3 @2xl:grid-cols-4">
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Ανά επιπλέον κιλό €</span><input inputMode="decimal" className={field} defaultValue={(d.extraPerKg / 100).toString()} onBlur={(e) => setD((x) => ({ ...x, extraPerKg: toC(e.target.value) }))} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Δυσπρόσιτα: Τ.Κ.</span><input className={field} defaultValue={d.remote.prefixes.join(", ")} placeholder="π.χ. 84001, 8500" onBlur={(e) => setD((x) => ({ ...x, remote: { ...x.remote, prefixes: e.target.value.split(/[\s,;]+/).filter((s) => /^\d{1,5}$/.test(s)) } }))} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Επιβάρυνση δυσπρόσιτων €</span><input inputMode="decimal" className={field} defaultValue={(d.remote.surcharge / 100).toString()} onBlur={(e) => setD((x) => ({ ...x, remote: { ...x.remote, surcharge: toC(e.target.value) } }))} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Δωρεάν από €</span><input inputMode="decimal" className={field} defaultValue={d.freeFrom != null ? (d.freeFrom / 100).toString() : ""} placeholder="ποτέ" onBlur={(e) => setD((x) => ({ ...x, freeFrom: e.target.value.trim() ? toC(e.target.value) : null }))} /></label>
        <label className="flex items-center gap-2 @2xl:col-span-4 text-[length:var(--fs-14)] text-eu-ink min-h-11"><input type="checkbox" className="size-5" checked={d.freeExcludesBulky} onChange={(e) => setD((x) => ({ ...x, freeExcludesBulky: e.target.checked }))} /> Το «δωρεάν από» δεν ισχύει για ογκώδη (μεταφορική)</label>
      </section>

      <TestCalc data={d} />

      {msg && <p role="status" className={`m-0 rounded-xl p-3 text-[length:var(--fs-14)] ${msg.ok ? "bg-eu-green/10 text-eu-ink" : "bg-eu-red/10 text-eu-red"}`}>{msg.t}</p>}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} onClick={() => save(false)} className="inline-flex items-center gap-1.5 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-5 min-h-11 disabled:opacity-60">{saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />} Αποθήκευση ως πρόχειρο</button>
          <button type="button" disabled={saving} onClick={() => save(true)} className="inline-flex items-center gap-1.5 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-5 min-h-11 disabled:opacity-60"><Send className="size-4" aria-hidden /> Δημοσίευση στο checkout</button>
        </div>
      ) : <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Μόνο προβολή: η αλλαγή θέλει δικαίωμα ρυθμίσεων.</p>}
    </div>
  );
}

function TestCalc({ data }: { data: RateData }) {
  const [zip, setZip] = useState("54624"), [kg, setKg] = useState("12"), [goods, setGoods] = useState("450"), [bulky, setBulky] = useState(true);
  const [res, setRes] = useState<Awaited<ReturnType<typeof testRateAction>> | undefined>(undefined);
  const [busy, start] = useTransition();
  return (
    <section data-help="rates.test" className="rounded-2xl border border-eu-blue/30 bg-eu-chip/50 p-4 grid gap-3">
      <div className="font-heading font-bold text-eu-ink text-[length:var(--fs-17)] inline-flex items-center gap-2"><Calculator className="size-4 text-eu-blue" aria-hidden /> Δοκιμαστικός υπολογισμός</div>
      <div className="grid grid-cols-2 @2xl:grid-cols-5 gap-2 items-end">
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Τ.Κ.</span><input inputMode="numeric" maxLength={5} className={field} value={zip} onChange={(e) => setZip(e.target.value)} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Κιλά</span><input inputMode="decimal" className={field} value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Καλάθι €</span><input inputMode="decimal" className={field} value={goods} onChange={(e) => setGoods(e.target.value)} /></label>
        <label className="flex items-center gap-2 min-h-11 text-[length:var(--fs-14)]"><input type="checkbox" className="size-5" checked={bulky} onChange={(e) => setBulky(e.target.checked)} /> Ογκώδες</label>
        <button type="button" disabled={busy} onClick={() => start(async () => setRes(await testRateAction(data, zip, Number(kg.replace(",", ".")), Number(goods.replace(",", ".")), bulky)))} className="rounded-full bg-eu-blue text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 disabled:opacity-60">Υπολόγισε</button>
      </div>
      {res === null && <p className="m-0 text-eu-amber text-[length:var(--fs-14)] font-bold">Δεν βγαίνει τιμή: έλεγξε τον Τ.Κ. (5 ψηφία) ή ότι η ζώνη έχει τιμές.</p>}
      {res && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[length:var(--fs-14)]">
          <span>Ζώνη <b className="text-eu-navy">{res.zone}</b>{res.remote ? " · δυσπρόσιτη" : ""}</span>
          <span>Πληρώνει ο πελάτης <b className={res.fee === 0 ? "text-eu-green" : "text-eu-navy"}>{res.fee === 0 ? "Δωρεάν" : eur(res.fee)}</b>{res.free ? ` (κανονικά ${eur(res.baseFee)})` : ""}</span>
          {res.cost != null && <span>Κόστος μας <b className="text-eu-navy">{eur(res.cost)}</b> · {res.fee - res.cost >= 0 ? <b className="text-eu-green">κέρδος {eur(res.fee - res.cost)}</b> : <b className="text-eu-red">ζημιά {eur(res.cost - res.fee)}</b>}</span>}
        </div>
      )}
    </section>
  );
}
