"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Lock, Trash2, Users } from "lucide-react";
import { saveRolePermissions, deleteRole } from "@/app/admin/(shell)/roles/actions";

type Role = { id: string; key: string; name: string; description: string | null; system: boolean; staff: number; permissionIds: string[] };
type Group = { key: string; label: string; perms: { id: string; key: string; description: string }[] };

/**
 * Editable role × permission matrix. Local state per role; «Αποθήκευση»
 * appears on the dirty column only. Group header toggles the whole group.
 */
export function RoleMatrix({ roles, groups }: { roles: Role[]; groups: Group[] }) {
  const initial = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissionIds)])), [roles]);
  const [state, setState] = useState<Record<string, Set<string>>>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = (r: Role) => {
    const a = state[r.id] ?? new Set();
    const b = initial[r.id];
    return a.size !== b.size || [...a].some((x) => !b.has(x));
  };
  const toggle = (roleId: string, ids: string[], on: boolean) =>
    setState((s) => {
      const next = new Set(s[roleId]);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return { ...s, [roleId]: next };
    });
  const save = (r: Role) =>
    start(async () => {
      const res = await saveRolePermissions(r.id, [...state[r.id]]);
      setMsg(res.ok ? `Αποθηκεύτηκε ο ρόλος «${r.name}».` : res.error ?? "Σφάλμα");
      if (res.ok) initial[r.id] = new Set(state[r.id]);
    });
  const remove = (r: Role) => {
    if (!confirm(`Διαγραφή ρόλου «${r.name}»;`)) return;
    start(async () => {
      const res = await deleteRole(r.id);
      setMsg(res.ok ? `Διαγράφηκε ο ρόλος «${r.name}».` : res.error ?? "Σφάλμα");
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-eu-line overflow-hidden">
      {msg && (
        <div role="status" aria-live="polite" className="px-4 py-2 bg-eu-yellow/30 text-eu-navy font-bold text-[length:var(--fs-14)] border-b border-eu-line">
          {msg}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[length:var(--fs-14)]">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-10 bg-white text-left p-3 font-extrabold text-eu-ink w-[200px] min-w-[180px] border-b border-eu-line">Δικαίωμα</th>
              {roles.map((r) => (
                <th key={r.id} className="p-2 border-b border-l border-eu-line align-top min-w-[96px]">
                  <div className="font-extrabold text-eu-ink text-[length:var(--fs-14)] flex items-center justify-center gap-1 leading-tight">
                    {r.system && <Lock className="size-3.5 text-eu-muted" aria-label="Ρόλος συστήματος" />}
                    {r.name}
                  </div>
                  <div className="text-eu-muted font-normal text-[length:var(--fs-13)]">{r.key}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-eu-ink-3 font-semibold text-[length:var(--fs-13)]">
                    <Users className="size-3.5" aria-hidden /> {r.staff}
                  </div>
                  <div className="mt-2 flex justify-center gap-1 min-h-9">
                    {!r.system && dirty(r) && (
                      <button type="button" onClick={() => save(r)} disabled={pending} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-3 min-h-9 hover:bg-eu-blue disabled:opacity-50">
                        Αποθήκευση
                      </button>
                    )}
                    {!r.system && !dirty(r) && r.staff === 0 && (
                      <button type="button" onClick={() => remove(r)} disabled={pending} aria-label={`Διαγραφή ${r.name}`} className="size-9 rounded-full text-eu-muted hover:bg-eu-red/10 hover:text-eu-red inline-flex items-center justify-center">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} group={g} roles={roles} state={state} toggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, roles, state, toggle }: { group: Group; roles: Role[]; state: Record<string, Set<string>>; toggle: (roleId: string, ids: string[], on: boolean) => void }) {
  const ids = group.perms.map((p) => p.id);
  return (
    <>
      <tr className="bg-eu-surface">
        <th scope="rowgroup" className="sticky left-0 z-10 bg-eu-surface text-left px-3 py-2 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide border-b border-eu-line">
          {group.label}
        </th>
        {roles.map((r) => {
          const n = ids.filter((id) => state[r.id]?.has(id)).length;
          const all = r.system || n === ids.length;
          return (
            <td key={r.id} className="p-2 text-center border-b border-l border-eu-line">
              <button
                type="button"
                disabled={r.system}
                onClick={() => toggle(r.id, ids, !all)}
                className="rounded-full px-2 min-h-8 text-[length:var(--fs-13)] font-bold text-eu-blue hover:bg-eu-blue/10 disabled:text-eu-muted disabled:hover:bg-transparent"
              >
                {r.system ? "όλα" : all ? "κανένα" : n ? `όλα (${n}/${ids.length})` : "όλα"}
              </button>
            </td>
          );
        })}
      </tr>
      {group.perms.map((p) => (
        <tr key={p.id} className="hover:bg-eu-surface/60">
          <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-2 font-normal border-b border-eu-line-2">
            <div className="font-bold text-eu-ink leading-snug">{p.description}</div>
            <div className="text-eu-muted text-[length:var(--fs-13)] font-mono leading-tight">{p.key}</div>
          </th>
          {roles.map((r) => {
            const on = r.system || !!state[r.id]?.has(p.id);
            return (
              <td key={r.id} className="p-0 text-center border-b border-l border-eu-line-2">
                <label className="inline-flex size-11 items-center justify-center cursor-pointer rounded-full hover:bg-eu-blue/10 has-disabled:cursor-default has-disabled:hover:bg-transparent">
                  <input type="checkbox" className="sr-only peer" checked={on} disabled={r.system} onChange={(e) => toggle(r.id, [p.id], e.target.checked)} aria-label={`${r.name}: ${p.description}`} />
                  <span className={`size-6 rounded-md border-2 inline-flex items-center justify-center transition-colors ${on ? "bg-eu-navy border-eu-navy text-white" : "border-eu-line-3 bg-white"} ${r.system ? "opacity-50" : ""} peer-focus-visible:ring-2 peer-focus-visible:ring-eu-blue`}>
                    {on && <Check className="size-4" aria-hidden />}
                  </span>
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
