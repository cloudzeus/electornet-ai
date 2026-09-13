"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Download, ShieldAlert, RefreshCw, Link2, Search, Printer, Pin } from "lucide-react";
import { sendPasswordReset, saveCustomer, saveAddress, deleteAddress, setConsent, addNote, addLoyalty, saveDevice, updateTicket, createTicket, erpPush, erpPull, erpSearch, erpLink, gdprExport, gdprAnonymise, type CustomerInput, type AddressInput } from "@/app/admin/(shell)/customers/actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const TABS = [["profile", "Προφίλ"], ["addresses", "Διευθύνσεις"], ["orders", "Παραγγελίες"], ["devices", "Συσκευές & εγγυήσεις"], ["service", "Service"], ["consents", "Συναινέσεις"], ["logins", "Συνδέσεις"], ["loyalty", "Πόντοι"], ["notes", "Σημειώσεις"], ["erp", "SoftOne"], ["gdpr", "GDPR"]] as const;
const CONSENT_TOPICS: { topic: string; label: string; channels: string[] }[] = [
  { topic: "newsletter", label: "Newsletter", channels: ["email"] },
  { topic: "offers", label: "Προσφορές & ειδοποιήσεις", channels: ["email", "sms", "viber", "push"] },
  { topic: "price-drop", label: "Πτώση τιμής", channels: ["email", "push"] },
  { topic: "back-in-stock", label: "Διαθεσιμότητα", channels: ["email", "sms"] },
  { topic: "service", label: "Service & εγγυήσεις", channels: ["email", "sms"] },
  { topic: "profiling", label: "Προσωποποίηση (profiling)", channels: ["web"] },
];
const field = "rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue bg-white w-full disabled:bg-eu-surface";
const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";
const btn = "inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50";
const btn2 = "inline-flex items-center gap-1.5 rounded-full border-2 border-eu-line px-3 min-h-10 font-bold text-eu-ink text-[length:var(--fs-14)] hover:border-eu-navy disabled:opacity-50";
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("el-GR") : "—");
const d = (s?: string | null) => (s ? new Date(s).toLocaleDateString("el-GR") : "—");
const warrantyStatus = (dev: Any) => { const until = dev.extendedUntil ?? dev.warrantyUntil; if (!until) return { t: "—", cls: "text-eu-muted" }; const days = Math.ceil((new Date(until).getTime() - Date.now()) / 86400000); return days < 0 ? { t: `Έληξε ${d(until)}`, cls: "text-eu-red" } : days < 90 ? { t: `Λήγει σε ${days} ημ.`, cls: "text-eu-amber" } : { t: `Σε εγγύηση έως ${d(until)}`, cls: "text-eu-green" }; };
const Card = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">{title}</h3>{right}</div>{children}</section>
);

