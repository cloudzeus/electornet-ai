"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Landmark, Plus, Trash2 } from "lucide-react";
import { TextField } from "./ui";
import { LogoField } from "@/components/admin/cms/brand/LogoField";
import { MAX_ACCOUNTS, bankFromIban, formatIban, normalizeIban, parseAccounts, validateAccounts, type AccountError, type BankAccount } from "@/lib/payments/bank-accounts";

const EMPTY: BankAccount = { logo: "", bank: "", holder: "", iban: "" };

/**
 * Ρυθμίσεις → Πληρωμές → «Κατάθεση σε τράπεζα»: λίστα λογαριασμών (λογότυπο, τράπεζα, δικαιούχος, IBAN) με σειρά.
 * Η τιμή του πεδίου είναι JSON (κρυφό input `name`)· ο server ξανακάνει τον ίδιο έλεγχο (lib/payments/bank-accounts).
 * Η τράπεζα συμπληρώνεται μόνη της από τον κωδικό του ελληνικού IBAN, όσο ο διαχειριστής δεν την έχει αλλάξει.
 */
export function BankAccountsField({ name, label, help, value, onChange, onDirty, error }: { name: string; label: string; help?: string; value: string; onChange: (v: string) => void; onDirty: () => void; error?: string }) {
  const [rows, setRows] = useState<BankAccount[]>(() => parseAccounts(value));
  // ποιες γραμμές έχουν τράπεζα που βγήκε από το IBAN (αλλάζει μαζί του) — όχι όσες έγραψε ο διαχειριστής
  const [auto, setAuto] = useState<boolean[]>(() => parseAccounts(value).map((a) => !!a.bank && a.bank === bankFromIban(a.iban)));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // σταθερά κλειδιά γραμμών: μετακίνηση / διαγραφή δεν μεταφέρει την κατάσταση (π.χ. του λογοτύπου) σε άλλη γραμμή
  const [ids, setIds] = useState<number[]>(() => parseAccounts(value).map((_, i) => i));

  const commit = (next: BankAccount[], nextAuto = auto) => {
    setRows(next);
    setAuto(nextAuto);
    onChange(next.length ? JSON.stringify(next.map((a) => ({ ...a, iban: normalizeIban(a.iban) }))) : "");
    onDirty();
  };
  const patch = (i: number, p: Partial<BankAccount>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...p } : r));
    const nextAuto = [...auto];
    if (p.iban !== undefined) {
      const found = bankFromIban(p.iban);
      if (found && (!rows[i].bank || auto[i])) { next[i] = { ...next[i], bank: found }; nextAuto[i] = true; }
    }
    if (p.bank !== undefined) nextAuto[i] = false;
    commit(next, nextAuto);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]];
    const nextAuto = [...auto]; [nextAuto[i], nextAuto[j]] = [nextAuto[j], nextAuto[i]];
    setIds((x) => { const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setTouched({});
    commit(next, nextAuto);
  };
  const remove = (i: number) => { setIds((x) => x.filter((_, j) => j !== i)); setTouched({}); commit(rows.filter((_, j) => j !== i), auto.filter((_, j) => j !== i)); };
  const add = () => { setIds((x) => [...x, Math.max(-1, ...x) + 1]); commit([...rows, { ...EMPTY }], [...auto, false]); };

  // λάθη: φαίνονται όταν το πεδίο έχει τιμή ή όταν ο χρήστης το άφησε (ή μετά από αποτυχημένη αποθήκευση)
  const errs = validateAccounts(rows);
  const errOf = (i: number, field: AccountError["field"]) => {
    const e = errs.find((x) => x.index === i && x.field === field);
    if (!e) return null;
    const filled = field === "logo" || String(rows[i][field] ?? "").trim() !== "";
    return filled || touched[`${i}.${field}`] || error ? e.message : null;
  };
  const blur = (i: number, field: string) => setTouched((t) => ({ ...t, [`${i}.${field}`]: true }));

  return (
    <div data-help="settings.bank-accounts" className="grid gap-3 min-w-0">
      <input type="hidden" name={name} value={value} />
      <div>
        <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">{label}</span>
        {help && <p className="m-0 mt-0.5 text-eu-muted text-[length:var(--fs-13)] leading-snug">{help}</p>}
        {error && <p role="alert" className="m-0 mt-1 text-eu-red font-bold text-[length:var(--fs-14)]">{error}</p>}
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-eu-line-2 p-4 flex items-start gap-3 text-eu-ink-2 text-[length:var(--fs-14)]">
          <Landmark className="size-5 shrink-0 text-eu-muted mt-0.5" aria-hidden />
          <span>Δεν υπάρχει λογαριασμός ακόμη. Χωρίς λογαριασμό, η «Κατάθεση σε τράπεζα» δεν εμφανίζεται στο checkout.</span>
        </div>
      )}

      <ol className="m-0 p-0 list-none grid gap-3">
        {rows.map((a, i) => (
          <li key={ids[i] ?? `n${i}`} className="rounded-xl border border-eu-line bg-eu-surface/40 p-3 @md:p-4 grid gap-3 min-w-0" aria-label={`Λογαριασμός ${i + 1}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-bold text-eu-ink text-[length:var(--fs-15)] grow min-w-0 truncate">Λογαριασμός {i + 1}{a.bank ? ` · ${a.bank}` : ""}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Μετακίνηση λογαριασμού ${i + 1} πάνω`} className="inline-flex items-center justify-center size-11 rounded-full text-eu-ink-2 hover:bg-eu-chip disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Μετακίνηση λογαριασμού ${i + 1} κάτω`} className="inline-flex items-center justify-center size-11 rounded-full text-eu-ink-2 hover:bg-eu-chip disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
              <button type="button" onClick={() => remove(i)} aria-label={`Διαγραφή λογαριασμού ${i + 1}`} className="inline-flex items-center justify-center size-11 rounded-full text-eu-red hover:bg-eu-red/10"><Trash2 className="size-4" aria-hidden /></button>
            </div>
            <LogoField value={{ logo: a.logo || undefined, logoAspect: a.logoAspect }} onChange={(v) => patch(i, { logo: v.logo ?? "", logoAspect: v.logoAspect })} brandLogo={null} bg="#ffffff" dark={false} name={a.bank || "Τράπεζα"} />
            {errOf(i, "logo") && <p className="m-0 -mt-1 text-eu-red font-bold text-[length:var(--fs-13)]">{errOf(i, "logo")}</p>}
            <div className="grid gap-3 @2xl:grid-cols-2">
              <div onBlur={() => blur(i, "iban")} className="@2xl:col-span-2 min-w-0">
                <TextField name={`_ba${i}_iban`} label="IBAN" value={a.iban} onChange={(v) => patch(i, { iban: v.toUpperCase() })} placeholder="GR16 0110 1250 0000 0001 2300 695" mono help="Η τράπεζα συμπληρώνεται μόνη της από το IBAN (Εθνική, Alpha, Πειραιώς, Eurobank, Attica). Ελέγχονται και τα ψηφία ελέγχου." error={errOf(i, "iban")} inputMode="text" />
                {!errs.some((e) => e.index === i && e.field === "iban") && a.iban && <p className="m-0 mt-1 font-mono text-eu-green font-bold text-[length:var(--fs-14)] break-all">✓ {formatIban(a.iban)}</p>}
              </div>
              <div onBlur={() => blur(i, "bank")} className="min-w-0">
                <TextField name={`_ba${i}_bank`} label="Τράπεζα" value={a.bank} onChange={(v) => patch(i, { bank: v })} placeholder="π.χ. Εθνική Τράπεζα" error={errOf(i, "bank")} />
              </div>
              <div onBlur={() => blur(i, "holder")} className="min-w-0">
                <TextField name={`_ba${i}_holder`} label="Δικαιούχος" value={a.holder} onChange={(v) => patch(i, { holder: v })} placeholder="π.χ. ΕΥΡΩΝΙΚΣ Α.Ε." error={errOf(i, "holder")} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {rows.length < MAX_ACCOUNTS && (
        <button type="button" onClick={add} className="justify-self-start inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy px-5 min-h-12 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-navy hover:text-white">
          <Plus className="size-4" aria-hidden /> Προσθήκη λογαριασμού
        </button>
      )}
    </div>
  );
}
