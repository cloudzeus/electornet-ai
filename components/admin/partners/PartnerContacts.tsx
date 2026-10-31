"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Mail, Plus, UserPlus } from "lucide-react";
import { addPartnerContact, grantPortalAccess, newPasswordLink, setPortalAccountActive } from "@/app/admin/(shell)/synergates/actions";
import { CONTACT_ROLES } from "@/lib/partner-portal/contact-roles";

export type ContactRow = { id: string; name: string; email: string | null; phone: string | null; role: string; isPrimary: boolean; account: { id: string; active: boolean; hasPassword: boolean; lastLoginAt: string | null; lockedUntil: string | null; pendingLink: string | null } | null };

const btn = "inline-flex items-center gap-2 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50 border-2 border-eu-navy text-eu-navy hover:bg-eu-navy hover:text-white";
const input = "min-h-11 rounded-lg border border-eu-line px-3 text-[length:var(--fs-14)] w-full min-w-0 bg-white";
const fmt = (d: string) => new Date(d).toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" });

/** Επαφές μέλους και πρόσβαση στην πύλη συνεργατών: προσθήκη επαφής, πρόσκληση (email ή link για αντιγραφή), νέο link, απενεργοποίηση. */
export function PartnerContacts({ partnerId, contacts, canWrite }: { partnerId: string; contacts: ContactRow[]; canWrite: boolean }) {
  const [adding, setAdding] = useState(!contacts.length && canWrite);
  return (
    <div className="grid gap-2">
      <ul className="m-0 p-0 list-none grid gap-2">
        {contacts.map((c) => <ContactItem key={c.id} c={c} canWrite={canWrite} />)}
        {!contacts.length && <li className="text-eu-ink-3 text-[length:var(--fs-14)]">Καμία επαφή ακόμη.</li>}
      </ul>
      {canWrite && (adding ? <AddContact partnerId={partnerId} onDone={() => setAdding(false)} /> : <button type="button" className={`${btn} justify-self-start`} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Νέα επαφή</button>)}
    </div>
  );
}