export function CustomerWorkspace({ customer, stores, perms, erpConfigured }: { customer: Any | null; stores: { id: string; name: string; city: string }[]; perms: { write: boolean; export: boolean; service: boolean }; erpConfigured: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("profile");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = customer;
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okMsg = "Αποθηκεύτηκε.") => start(async () => { const r = await fn(); setMsg(r.ok ? okMsg : (r.error as string) ?? "Σφάλμα"); if (r.ok) router.refresh(); });
  const name = c ? (c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`) : "Νέος πελάτης";

  return (
    <div className="eu-container grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{c ? `Πελάτης #${c.number} · ${c.type === "business" ? "εταιρεία" : "ιδιώτης"} · ${c.source}` : "Λιανική"}</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{name}</h2>
          {c && <div className="text-eu-ink-3 text-[length:var(--fs-14)]">{c.email}{c.mobile ? ` · ${c.mobile}` : c.phone ? ` · ${c.phone}` : ""} · μέλος από {d(c.createdAt)}{c.lastLoginAt ? ` · τελευταία σύνδεση ${dt(c.lastLoginAt)}` : ""}</div>}
        </div>
        {c && (
          <div className="flex flex-wrap gap-2 text-[length:var(--fs-13)] font-bold">
            <span className={`rounded-full px-3 py-1 ${c.status === "active" ? "bg-eu-green/10 text-eu-green" : c.status === "blocked" ? "bg-eu-red/10 text-eu-red" : "bg-eu-surface text-eu-muted"}`}>{c.status === "active" ? "Ενεργός" : c.status === "blocked" ? "Μπλοκαρισμένος" : "Ανωνυμοποιημένος"}</span>
            <span className={`rounded-full px-3 py-1 ${c.erpTrdr ? "bg-eu-navy/10 text-eu-navy" : "bg-eu-surface text-eu-muted"}`}>{c.erpTrdr ? `SoftOne ${c.erpCode ?? c.erpTrdr}` : "Χωρίς SoftOne"}</span>
            <span className="rounded-full px-3 py-1 bg-eu-yellow/40 text-eu-navy">{c.loyaltyPoints.toLocaleString("el-GR")} πόντοι{c.loyaltyTier ? ` · ${c.loyaltyTier}` : ""}</span>
          </div>
        )}
      </div>
      {msg && <p role="status" className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">{msg}</p>}
      {c && (
        <nav aria-label="Ενότητες" className="flex flex-wrap gap-1.5">
          {TABS.map(([k, l]) => { const n = k === "addresses" ? c.addresses.length : k === "orders" ? c.orders.length : k === "devices" ? c.devices.length : k === "service" ? c.tickets.length : k === "consents" ? c.consents.length : k === "logins" ? c.logins.length : k === "notes" ? c.customerNotes.length : k === "gdpr" ? c.gdprRequests.length : null; return (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 min-h-9 font-bold text-[length:var(--fs-13)] ${tab === k ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`}>{l}{n ? <span className="opacity-70"> {n}</span> : null}</button>
          ); })}
        </nav>
      )}

      {(tab === "profile" || !c) && <ProfileTab c={c} stores={stores} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "addresses" && <AddressesTab c={c} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "orders" && <Card title="Παραγγελίες">{c.orders.length ? <table className="w-full text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">Αριθμός</th><th>Ημερομηνία</th><th>Κατάσταση</th><th>Παράδοση</th><th className="text-right">Σύνολο</th></tr></thead><tbody>{c.orders.map((o: Any) => <tr key={o.id} className="border-t border-eu-line-2"><td className="py-2 font-bold">{o.number}</td><td>{d(o.createdAt)}</td><td>{o.status}</td><td>{o.fulfilment}</td><td className="text-right tabular-nums">{Number(o.total).toLocaleString("el-GR", { style: "currency", currency: "EUR" })}</td></tr>)}</tbody></table> : <p className="m-0 text-eu-muted">Καμία παραγγελία ακόμη. Οι παραγγελίες καταστήματος θα εμφανίζονται εδώ από το SoftOne (FINDOC) μετά τη σύνδεση.</p>}</Card>}
      {c && tab === "devices" && <DevicesTab c={c} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "service" && <ServiceTab c={c} stores={stores} canWrite={perms.service} run={run} pending={pending} />}
      {c && tab === "consents" && <ConsentsTab c={c} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "logins" && <Card title="Ιστορικό συνδέσεων" right={<span className="text-eu-muted text-[length:var(--fs-13)]">Πραγματική IP, λειτουργικό, browser, συσκευή — ανά προσπάθεια</span>}>{c.logins.length ? <div className="overflow-x-auto"><table className="w-full text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">Πότε</th><th>Αποτέλεσμα</th><th>Μέθοδος</th><th>IP</th><th>Συσκευή</th><th>User agent</th></tr></thead><tbody>{c.logins.map((l: Any) => <tr key={l.id} className="border-t border-eu-line-2 align-top"><td className="py-2 tabular-nums whitespace-nowrap">{dt(l.at)}</td><td className={l.success ? "text-eu-green font-bold" : "text-eu-red font-bold"}>{l.success ? "Επιτυχία" : `Αποτυχία (${l.reason ?? "—"})`}</td><td>{l.method}</td><td className="font-mono text-[length:var(--fs-13)]">{l.ip ?? "—"}</td><td>{[l.os, l.browser, l.device].filter(Boolean).join(" · ") || "—"}</td><td className="text-eu-muted text-[length:var(--fs-13)] max-w-[280px] truncate" title={l.userAgent ?? ""}>{l.userAgent ?? "—"}</td></tr>)}</tbody></table></div> : <p className="m-0 text-eu-muted">Καμία σύνδεση ακόμη — καταγράφονται αυτόματα με τη σύνδεση πελατών στο site (και οι αποτυχημένες).</p>}</Card>}
      {c && tab === "loyalty" && <LoyaltyTab c={c} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "notes" && <NotesTab c={c} canWrite={perms.write} run={run} pending={pending} />}
      {c && tab === "erp" && <ErpTab c={c} canWrite={perms.write} erpConfigured={erpConfigured} run={run} pending={pending} />}
      {c && tab === "gdpr" && <GdprTab c={c} perms={perms} run={run} pending={pending} />}
      {c && <Card title="Χρονολόγιο"><ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{c.events.slice(0, 30).map((e: Any) => <li key={e.id} className="grid grid-cols-[150px_110px_minmax(0,1fr)] gap-2 border-t border-eu-line-2 py-1.5"><span className="tabular-nums text-eu-muted">{dt(e.at)}</span><span className="font-bold">{e.kind}</span><span className="text-eu-ink-2 truncate">{e.meta ? JSON.stringify(e.meta).slice(0, 140) : ""}</span></li>)}</ul></Card>}
    </div>
  );
}

function ProfileTab({ c, stores, canWrite, run, pending }: { c: Any; stores: { id: string; name: string; city: string }[]; canWrite: boolean; run: Any; pending: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<CustomerInput>({ type: c?.type ?? "individual", email: c?.email ?? "", firstName: c?.firstName ?? "", lastName: c?.lastName ?? "", company: c?.company ?? "", vatNumber: c?.vatNumber ?? "", doy: c?.doy ?? "", profession: c?.profession ?? "", phone: c?.phone ?? "", mobile: c?.mobile ?? "", birthday: c?.birthday ? c.birthday.slice(0, 10) : "", gender: c?.gender ?? "", status: c?.status === "blocked" ? "blocked" : "active", newsletter: c?.newsletter ?? false, tags: c?.tags ?? [], preferredStoreId: c?.preferredStoreId ?? "", loyaltyTier: c?.loyaltyTier ?? "", loyaltyCard: c?.loyaltyCard ?? "", notes: c?.notes ?? "" });
  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setF((s) => ({ ...s, [k]: v }));
  const dis = !canWrite || c?.status === "anonymised";
  return (
    <Card title="Στοιχεία" right={canWrite && <button type="button" disabled={pending || dis} onClick={() => run(async () => { const r = await saveCustomer(c?.id ?? null, f); if (r.ok && !c) router.replace(`/admin/customers/${r.id}`); return r; })} className={btn}><Check className="size-4" aria-hidden /> Αποθήκευση</button>}>
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3 gap-3">
        <label className={label}>Τύπος<select value={f.type} onChange={(e) => set("type", e.target.value as CustomerInput["type"])} disabled={dis} className={field}><option value="individual">Ιδιώτης</option><option value="business">Εταιρεία / επαγγελματίας</option></select></label>
        <label className={label}>Email<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Κατάσταση<select value={f.status} onChange={(e) => set("status", e.target.value as CustomerInput["status"])} disabled={dis} className={field}><option value="active">Ενεργός</option><option value="blocked">Μπλοκαρισμένος (περιορισμός επεξεργασίας)</option></select></label>
        <label className={label}>Όνομα<input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Επώνυμο<input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} disabled={dis} className={field} /></label>
        {f.type === "business" && <label className={label}>Επωνυμία εταιρείας<input value={f.company} onChange={(e) => set("company", e.target.value)} disabled={dis} className={field} /></label>}
        <label className={label}>ΑΦΜ<input value={f.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} disabled={dis} className={`${field} font-mono`} inputMode="numeric" /></label>
        <label className={label}>ΔΟΥ<input value={f.doy} onChange={(e) => set("doy", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Επάγγελμα<input value={f.profession} onChange={(e) => set("profession", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Τηλέφωνο<input value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Κινητό<input value={f.mobile} onChange={(e) => set("mobile", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Γενέθλια<input type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} disabled={dis} className={field} /></label>
        <label className={label}>Φύλο<select value={f.gender} onChange={(e) => set("gender", e.target.value)} disabled={dis} className={field}><option value="">—</option><option value="f">Γυναίκα</option><option value="m">Άνδρας</option><option value="other">Άλλο</option></select></label>
        <label className={label}>Κατάστημα προτίμησης<select value={f.preferredStoreId} onChange={(e) => set("preferredStoreId", e.target.value)} disabled={dis} className={field}><option value="">—</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.city} — {s.name}</option>)}</select></label>
        <label className={label}>Επίπεδο loyalty<select value={f.loyaltyTier} onChange={(e) => set("loyaltyTier", e.target.value)} disabled={dis} className={field}><option value="">—</option><option value="bronze">Bronze</option><option value="silver">Silver</option><option value="gold">Gold</option></select></label>
        <label className={label}>Κάρτα loyalty<input value={f.loyaltyCard} onChange={(e) => set("loyaltyCard", e.target.value)} disabled={dis} className={`${field} font-mono`} /></label>
        <label className={label}>Tags <span className="font-normal text-eu-muted">(με κόμμα)</span><input value={f.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} disabled={dis} className={field} /></label>
        <label className="inline-flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)] min-h-11 self-end"><input type="checkbox" checked={f.newsletter} onChange={(e) => set("newsletter", e.target.checked)} disabled={dis} className="size-5 accent-eu-navy" /> Newsletter <span className="font-normal text-eu-muted">(η αλλαγή καταγράφεται ως συναίνεση από διαχείριση)</span></label>
      </div>
      <label className={label}>Εσωτερικές σημειώσεις προφίλ<textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={dis} className={`${field} py-2`} /></label>
      {c?.social?.length > 0 && <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Social login: {c.social.map((s: Any) => s.provider).join(", ")}</p>}
      {c && canWrite && c.status === "active" && <div className="flex flex-wrap items-center gap-2 border-t border-eu-line-2 pt-3"><button type="button" disabled={pending} onClick={() => run(() => sendPasswordReset(c.id), "Στάλθηκε email με κωδικό OTP επαναφοράς στον πελάτη.")} className={btn2}>Αποστολή κωδικού επαναφοράς (OTP)</button><span className="text-eu-muted text-[length:var(--fs-13)]">Ο πελάτης λαμβάνει 6ψήφιο κωδικό στο email του· το προσωπικό δεν βλέπει ποτέ κωδικούς.</span></div>}
    </Card>
  );
}

function AddressesTab({ c, canWrite, run, pending }: { c: Any; canWrite: boolean; run: Any; pending: boolean }) {
  const empty: AddressInput = { label: "", kind: "shipping", recipient: "", street: "", number: "", floor: "", doorbell: "", city: "", zip: "", region: "", phone: "", notes: "", isDefault: c.addresses.length === 0, isBilling: false };
  const [edit, setEdit] = useState<{ id: string | null; a: AddressInput } | null>(null);
  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) => setEdit((e) => (e ? { ...e, a: { ...e.a, [k]: v } } : e));
  return (
    <Card title="Διευθύνσεις" right={canWrite && <button type="button" onClick={() => setEdit({ id: null, a: empty })} className={btn}><Plus className="size-4" aria-hidden /> Νέα διεύθυνση</button>}>
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-3">
        {c.addresses.map((a: Any) => (
          <li key={a.id} className="rounded-xl border border-eu-line p-3 text-[length:var(--fs-14)]">
            <div className="flex items-center gap-2 font-bold text-eu-ink">{a.label ?? "Διεύθυνση"}{a.isDefault && <span className="rounded-full bg-eu-navy text-white px-2 text-[length:var(--fs-13)]">προεπιλογή</span>}{a.isBilling && <span className="rounded-full bg-eu-yellow/50 text-eu-navy px-2 text-[length:var(--fs-13)]">τιμολόγηση</span>}{a.erpBranch != null && <span className="text-eu-muted text-[length:var(--fs-13)]">CUSBRANCH #{a.erpBranch}</span>}</div>
            <div className="text-eu-ink-2">{a.recipient && <div>{a.recipient}</div>}{a.street} {a.number}{a.floor ? `, ${a.floor}` : ""}{a.doorbell ? ` (κουδούνι ${a.doorbell})` : ""}<br />{a.zip} {a.city}, {a.region}{a.phone ? ` · ${a.phone}` : ""}</div>
            {a.notes && <div className="text-eu-muted text-[length:var(--fs-13)] mt-1">{a.notes}</div>}
            {canWrite && <div className="flex gap-2 mt-2"><button type="button" onClick={() => setEdit({ id: a.id, a: { label: a.label ?? "", kind: a.kind, recipient: a.recipient ?? "", street: a.street, number: a.number ?? "", floor: a.floor ?? "", doorbell: a.doorbell ?? "", city: a.city, zip: a.zip, region: a.region, phone: a.phone ?? "", notes: a.notes ?? "", isDefault: a.isDefault, isBilling: a.isBilling } })} className={btn2}>Επεξεργασία</button><button type="button" disabled={pending} onClick={() => confirm("Διαγραφή διεύθυνσης;") && run(() => deleteAddress(c.id, a.id), "Διαγράφηκε.")} className={`${btn2} text-eu-red border-eu-red/30`}><Trash2 className="size-4" aria-hidden /></button></div>}
          </li>
        ))}
        {!c.addresses.length && <li className="text-eu-muted">Καμία διεύθυνση.</li>}
      </ul>
      {edit && (
        <div className="rounded-xl bg-eu-surface/60 border border-eu-line p-4 grid gap-3">
          <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
            <label className={label}>Ετικέτα<input value={edit.a.label} onChange={(e) => set("label", e.target.value)} placeholder="Σπίτι, Γραφείο…" className={field} /></label>
            <label className={label}>Παραλήπτης<input value={edit.a.recipient} onChange={(e) => set("recipient", e.target.value)} className={field} /></label>
            <label className={label}>Τηλέφωνο<input value={edit.a.phone} onChange={(e) => set("phone", e.target.value)} className={field} /></label>
            <label className={`${label} @2xl:col-span-2`}>Οδός<input value={edit.a.street} onChange={(e) => set("street", e.target.value)} className={field} /></label>
            <label className={label}>Αριθμός<input value={edit.a.number} onChange={(e) => set("number", e.target.value)} className={field} /></label>
            <label className={label}>Όροφος<input value={edit.a.floor} onChange={(e) => set("floor", e.target.value)} className={field} /></label>
            <label className={label}>Κουδούνι<input value={edit.a.doorbell} onChange={(e) => set("doorbell", e.target.value)} className={field} /></label>
            <label className={label}>ΤΚ<input value={edit.a.zip} onChange={(e) => set("zip", e.target.value)} className={field} /></label>
            <label className={label}>Πόλη<input value={edit.a.city} onChange={(e) => set("city", e.target.value)} className={field} /></label>
            <label className={label}>Νομός<input value={edit.a.region} onChange={(e) => set("region", e.target.value)} className={field} /></label>
            <label className={label}>Σημειώσεις παράδοσης<input value={edit.a.notes} onChange={(e) => set("notes", e.target.value)} className={field} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[length:var(--fs-14)] font-bold"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={edit.a.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="size-4 accent-eu-navy" /> Προεπιλογή αποστολής</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={edit.a.isBilling} onChange={(e) => set("isBilling", e.target.checked)} className="size-4 accent-eu-navy" /> Διεύθυνση τιμολόγησης</label></div>
          <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => run(async () => { const r = await saveAddress(c.id, edit.id, edit.a); if (r.ok) setEdit(null); return r; })} className={btn}><Check className="size-4" aria-hidden /> Αποθήκευση</button><button type="button" onClick={() => setEdit(null)} className={btn2}>Άκυρο</button></div>
        </div>
      )}
    </Card>
  );
}

function DevicesTab({ c, canWrite, run, pending }: { c: Any; canWrite: boolean; run: Any; pending: boolean }) {
  const empty = { brand: "", title: "", model: "", serial: "", purchasedAt: "", warrantyMonths: 24, extendedUntil: "", extendedPlan: "", invoiceNo: "", notes: "" };
  const [edit, setEdit] = useState<{ id: string | null; d: typeof empty } | null>(null);
  const set = (k: keyof typeof empty, v: string | number) => setEdit((e) => (e ? { ...e, d: { ...e.d, [k]: v } } : e));
  return (
    <Card title="Συσκευές & εγγυήσεις" right={canWrite && <button type="button" onClick={() => setEdit({ id: null, d: empty })} className={btn}><Plus className="size-4" aria-hidden /> Καταχώρηση συσκευής</button>}>
      <ul className="m-0 p-0 list-none grid grid-cols-1 @2xl:grid-cols-2 gap-3">
        {c.devices.map((dev: Any) => { const s = warrantyStatus(dev); return (
          <li key={dev.id} className="rounded-xl border border-eu-line p-3 text-[length:var(--fs-14)]">
            <div className="font-bold text-eu-ink">{dev.brand} {dev.title}</div>
            <div className="text-eu-ink-2">{dev.model ?? ""}{dev.serial ? ` · S/N ${dev.serial}` : ""}</div>
            <div className="text-eu-muted text-[length:var(--fs-13)]">Αγορά {d(dev.purchasedAt)} · εγγύηση {dev.warrantyMonths} μήνες{dev.extendedPlan ? ` + ${dev.extendedPlan}` : ""}{dev.invoiceNo ? ` · ${dev.invoiceNo}` : ""} · {dev.registeredBy}</div>
            <div className={`font-bold ${s.cls}`}>{s.t}</div>
            {canWrite && <button type="button" onClick={() => setEdit({ id: dev.id, d: { brand: dev.brand, title: dev.title, model: dev.model ?? "", serial: dev.serial ?? "", purchasedAt: dev.purchasedAt?.slice(0, 10) ?? "", warrantyMonths: dev.warrantyMonths, extendedUntil: dev.extendedUntil?.slice(0, 10) ?? "", extendedPlan: dev.extendedPlan ?? "", invoiceNo: dev.invoiceNo ?? "", notes: dev.notes ?? "" } })} className={`${btn2} mt-2`}>Επεξεργασία</button>}
          </li>
        ); })}
        {!c.devices.length && <li className="text-eu-muted">Καμία συσκευή. Συμπληρώνονται από παραγγελίες, από αγορές καταστήματος (SoftOne) ή χειροκίνητα.</li>}
      </ul>
      {edit && (
        <div className="rounded-xl bg-eu-surface/60 border border-eu-line p-4 grid gap-3">
          <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
            <label className={label}>Μάρκα<input value={edit.d.brand} onChange={(e) => set("brand", e.target.value)} className={field} /></label>
            <label className={`${label} @2xl:col-span-2`}>Περιγραφή<input value={edit.d.title} onChange={(e) => set("title", e.target.value)} className={field} /></label>
            <label className={label}>Μοντέλο<input value={edit.d.model} onChange={(e) => set("model", e.target.value)} className={field} /></label>
            <label className={label}>Serial<input value={edit.d.serial} onChange={(e) => set("serial", e.target.value)} className={`${field} font-mono`} /></label>
            <label className={label}>Ημ. αγοράς<input type="date" value={edit.d.purchasedAt} onChange={(e) => set("purchasedAt", e.target.value)} className={field} /></label>
            <label className={label}>Εγγύηση (μήνες)<input type="number" value={edit.d.warrantyMonths} onChange={(e) => set("warrantyMonths", Number(e.target.value))} className={field} /></label>
            <label className={label}>Επέκταση έως<input type="date" value={edit.d.extendedUntil} onChange={(e) => set("extendedUntil", e.target.value)} className={field} /></label>
            <label className={label}>Πρόγραμμα επέκτασης<input value={edit.d.extendedPlan} onChange={(e) => set("extendedPlan", e.target.value)} className={field} /></label>
            <label className={label}>Παραστατικό (ERP)<input value={edit.d.invoiceNo} onChange={(e) => set("invoiceNo", e.target.value)} className={field} /></label>
            <label className={`${label} @2xl:col-span-2`}>Σημειώσεις<input value={edit.d.notes} onChange={(e) => set("notes", e.target.value)} className={field} /></label>
          </div>
          <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => run(async () => { const r = await saveDevice(c.id, edit.id, edit.d); if (r.ok) setEdit(null); return r; })} className={btn}><Check className="size-4" aria-hidden /> Αποθήκευση</button><button type="button" onClick={() => setEdit(null)} className={btn2}>Άκυρο</button></div>
        </div>
      )}
    </Card>
  );
}

function ServiceTab({ c, stores, canWrite, run, pending }: { c: Any; stores: { id: string; name: string; city: string }[]; canWrite: boolean; run: Any; pending: boolean }) {
  const [nt, setNt] = useState<{ kind: string; description: string; deviceId: string; mode: string; scheduledAt: string; slot: string; storeId: string } | null>(null);
  const [upd, setUpd] = useState<Record<string, { status: string; note: string; scheduledAt: string; technician: string; erpJob: string }>>({});
  const STATUS = [["new", "Νέο"], ["scheduled", "Προγραμματισμένο"], ["in-progress", "Σε εξέλιξη"], ["waiting-parts", "Αναμονή ανταλλακτικών"], ["done", "Ολοκληρώθηκε"], ["cancelled", "Ακυρώθηκε"]];
  return (
    <Card title="Service & ραντεβού" right={canWrite && <button type="button" onClick={() => setNt({ kind: "repair", description: "", deviceId: "", mode: "visit", scheduledAt: "", slot: "", storeId: c.preferredStoreId ?? "" })} className={btn}><Plus className="size-4" aria-hidden /> Νέο αίτημα</button>}>
      {nt && (
        <div className="rounded-xl bg-eu-surface/60 border border-eu-line p-4 grid gap-3">
          <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
            <label className={label}>Είδος<select value={nt.kind} onChange={(e) => setNt({ ...nt, kind: e.target.value })} className={field}><option value="repair">Επισκευή</option><option value="installation">Εγκατάσταση</option><option value="delivery">Παράδοση</option><option value="pickup">Παραλαβή</option><option value="warranty-claim">Αξίωση εγγύησης</option><option value="appointment">Ραντεβού</option></select></label>
            <label className={label}>Συσκευή<select value={nt.deviceId} onChange={(e) => setNt({ ...nt, deviceId: e.target.value })} className={field}><option value="">—</option>{c.devices.map((dv: Any) => <option key={dv.id} value={dv.id}>{dv.brand} {dv.title}</option>)}</select></label>
            <label className={label}>Τρόπος<select value={nt.mode} onChange={(e) => setNt({ ...nt, mode: e.target.value })} className={field}><option value="visit">Επίσκεψη τεχνικού</option><option value="pickup">Παραλαβή από το σπίτι</option><option value="store">Στο κατάστημα</option></select></label>
            <label className={label}>Ημερομηνία<input type="datetime-local" value={nt.scheduledAt} onChange={(e) => setNt({ ...nt, scheduledAt: e.target.value })} className={field} /></label>
            <label className={label}>Ζώνη<input value={nt.slot} onChange={(e) => setNt({ ...nt, slot: e.target.value })} placeholder="Πρωί 9–13" className={field} /></label>
            <label className={label}>Κατάστημα<select value={nt.storeId} onChange={(e) => setNt({ ...nt, storeId: e.target.value })} className={field}><option value="">—</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.city} — {s.name}</option>)}</select></label>
          </div>
          <label className={label}>Περιγραφή<textarea rows={2} value={nt.description} onChange={(e) => setNt({ ...nt, description: e.target.value })} className={`${field} py-2`} /></label>
          <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => run(async () => { const r = await createTicket(c.id, nt); if (r.ok) setNt(null); return r; }, "Το αίτημα καταχωρήθηκε.")} className={btn}><Check className="size-4" aria-hidden /> Καταχώρηση</button><button type="button" onClick={() => setNt(null)} className={btn2}>Άκυρο</button></div>
        </div>
      )}
      <ul className="m-0 p-0 list-none grid gap-3">
        {c.tickets.map((t: Any) => { const u = upd[t.id] ?? { status: t.status, note: "", scheduledAt: t.scheduledAt?.slice(0, 16) ?? "", technician: t.technician ?? "", erpJob: t.erpJob ?? "" }; return (
          <li key={t.id} className="rounded-xl border border-eu-line p-3 text-[length:var(--fs-14)] grid gap-2">
            <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-eu-ink">{t.number}</span><span className="rounded-full bg-eu-surface px-2 text-[length:var(--fs-13)] font-bold">{t.kind}</span><span className={`rounded-full px-2 text-[length:var(--fs-13)] font-bold ${t.status === "done" ? "bg-eu-green/10 text-eu-green" : t.status === "cancelled" ? "bg-eu-surface text-eu-muted" : "bg-eu-yellow/40 text-eu-navy"}`}>{STATUS.find((s) => s[0] === t.status)?.[1] ?? t.status}</span>{t.inWarranty && <span className="text-eu-green text-[length:var(--fs-13)] font-bold">εντός εγγύησης</span>}<span className="ml-auto text-eu-muted text-[length:var(--fs-13)]">{dt(t.createdAt)}</span></div>
            <div className="text-eu-ink-2">{t.description}</div>
            <div className="text-eu-muted text-[length:var(--fs-13)]">{t.device ? `${t.device.brand} ${t.device.title} · ` : ""}{t.mode ?? ""}{t.scheduledAt ? ` · ${dt(t.scheduledAt)}${t.slot ? ` (${t.slot})` : ""}` : ""}{t.technician ? ` · τεχνικός ${t.technician}` : ""}{t.erpJob ? ` · SoftOne ${t.erpJob}` : ""}</div>
            {Array.isArray(t.timeline) && t.timeline.length > 0 && <ul className="m-0 p-0 list-none text-[length:var(--fs-13)] text-eu-muted">{t.timeline.map((x: Any, i: number) => <li key={i}>{dt(x.at)} · {x.status}{x.note ? ` — ${x.note}` : ""}{x.by ? ` (${x.by})` : ""}</li>)}</ul>}
            {canWrite && t.status !== "cancelled" && (
              <div className="grid grid-cols-1 @2xl:grid-cols-[160px_180px_minmax(0,1fr)_120px_140px_auto] gap-2 items-end">
                <label className={label}>Κατάσταση<select value={u.status} onChange={(e) => setUpd({ ...upd, [t.id]: { ...u, status: e.target.value } })} className={field}>{STATUS.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select></label>
                <label className={label}>Ραντεβού<input type="datetime-local" value={u.scheduledAt} onChange={(e) => setUpd({ ...upd, [t.id]: { ...u, scheduledAt: e.target.value } })} className={field} /></label>
                <label className={label}>Σημείωση<input value={u.note} onChange={(e) => setUpd({ ...upd, [t.id]: { ...u, note: e.target.value } })} className={field} /></label>
                <label className={label}>Τεχνικός<input value={u.technician} onChange={(e) => setUpd({ ...upd, [t.id]: { ...u, technician: e.target.value } })} className={field} /></label>
                <label className={label}>SoftOne job<input value={u.erpJob} onChange={(e) => setUpd({ ...upd, [t.id]: { ...u, erpJob: e.target.value } })} className={`${field} font-mono`} /></label>
                <button type="button" disabled={pending} onClick={() => run(() => updateTicket(c.id, t.id, u), "Ενημερώθηκε.")} className={btn}><Check className="size-4" aria-hidden /> Ενημέρωση</button>
              </div>
            )}
          </li>
        ); })}
        {!c.tickets.length && <li className="text-eu-muted">Κανένα αίτημα service.</li>}
      </ul>
    </Card>
  );
}

function ConsentsTab({ c, canWrite, run, pending }: { c: Any; canWrite: boolean; run: Any; pending: boolean }) {
  const latest = (topic: string, channel: string) => c.consents.find((x: Any) => x.topic === topic && x.channel === channel);
  return (
    <>
      <Card title="Τρέχουσες συγκαταθέσεις" right={<Link href={`/admin/customers/${c.id}/consent-proof`} target="_blank" className={btn2}><Printer className="size-4" aria-hidden /> Απόδειξη συναίνεσης (εκτύπωση)</Link>}>
        <div className="overflow-x-auto"><table className="w-full text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">Θέμα</th><th>Κανάλι</th><th>Κατάσταση</th><th>Από</th><th>Αποδεικτικά</th>{canWrite && <th />}</tr></thead><tbody>
          {CONSENT_TOPICS.flatMap((t) => t.channels.map((ch) => { const l = latest(t.topic, ch); return (
            <tr key={`${t.topic}-${ch}`} className="border-t border-eu-line-2">
              <td className="py-2 font-bold">{t.label}</td><td>{ch}</td>
              <td className={l ? (l.granted ? "text-eu-green font-bold" : "text-eu-red font-bold") : "text-eu-muted"}>{l ? (l.granted ? "Ναι" : "Όχι") : "Δεν ρωτήθηκε"}</td>
              <td className="tabular-nums text-eu-ink-2">{l ? `${dt(l.at)} · ${l.source} · ${l.method}` : "—"}</td>
              <td className="text-eu-muted text-[length:var(--fs-13)]">{l ? [l.ip, l.os, l.browser, l.textVersion ? `κείμενο v${l.textVersion}` : null].filter(Boolean).join(" · ") : "—"}</td>
              {canWrite && <td className="text-right"><button type="button" disabled={pending || c.status === "anonymised"} onClick={() => run(() => setConsent(c.id, t.topic, ch, !(l?.granted ?? false)), "Καταγράφηκε.")} className={btn2}>{l?.granted ? "Ανάκληση" : "Καταγραφή συναίνεσης"}</button></td>}
            </tr>
          ); }))}
        </tbody></table></div>
        <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Κάθε αλλαγή προσθέτει νέα γραμμή στο ledger με IP, λειτουργικό, browser, συσκευή, URL και hash του κειμένου που δόθηκε. Οι αλλαγές από τη διαχείριση καταγράφονται με τον χρήστη που τις έκανε.</p>
      </Card>
      <Card title={`Ledger συναινέσεων (${c.consents.length})`}>
        <div className="overflow-x-auto"><table className="w-full text-[length:var(--fs-13)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">Πότε</th><th>Θέμα / κανάλι</th><th>Απόφαση</th><th>Μέθοδος · πηγή</th><th>Κείμενο</th><th>IP</th><th>Συσκευή</th><th>URL</th></tr></thead><tbody>
          {c.consents.map((x: Any) => <tr key={x.id} className="border-t border-eu-line-2 align-top"><td className="py-1.5 tabular-nums whitespace-nowrap">{dt(x.at)}</td><td>{x.topic} · {x.channel}</td><td className={x.granted ? "text-eu-green font-bold" : "text-eu-red font-bold"}>{x.granted ? "Συναίνεση" : "Ανάκληση"}{x.confirmedAt ? " (επιβεβαιωμένη)" : ""}</td><td>{x.method} · {x.source}{x.staffId ? " · staff" : ""}</td><td className="font-mono" title={x.textHash ?? ""}>{x.textKey ?? "—"} {x.textVersion ?? ""}{x.textHash ? ` #${x.textHash.slice(0, 8)}` : ""}</td><td className="font-mono">{x.ip ?? "—"}</td><td>{[x.os, x.browser, x.device].filter(Boolean).join(" · ") || "—"}</td><td className="max-w-[200px] truncate" title={x.url ?? ""}>{x.url ?? "—"}</td></tr>)}
        </tbody></table></div>
      </Card>
    </>
  );
}

function LoyaltyTab({ c, canWrite, run, pending }: { c: Any; canWrite: boolean; run: Any; pending: boolean }) {
  const [f, setF] = useState({ points: 0, reason: "manual", note: "" });
  return (
    <Card title={`Πόντοι · υπόλοιπο ${c.loyaltyPoints.toLocaleString("el-GR")}`}>
      {canWrite && <div className="grid grid-cols-1 @2xl:grid-cols-[140px_180px_minmax(0,1fr)_auto] gap-2 items-end"><label className={label}>Πόντοι (+/−)<input type="number" value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} className={field} /></label><label className={label}>Λόγος<select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={field}><option value="manual">Χειροκίνητα</option><option value="order">Παραγγελία</option><option value="review">Αξιολόγηση</option><option value="referral">Σύσταση</option><option value="birthday">Γενέθλια</option><option value="redeem">Εξαργύρωση</option><option value="expire">Λήξη</option><option value="erp">SoftOne</option></select></label><label className={label}>Σημείωση<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={field} /></label><button type="button" disabled={pending} onClick={() => run(() => addLoyalty(c.id, f.points, f.reason, f.note), "Καταχωρήθηκε.")} className={btn}><Plus className="size-4" aria-hidden /> Καταχώρηση</button></div>}
      <table className="w-full text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">Πότε</th><th>Λόγος</th><th>Σημείωση</th><th className="text-right">Πόντοι</th></tr></thead><tbody>{c.loyalty.map((l: Any) => <tr key={l.id} className="border-t border-eu-line-2"><td className="py-1.5 tabular-nums">{dt(l.at)}</td><td>{l.reason}</td><td className="text-eu-ink-2">{l.note ?? ""}</td><td className={`text-right tabular-nums font-bold ${l.points < 0 ? "text-eu-red" : "text-eu-green"}`}>{l.points > 0 ? "+" : ""}{l.points}</td></tr>)}</tbody></table>
    </Card>
  );
}

function NotesTab({ c, canWrite, run, pending }: { c: Any; canWrite: boolean; run: Any; pending: boolean }) {
  const [text, setText] = useState(""); const [pinned, setPinned] = useState(false);
  return (
    <Card title="Εσωτερικές σημειώσεις">
      {canWrite && <div className="grid gap-2"><textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Σημείωση για την ομάδα (δεν τη βλέπει ο πελάτης)" className={`${field} py-2`} /><div className="flex items-center gap-3"><label className="inline-flex items-center gap-2 font-bold text-[length:var(--fs-14)]"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-eu-navy" /> Καρφίτσωμα</label><button type="button" disabled={pending || !text.trim()} onClick={() => run(async () => { const r = await addNote(c.id, text, pinned); if (r.ok) { setText(""); setPinned(false); } return r; }, "Προστέθηκε.")} className={btn}><Plus className="size-4" aria-hidden /> Προσθήκη</button></div></div>}
      <ul className="m-0 p-0 list-none grid gap-2">{c.customerNotes.map((n: Any) => <li key={n.id} className={`rounded-xl border p-3 text-[length:var(--fs-14)] ${n.pinned ? "border-eu-yellow bg-eu-yellow/10" : "border-eu-line"}`}><div className="flex items-center gap-2 text-eu-muted text-[length:var(--fs-13)]">{n.pinned && <Pin className="size-3.5 text-eu-navy" aria-hidden />}{n.staffName ?? "staff"} · {dt(n.createdAt)}</div><div className="text-eu-ink whitespace-pre-wrap">{n.text}</div></li>)}{!c.customerNotes.length && <li className="text-eu-muted">Καμία σημείωση.</li>}</ul>
    </Card>
  );
}

function ErpTab({ c, canWrite, erpConfigured, run, pending }: { c: Any; canWrite: boolean; erpConfigured: boolean; run: Any; pending: boolean }) {
  const [q, setQ] = useState({ afm: c.vatNumber ?? "", email: c.email, name: "" });
  const [rows, setRows] = useState<Any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title="SoftOne (CUSTOMER / TRDR)">
      <dl className="m-0 grid grid-cols-[160px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[length:var(--fs-14)]"><dt className="text-eu-muted">Κατάσταση</dt><dd className="m-0 font-bold">{c.erpTrdr ? `Συνδεδεμένος · TRDR ${c.erpTrdr} · CODE ${c.erpCode ?? "—"} · ${c.erpSyncStatus ?? ""}` : "Χωρίς σύνδεση"}</dd><dt className="text-eu-muted">Τελευταίος συγχρονισμός</dt><dd className="m-0">{dt(c.erpSyncedAt)}</dd>{c.erpLastError && <><dt className="text-eu-muted">Σφάλμα</dt><dd className="m-0 text-eu-red">{c.erpLastError}</dd></>}</dl>
      {!erpConfigured && <p className="m-0 rounded-xl bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] px-3 py-2">Το SoftOne δεν έχει ρυθμιστεί ακόμη (Ρυθμίσεις → SoftOne ERP).</p>}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !erpConfigured} onClick={() => run(() => erpPush(c.id), c.erpTrdr ? "Ο πελάτης ενημερώθηκε στο SoftOne." : "Ο πελάτης δημιουργήθηκε στο SoftOne.")} className={btn}><RefreshCw className="size-4" aria-hidden /> {c.erpTrdr ? "Αποστολή αλλαγών στο SoftOne" : "Δημιουργία στο SoftOne"}</button>
          {c.erpTrdr && <button type="button" disabled={pending || !erpConfigured} onClick={() => run(() => erpPull(c.id), "Ενημερώθηκε από το SoftOne.")} className={btn2}><Download className="size-4" aria-hidden /> Ανάκτηση από SoftOne</button>}
        </div>
      )}
      {canWrite && !c.erpTrdr && (
        <div className="rounded-xl bg-eu-surface/60 border border-eu-line p-4 grid gap-3">
          <div className="font-bold text-eu-ink text-[length:var(--fs-14)]">Σύνδεση με υπάρχοντα πελάτη του SoftOne</div>
          <div className="grid grid-cols-1 @2xl:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"><label className={label}>ΑΦΜ<input value={q.afm} onChange={(e) => setQ({ ...q, afm: e.target.value })} className={`${field} font-mono`} /></label><label className={label}>Email<input value={q.email} onChange={(e) => setQ({ ...q, email: e.target.value })} className={field} /></label><label className={label}>Επωνυμία<input value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} className={field} /></label><button type="button" disabled={pending || !erpConfigured} onClick={() => { setErr(null); erpSearch({ afm: q.afm || undefined, email: q.email || undefined, name: q.name || undefined }).then((r) => (r.ok ? setRows(r.rows) : setErr(r.error))); }} className={btn}><Search className="size-4" aria-hidden /> Αναζήτηση</button></div>
          {err && <p className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{err}</p>}
          {rows && (rows.length ? <table className="w-full text-[length:var(--fs-14)]"><thead><tr className="text-left text-eu-muted"><th className="py-1">TRDR</th><th>Κωδικός</th><th>Επωνυμία</th><th>ΑΦΜ</th><th>Email</th><th /></tr></thead><tbody>{rows.map((r) => <tr key={r.TRDR} className="border-t border-eu-line-2"><td className="py-1.5 font-mono">{r.TRDR}</td><td className="font-mono">{r.CODE}</td><td className="font-bold">{r.NAME}</td><td className="font-mono">{r.AFM ?? ""}</td><td>{r.EMAIL ?? ""}</td><td className="text-right"><button type="button" disabled={pending} onClick={() => run(() => erpLink(c.id, String(r.TRDR)), "Συνδέθηκε με το SoftOne.")} className={btn2}><Link2 className="size-4" aria-hidden /> Σύνδεση</button></td></tr>)}</tbody></table> : <p className="m-0 text-eu-muted">Δεν βρέθηκε πελάτης με αυτά τα στοιχεία.</p>)}
        </div>
      )}
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το e-shop είναι κύριος για συγκαταθέσεις, συσκευές, πόντους, σημειώσεις. Το SoftOne είναι κύριος για ΑΦΜ/ΔΟΥ μετά τη σύνδεση. Αποστολή = read-before-write, επιστροφή και επαλήθευση.</p>
    </Card>
  );
}

function GdprTab({ c, perms, run, pending }: { c: Any; perms: { write: boolean; export: boolean }; run: Any; pending: boolean }) {
  const download = async () => { const r = await gdprExport(c.id); if (!r.ok) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([r.json], { type: "application/json" })); a.download = `gdpr-export-${c.number}.json`; a.click(); };
  return (
    <Card title="Δικαιώματα υποκειμένου (GDPR)">
      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3 text-[length:var(--fs-14)]">
        <div className="rounded-xl border border-eu-line p-3 grid gap-2"><b>Πρόσβαση & φορητότητα (άρθρα 15, 20)</b><p className="m-0 text-eu-muted">Πλήρης εξαγωγή των δεδομένων του πελάτη σε JSON: προφίλ, διευθύνσεις, παραγγελίες, συσκευές, service, πόντοι, συναινέσεις με αποδεικτικά, συνδέσεις. Χωρίς εσωτερικές σημειώσεις και κωδικούς.</p>{perms.export && <button type="button" onClick={download} className={btn}><Download className="size-4" aria-hidden /> Εξαγωγή JSON</button>}</div>
        <div className="rounded-xl border border-eu-line p-3 grid gap-2"><b>Διόρθωση & περιορισμός (άρθρα 16, 18)</b><p className="m-0 text-eu-muted">Διόρθωση από την καρτέλα «Προφίλ». Περιορισμός επεξεργασίας = κατάσταση «Μπλοκαρισμένος»: καμία επικοινωνία, καμία επεξεργασία εκτός νομικών υποχρεώσεων.</p></div>
        <div className="rounded-xl border border-eu-red/30 bg-eu-red/5 p-3 grid gap-2"><b className="text-eu-red">Δικαίωμα στη λήθη (άρθρο 17)</b><p className="m-0 text-eu-muted">Ψευδωνυμοποίηση: σβήνονται ονόματα, email, τηλέφωνα, ΑΦΜ, διευθύνσεις, κάρτες, social logins, serial. Διατηρούνται παραγγελίες (φορολογική υποχρέωση), το ledger συναινέσεων και τα logins με hash IP ως αποδεικτικά (έννομο συμφέρον, άρθρο 17.3). Μη αναστρέψιμο.</p>{perms.write && c.status !== "anonymised" && <button type="button" disabled={pending} onClick={() => prompt(`Γράψε ΔΙΑΓΡΑΦΗ για να ανωνυμοποιήσεις τον πελάτη ${c.email}`) === "ΔΙΑΓΡΑΦΗ" && run(() => gdprAnonymise(c.id), "Ο πελάτης ανωνυμοποιήθηκε.")} className={`${btn} bg-eu-red hover:bg-eu-red/90`}><ShieldAlert className="size-4" aria-hidden /> Ανωνυμοποίηση</button>}{c.status === "anonymised" && <span className="font-bold text-eu-muted">Ανωνυμοποιήθηκε {dt(c.anonymisedAt)}</span>}</div>
      </div>
      <div><b className="text-[length:var(--fs-14)]">Αιτήματα</b>{c.gdprRequests.length ? <table className="w-full text-[length:var(--fs-14)] mt-1"><thead><tr className="text-left text-eu-muted"><th className="py-1">Αριθμός</th><th>Είδος</th><th>Κατάσταση</th><th>Υποβολή</th><th>Προθεσμία</th></tr></thead><tbody>{c.gdprRequests.map((g: Any) => <tr key={g.id} className="border-t border-eu-line-2"><td className="py-1.5"><Link href="/admin/gdpr" className="font-bold text-eu-navy hover:underline">{g.number}</Link></td><td>{g.type}</td><td>{g.status}</td><td>{d(g.requestedAt)}</td><td className={new Date(g.dueAt) < new Date() && g.status !== "done" ? "text-eu-red font-bold" : ""}>{d(g.dueAt)}</td></tr>)}</tbody></table> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Κανένα αίτημα. Τα αιτήματα καταχωρούνται στη σελίδα <Link href="/admin/gdpr" className="text-eu-blue underline">GDPR</Link> με προθεσμία 30 ημερών.</p>}</div>
    </Card>
  );
}
