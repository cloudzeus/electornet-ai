"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Check } from "lucide-react";
import { createApiKey, toggleApiKey } from "@/app/admin/(shell)/settings/actions";

type Key = { id: string; name: string; prefix: string; scopes: string[]; active: boolean; createdAt: string; lastUsedAt: string | null };

export function ApiKeysPanel({ keys }: { keys: Key[] }) {
  const [created, setCreated] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο Super Admin</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">API keys</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Για συνεργάτες και εξωτερικά συστήματα (marketplaces, ERP middleware, BI). Το κλειδί εμφανίζεται μία φορά· αποθηκεύεται μόνο το hash του.</p>
      </div>
      <form
        action={(fd) => start(async () => { const r = await createApiKey(fd); setMsg(r.message); setCreated(r.key ?? null); setCopied(false); })}
        className="rounded-2xl bg-white border border-eu-line p-5 grid @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end"
      >
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Όνομα
          <input name="name" required placeholder="π.χ. Skroutz feed" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
        </label>
        <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
          Scopes <span className="font-normal text-eu-muted">(με κόμμα)</span>
          <input name="scopes" placeholder="catalog.read, orders.read" className="rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue" />
        </label>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 hover:bg-eu-blue disabled:opacity-50">
          <KeyRound className="size-4" aria-hidden /> Δημιουργία
        </button>
        {msg && (
          <div role="status" aria-live="polite" className="@2xl:col-span-3 grid gap-2">
            <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-14)]">{msg}</p>
            {created && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-eu-navy text-white p-3">
                <code className="font-mono text-[length:var(--fs-15)] break-all">{created}</code>
                <button type="button" onClick={() => navigator.clipboard.writeText(created).then(() => setCopied(true))} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3 min-h-10">
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Αντιγράφηκε" : "Αντιγραφή"}
                </button>
              </div>
            )}
          </div>
        )}
      </form>
      <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
        <table className="w-full border-collapse text-[length:var(--fs-14)]">
          <thead>
            <tr className="text-left text-eu-muted">
              <th className="p-3 font-bold">Όνομα</th>
              <th className="p-3 font-bold">Πρόθεμα</th>
              <th className="p-3 font-bold">Scopes</th>
              <th className="p-3 font-bold">Δημιουργία</th>
              <th className="p-3 font-bold">Τελευταία χρήση</th>
              <th className="p-3 font-bold">Κατάσταση</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-eu-line-2">
                <td className="p-3 font-bold text-eu-ink">{k.name}</td>
                <td className="p-3 font-mono text-eu-ink-2">{k.prefix}…</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="rounded-full bg-eu-surface px-2 py-0.5 text-[length:var(--fs-13)] font-bold text-eu-ink-2">{s}</span>)}{!k.scopes.length && <span className="text-eu-muted">όλα</span>}</div></td>
                <td className="p-3 tabular-nums text-eu-ink-2">{new Date(k.createdAt).toLocaleDateString("el-GR")}</td>
                <td className="p-3 tabular-nums text-eu-ink-2">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("el-GR") : "ποτέ"}</td>
                <td className="p-3">
                  <button type="button" disabled={pending} onClick={() => start(async () => setMsg((await toggleApiKey(k.id, !k.active)).message))} className={`rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${k.active ? "bg-eu-green/10 text-eu-green hover:bg-eu-red/10 hover:text-eu-red" : "bg-eu-surface text-eu-muted hover:bg-eu-green/10 hover:text-eu-green"}`}>
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
