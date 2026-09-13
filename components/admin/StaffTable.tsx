"use client";

import { useState, useTransition } from "react";
import { Plus, X, Pencil } from "lucide-react";
import { createStaff, updateStaff } from "@/app/admin/(shell)/staff/actions";

type RoleRef = { id: string; name: string; key: string };
type Staff = { id: string; email: string; name: string; active: boolean; storeId: string | null; lastLoginAt: string | null; sso: boolean; roles: RoleRef[] };

export function StaffTable({ me, canWrite, roles, stores, staff }: { me: string; canWrite: boolean; roles: RoleRef[]; stores: { id: string; name: string }[]; staff: Staff[] }) {
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";
  return (
    <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-eu-line">
        <span className="font-bold text-eu-ink text-[length:var(--fs-15)]">{staff.length} χρήστες</span>
        {canWrite && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-10 hover:bg-eu-blue">
            <Plus className="size-4" aria-hidden /> Νέος χρήστης
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[length:var(--fs-14)]">
          <thead>
            <tr className="text-left text-eu-muted">
              <th className="p-3 font-bold">Χρήστης</th>
              <th className="p-3 font-bold">Ρόλοι</th>
              <th className="p-3 font-bold">Κατάστημα</th>
              <th className="p-3 font-bold">Τελευταία σύνδεση</th>
              <th className="p-3 font-bold">Κατάσταση</th>
              {canWrite && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-eu-line-2 hover:bg-eu-surface/60">
                <td className="p-3">
                  <div className="font-bold text-eu-ink">{s.name}{s.id === me && <span className="ml-2 rounded-full bg-eu-yellow/40 px-2 py-0.5 text-[length:var(--fs-13)]">εσύ</span>}</div>
                  <div className="text-eu-muted">{s.email}{s.sso && " · SSO"}</div>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <span key={r.id} className="rounded-full bg-eu-navy/10 text-eu-navy font-bold px-2 py-0.5 text-[length:var(--fs-13)]">{r.name}</span>
                    ))}
                    {!s.roles.length && <span className="text-eu-muted">κανένας</span>}
                  </div>
                </td>
                <td className="p-3 text-eu-ink-2">{storeName(s.storeId)}</td>
                <td className="p-3 text-eu-ink-2 tabular-nums">{s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString("el-GR") : "ποτέ"}</td>
                <td className="p-3">
                  <span className={`inline-flex items-center gap-1.5 font-bold ${s.active ? "text-eu-green" : "text-eu-muted"}`}>
                    <span className={`size-2 rounded-full ${s.active ? "bg-eu-green" : "bg-eu-line-3"}`} aria-hidden /> {s.active ? "Ενεργός" : "Ανενεργός"}
                  </span>
                </td>
                {canWrite && (
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => setEditing(s)} aria-label={`Επεξεργασία ${s.name}`} className="size-10 rounded-full inline-flex items-center justify-center text-eu-blue hover:bg-eu-blue/10">
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <StaffDialog me={me} item={editing === "new" ? null : editing} roles={roles} stores={stores} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffDialog({ me, item, roles, stores, onClose }: { me: string; item: Staff | null; roles: RoleRef[]; stores: { id: string; name: string }[]; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue bg-white";
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="staff-dlg">
      <button type="button" className="absolute inset-0 bg-eu-navy/60 backdrop-blur-sm" aria-label="Κλείσιμο" onClick={onClose} />
      <form
        action={(fd) =>
          start(async () => {
            const r = item ? await updateStaff(item.id, fd) : await createStaff(fd);
            if (r.ok) onClose();
            else setError(r.error ?? "Σφάλμα");
          })
        }
        className="absolute inset-x-0 bottom-0 @md:inset-auto @md:left-1/2 @md:top-1/2 @md:-translate-x-1/2 @md:-translate-y-1/2 @md:w-[min(560px,92vw)] max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl @md:rounded-3xl p-6 grid gap-4 shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="staff-dlg" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">{item ? item.name : "Νέος χρήστης"}</h3>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="size-11 rounded-full bg-eu-surface inline-flex items-center justify-center hover:bg-eu-surface-3 shrink-0">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {error && <p className="m-0 rounded-xl bg-eu-red/10 text-eu-red font-bold text-[length:var(--fs-14)] px-3 py-2">{error}</p>}
        <div className="grid @md:grid-cols-2 gap-4">
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
            Όνομα
            <input name="name" required defaultValue={item?.name} className={field} />
          </label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
            Email
            <input name="email" type="email" required={!item} defaultValue={item?.email} disabled={!!item} autoComplete="off" className={`${field} disabled:bg-eu-surface disabled:text-eu-muted`} />
          </label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
            {item ? "Νέος κωδικός" : "Κωδικός"} <span className="font-normal text-eu-muted">{item ? "(κενό = δεν αλλάζει)" : "(κενό = μόνο SSO)"}</span>
            <input name="password" type="password" minLength={8} autoComplete="new-password" className={field} />
          </label>
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">
            Κατάστημα
            <select name="storeId" defaultValue={item?.storeId ?? ""} className={field}>
              <option value="">— κανένα (κεντρικά) —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="m-0 p-0 border-0 grid gap-2">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-14)] mb-1">Ρόλοι</legend>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <label key={r.id} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-line px-3 min-h-11 cursor-pointer has-checked:border-eu-navy has-checked:bg-eu-navy has-checked:text-white font-bold text-[length:var(--fs-14)] transition-colors">
                <input type="checkbox" name="roleIds" value={r.id} defaultChecked={item?.roles.some((x) => x.id === r.id)} className="sr-only" />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        {item && (
          <label className="inline-flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-14)] min-h-11">
            <input type="checkbox" name="active" defaultChecked={item.active} disabled={item.id === me} className="size-5 accent-eu-navy" /> Ενεργός λογαριασμός
          </label>
        )}
        <button type="submit" disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-12 hover:bg-eu-blue disabled:opacity-50">
          {pending ? "Αποθήκευση…" : item ? "Αποθήκευση" : "Δημιουργία"}
        </button>
      </form>
    </div>
  );
}
