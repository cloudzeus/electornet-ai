"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Check, TriangleAlert } from "lucide-react";
import { createApiKey, toggleApiKey } from "@/app/admin/(shell)/settings/actions";
import { inputCls, ResultBanner } from "./settings/ui";

type Key = { id: string; name: string; prefix: string; scopes: string[]; active: boolean; createdAt: string; lastUsedAt: string | null };

/** Τα scopes που ελέγχει σήμερα ο κώδικας (verifyApiKey). Κλειδί χωρίς scope δεν έχει πρόσβαση πουθενά. */
const SCOPES = [
  { value: "pos", label: "Ταμεία καταστημάτων (POS)", help: "Τιμή και προσφορές καλαθιού από το ταμείο — /api/pos/v1/quote. Μόνο ανάγνωση." },
  { value: "*", label: "Πλήρης πρόσβαση", help: "Σε όλα τα σημερινά και μελλοντικά API. Μόνο για εσωτερικά συστήματα εμπιστοσύνης." },
];
const label = (s: string) => SCOPES.find((x) => x.value === s)?.label ?? s;

export function ApiKeysPanel({ keys }: { keys: Key[] }) {
  const [created, setCreated] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [scopes, setScopes] = useState<string[]>(["pos"]);
  const [extra, setExtra] = useState("");
  const [pending, start] = useTransition();
  const all = [...scopes, ...extra.split(",").map((s) => s.trim()).filter(Boolean)];
  return (
    <div className="grid gap-4 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">API keys</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Για εξωτερικά συστήματα (ταμεία καταστημάτων, συνεργάτες, BI). Το κλειδί εμφανίζεται μία φορά· αποθηκεύεται μόνο το hash του. Στέλνεται στο header <code>Authorization: Bearer …</code> ή <code>x-api-key</code>.</p>
      </div>

      <form
        action={(fd) => {
          fd.set("scopes", all.join(","));
          start(async () => { const r = await createApiKey(fd); setMsg({ ok: r.ok, text: r.message }); setCreated(r.key ?? null); setCopied(false); });
        }}
        className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4"
      >
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Νέο κλειδί</h3>
        <label className="grid gap-1 min-w-0">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Όνομα<span className="text-eu-red" aria-hidden> *</span></span>
          <input name="name" required placeholder="π.χ. Ταμεία · κατάστημα Αθήνας" className={inputCls} />
          <span className="text-eu-muted text-[length:var(--fs-13)]">Για να ξέρεις ποιο σύστημα το χρησιμοποιεί όταν χρειαστεί ανάκληση.</span>
        </label>
        <fieldset className="m-0 p-0 border-0 grid gap-2 min-w-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Τι επιτρέπει</legend>
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-2">
            {SCOPES.map((s) => (
              <label key={s.value} className={`flex items-start gap-3 rounded-xl border-2 p-3 min-h-14 cursor-pointer ${scopes.includes(s.value) ? "border-eu-navy bg-eu-chip" : "border-eu-line"}`}>
                <input type="checkbox" checked={scopes.includes(s.value)} onChange={(e) => setScopes((x) => (e.target.checked ? [...x, s.value] : x.filter((v) => v !== s.value)))} className="mt-1 size-5 accent-eu-navy shrink-0" />
                <span className="grid min-w-0"><span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{s.label}</span><span className="text-eu-muted text-[length:var(--fs-13)] leading-snug">{s.help}</span></span>
              </label>
            ))}
          </div>
          <label className="grid gap-1 min-w-0">
            <span className="font-bold text-eu-ink-2 text-[length:var(--fs-13)]">Άλλα scopes (προαιρετικά, με κόμμα)</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="π.χ. catalog.read" className={`${inputCls} font-mono`} />
          </label>
          {!all.length && <span className="inline-flex items-start gap-1.5 text-eu-amber font-bold text-[length:var(--fs-13)]"><TriangleAlert className="size-4 shrink-0" aria-hidden />Χωρίς scope το κλειδί δεν έχει πρόσβαση πουθενά.</span>}
        </fieldset>
        <button type="submit" disabled={pending || !all.length} className="justify-self-start inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 hover:bg-eu-blue disabled:opacity-40 w-full @md:w-auto">
          <KeyRound className="size-4" aria-hidden /> Δημιουργία κλειδιού
        </button>
        {msg && (
          <div aria-live="polite" className="grid gap-2">
            <ResultBanner ok={msg.ok}>{msg.text}</ResultBanner>
            {created && (
              <div className="grid @md:grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-eu-navy text-white p-3">
                <code className="font-mono text-[length:var(--fs-15)] break-all">{created}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(created).then(() => setCopied(true))} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11">
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Αντιγράφηκε" : "Αντιγραφή"}
                </button>
              </div>
            )}
          </div>
        )}
      </form>

      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden @container">
        <table className="eu-rtable w-full border-collapse text-[length:var(--fs-14)]">
          <thead>
            <tr className="text-left text-eu-muted">
              <th className="p-3 font-bold">Όνομα</th>
              <th className="p-3 font-bold">Πρόθεμα</th>
              <th className="p-3 font-bold">Επιτρέπει</th>
              <th className="p-3 font-bold">Δημιουργία</th>
              <th className="p-3 font-bold">Τελευταία χρήση</th>
              <th className="p-3 font-bold">Κατάσταση</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-eu-line-2">
                <td className="p-3 font-bold text-eu-ink">{k.name}</td>
                <td data-label="Πρόθεμα" className="p-3 font-mono text-eu-ink-2">{k.prefix}…</td>
                <td data-label="Επιτρέπει" className="p-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-bold text-eu-ink-2">{label(s)}</span>)}{!k.scopes.length && <span className="text-eu-amber font-bold">τίποτα (χωρίς scope)</span>}</div></td>
                <td data-label="Δημιουργία" className="p-3 tabular-nums text-eu-ink-2">{new Date(k.createdAt).toLocaleDateString("el-GR")}</td>
                <td data-label="Τελευταία χρήση" className="p-3 tabular-nums text-eu-ink-2">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("el-GR") : "ποτέ"}</td>
                <td data-label="Κατάσταση" className="p-3">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => { if (k.active && !window.confirm(`Ανάκληση του «${k.name}»; Το σύστημα που το χρησιμοποιεί σταματά αμέσως να έχει πρόσβαση.`)) return; start(async () => { const r = await toggleApiKey(k.id, !k.active); setMsg({ ok: r.ok, text: r.message }); setCreated(null); }); }}
                    className={`rounded-full px-3 min-h-11 font-bold text-[length:var(--fs-13)] ${k.active ? "bg-eu-green/10 text-eu-green hover:bg-eu-red/10 hover:text-eu-red" : "bg-eu-surface text-eu-muted hover:bg-eu-green/10 hover:text-eu-green"}`}
                  >
                    {k.active ? "Ενεργό · ανάκληση" : "Ανακλημένο · ενεργοποίηση"}
                  </button>
                </td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan={6} className="p-8 text-center text-eu-muted">Κανένα κλειδί ακόμη.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