function ContactItem({ c, canWrite }: { c: ContactRow; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; hours: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const a = c.account;
  const run = (fn: () => Promise<{ ok: true; url: string | null; hours: number; email: string } | { ok: false; error: string }>) => start(async () => {
    setMsg(null); setLink(null); setCopied(false);
    const r = await fn();
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    if (r.url) setLink({ url: r.url, hours: r.hours }); else setMsg({ ok: true, text: `Στάλθηκε email στο ${r.email} (ισχύει ${r.hours} ώρες).` });
  });
  const status = !a ? "Χωρίς πρόσβαση" : !a.active ? "Ανενεργός" : a.lockedUntil && new Date(a.lockedUntil) > new Date() ? `Κλειδωμένος έως ${fmt(a.lockedUntil)}` : !a.hasPassword ? (a.pendingLink ? `Περιμένει να ορίσει κωδικό πύλης (link έως ${fmt(a.pendingLink)})` : "Δεν έχει ορίσει ακόμη κωδικό εισόδου στην πύλη") : a.lastLoginAt ? `Τελευταία είσοδος ${fmt(a.lastLoginAt)}` : "Δεν έχει μπει ακόμη";
  return (
    <li className="rounded-xl border border-eu-line bg-white p-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start min-w-0">
      <div className="min-w-0">
        <b className="break-words">{c.name}</b>{c.isPrimary && <span className="ml-2 rounded-full bg-eu-chip px-2 py-0.5 text-[length:var(--fs-12)] font-bold">κύρια</span>}
        <span className="block text-eu-ink-3 text-[length:var(--fs-13)] break-words">{[CONTACT_ROLES[c.role as keyof typeof CONTACT_ROLES] ?? c.role, c.email, c.phone].filter(Boolean).join(" · ")}</span>
        <span className={`block text-[length:var(--fs-13)] font-bold ${a?.active ? "text-emerald-800" : "text-eu-ink-3"}`}>Πύλη συνεργατών: {status}</span>
      </div>
      {canWrite && (
        <div className="flex flex-wrap gap-2 md:justify-end">
          {!a ? (
            <>
              <button type="button" disabled={pending || !c.email} className={btn} onClick={() => run(() => grantPortalAccess(c.id, true))}><Mail className="size-4" aria-hidden /> Πρόσκληση με email</button>
              <button type="button" disabled={pending || !c.email} className={btn} onClick={() => run(() => grantPortalAccess(c.id, false))}><UserPlus className="size-4" aria-hidden /> Πρόσβαση + link</button>
            </>
          ) : (
            <>
              {a.active && <button type="button" disabled={pending} className={btn} onClick={() => run(() => newPasswordLink(a.id, true))}><Mail className="size-4" aria-hidden /> Link με email</button>}
              {a.active && <button type="button" disabled={pending} className={btn} onClick={() => run(() => newPasswordLink(a.id, false))}><KeyRound className="size-4" aria-hidden /> Link για αντιγραφή</button>}
              <button type="button" disabled={pending} className={btn} onClick={() => start(async () => { if (a.active && !confirm(`Απενεργοποίηση πρόσβασης για ${c.name}; Αποσυνδέεται αμέσως.`)) return; await setPortalAccountActive(a.id, !a.active); })}>{a.active ? "Απενεργοποίηση" : "Ενεργοποίηση"}</button>
            </>
          )}
          {!c.email && !a && <span className="text-amber-900 text-[length:var(--fs-12)] basis-full md:text-right">Χρειάζεται email για πρόσβαση.</span>}
        </div>
      )}
      {link && (
        <div className="md:col-span-2 grid gap-1 rounded-lg bg-amber-50 p-2.5">
          <span className="text-[length:var(--fs-12)] text-amber-900 font-bold">Link ορισμού κωδικού για την πύλη συνεργατών (όχι για τη διαχείριση) — ισχύει {link.hours} ώρες, μία χρήση. Δώσ&apos; το μόνο στον ίδιο (καταγράφεται).</span>
          <div className="flex gap-2 min-w-0">
            <input readOnly value={link.url} className={`${input} font-mono text-[length:var(--fs-12)]`} aria-label="Link κωδικού" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className={btn} onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Αντιγράφηκε" : "Αντιγραφή"}</button>
          </div>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 md:col-span-2 text-[length:var(--fs-13)] ${msg.ok ? "text-emerald-800" : "text-eu-red"}`}>{msg.text}</p>}
    </li>
  );
}

function AddContact({ partnerId, onDone }: { partnerId: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "owner", isPrimary: false });
  const [err, setErr] = useState<{ error: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  const fe = (k: string) => err?.fields?.[k] && <span role="alert" className="text-eu-red text-[length:var(--fs-12)]">{err.fields[k]}</span>;
  return (
    <form className="rounded-xl border-2 border-dashed border-eu-line bg-white p-3 grid gap-2 sm:grid-cols-2 min-w-0" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await addPartnerContact(partnerId, f); if (r.ok) onDone(); else setErr(r); }); }}>
      <label className="grid gap-1 min-w-0"><span className="text-eu-ink-3 text-[length:var(--fs-12)]">Ονοματεπώνυμο</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} autoComplete="off" />{fe("name")}</label>
      <label className="grid gap-1 min-w-0"><span className="text-eu-ink-3 text-[length:var(--fs-12)]">Ρόλος</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={input}>{Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{fe("role")}</label>
      <label className="grid gap-1 min-w-0"><span className="text-eu-ink-3 text-[length:var(--fs-12)]">Email (για πρόσβαση στην πύλη)</span><input type="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} autoComplete="off" />{fe("email")}</label>
      <label className="grid gap-1 min-w-0"><span className="text-eu-ink-3 text-[length:var(--fs-12)]">Τηλέφωνο</span><input type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} autoComplete="off" />{fe("phone")}</label>
      <label className="inline-flex items-center gap-2 min-h-11 sm:col-span-2"><input type="checkbox" checked={f.isPrimary} onChange={(e) => setF({ ...f, isPrimary: e.target.checked })} className="size-5 accent-eu-navy" /><span className="text-[length:var(--fs-14)]">Κύρια επαφή</span></label>
      {err && !err.fields && <p role="alert" className="m-0 sm:col-span-2 text-eu-red text-[length:var(--fs-13)]">{err.error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={pending} className={btn}>Αποθήκευση</button><button type="button" onClick={onDone} className="min-h-11 px-4 text-eu-blue font-bold text-[length:var(--fs-14)]">Άκυρο</button></div>
    </form>
  );
}
