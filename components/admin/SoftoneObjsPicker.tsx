"use client";

import { useState, useTransition } from "react";
import { Building2, RefreshCw } from "lucide-react";
import { softoneObjects } from "@/app/admin/(shell)/settings/actions";

type Obj = { company: string; companyName: string; branch: string; branchName: string; module: string; moduleName: string; refid: string; refidName: string };

/**
 * Company / branch / module / refid for SoftOne, chosen from what the first
 * login returns. Uses the values currently typed in the form (URL, App ID,
 * username, password) — no need to save first. Before fetching, the stored
 * values are kept in hidden inputs so saving leaves them untouched.
 */
export function SoftoneObjsPicker({ stored }: { stored: { company: string; branch: string; module: string; refid: string } }) {
  const [objs, setObjs] = useState<Obj[] | null>(null);
  const [sel, setSel] = useState(stored);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fetchObjs = (e: React.MouseEvent<HTMLButtonElement>) => {
    const fd = new FormData(e.currentTarget.form!);
    start(async () => {
      const r = await softoneObjects(fd);
      if (!r.ok) return setMsg(r.error);
      setObjs(r.objs);
      setMsg(`${r.objs.length} συνδυασμοί από το SoftOne${r.version ? ` (έκδοση ${r.version})` : ""}.`);
      if (!r.objs.some((o) => o.company === sel.company && o.branch === sel.branch)) {
        const f = r.objs[0];
        if (f) setSel({ company: f.company, branch: f.branch, module: f.module, refid: f.refid });
      }
    });
  };
  const uniq = <K extends keyof Obj>(list: Obj[], key: K) => [...new Map(list.map((o) => [o[key], o])).values()];
  const forCompany = objs?.filter((o) => o.company === sel.company) ?? [];
  const forBranch = forCompany.filter((o) => o.branch === sel.branch);
  const forModule = forBranch.filter((o) => o.module === sel.module);
  const box = "rounded-xl border-2 border-eu-line px-3 min-h-12 text-[length:var(--fs-16)] font-normal outline-none focus:border-eu-blue bg-white w-full";
  const label = "grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]";
  const summary = [sel.company && `Εταιρεία ${sel.company}`, sel.branch && `Υποκ. ${sel.branch}`, sel.module && `Module ${sel.module}`, sel.refid && `Χρήστης ${sel.refid}`].filter(Boolean).join(" · ");
  return (
    <div className="@2xl:col-span-2 grid gap-3 rounded-2xl border border-eu-line bg-eu-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={fetchObjs} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50">
          {pending ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <Building2 className="size-4" aria-hidden />} {objs ? "Ανανέωση από το SoftOne" : "Σύνδεση & ανάκτηση από το SoftOne"}
        </button>
        <span className="text-eu-ink-3 text-[length:var(--fs-14)]">{msg ?? (summary ? `Αποθηκευμένα: ${summary}` : "Δεν έχει επιλεγεί εταιρεία ακόμη — συμπλήρωσε τα στοιχεία σύνδεσης και πάτα το κουμπί.")}</span>
      </div>
      {objs ? (
        <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
          <label className={label}>Εταιρεία
            <select name="company" value={sel.company} onChange={(e) => { const c = e.target.value; const f = objs.find((o) => o.company === c)!; setSel({ company: c, branch: f.branch, module: f.module, refid: f.refid }); }} className={box}>
              {uniq(objs, "company").map((o) => <option key={o.company} value={o.company}>{o.company} — {o.companyName}</option>)}
            </select>
          </label>
          <label className={label}>Υποκατάστημα
            <select name="branch" value={sel.branch} onChange={(e) => { const b = e.target.value; const f = forCompany.find((o) => o.branch === b)!; setSel({ ...sel, branch: b, module: f.module, refid: f.refid }); }} className={box}>
              {uniq(forCompany, "branch").map((o) => <option key={o.branch} value={o.branch}>{o.branch} — {o.branchName}</option>)}
            </select>
          </label>
          <label className={label}>Module
            <select name="module" value={sel.module} onChange={(e) => { const m = e.target.value; const f = forBranch.find((o) => o.module === m)!; setSel({ ...sel, module: m, refid: f.refid }); }} className={box}>
              {uniq(forBranch, "module").map((o) => <option key={o.module} value={o.module}>{o.module} — {o.moduleName}</option>)}
            </select>
          </label>
          <label className={label}>Χρήστης (RefID)
            <select name="refid" value={sel.refid} onChange={(e) => setSel({ ...sel, refid: e.target.value })} className={box}>
              {uniq(forModule, "refid").map((o) => <option key={o.refid} value={o.refid}>{o.refid} — {o.refidName}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="company" value={sel.company} /><input type="hidden" name="branch" value={sel.branch} /><input type="hidden" name="module" value={sel.module} /><input type="hidden" name="refid" value={sel.refid} />
        </>
      )}
    </div>
  );
}
