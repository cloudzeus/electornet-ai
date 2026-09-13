"use client";

import { useState, useTransition } from "react";
import { Monitor, Smartphone, Send, FileText, Code2 } from "lucide-react";
import { sendTestEmail } from "@/app/admin/(shell)/emails/actions";

/** Preview of one template: desktop / mobile frame, subject + preheader, plain-text version, sample data, test send, dispatch log. */
export function EmailPreview({ tpl, subject, html, text, sample, staffEmail, log }: { tpl: { key: string; name: string; description: string; trigger: string; group: string; marketing: boolean }; subject: string; html: string; text: string; sample: string; staffEmail: string; log: { id: string; to: string; status: string; at: string; error: string | null; subject: string }[] }) {
  const [view, setView] = useState<"desktop" | "mobile" | "text" | "data">("desktop");
  const [to, setTo] = useState(staffEmail);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3 min-h-10 font-bold text-[length:var(--fs-14)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  return (
    <div className="eu-container grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">{tpl.group} · <span className="font-mono normal-case">{tpl.key}</span></div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)]">{tpl.name}</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">{tpl.description}</p>
          <p className="m-0 mt-1 text-eu-muted text-[length:var(--fs-14)]"><b>Πότε στέλνεται:</b> {tpl.trigger}{tpl.marketing ? " · Εμπορική επικοινωνία: μόνο με ενεργή συναίνεση, με σύνδεσμο διαγραφής." : " · Συναλλακτικό: στέλνεται πάντα."}</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await sendTestEmail(tpl.key, to); setMsg(r.ok ? r.message : r.error); }); }} className="flex flex-wrap items-end gap-2 rounded-2xl bg-white border border-eu-line p-3">
          <label className="grid gap-1 font-bold text-eu-ink text-[length:var(--fs-14)]">Δοκιμαστική αποστολή σε<input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] font-normal outline-none focus:border-eu-blue min-w-[260px]" /></label>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50"><Send className="size-4" aria-hidden /> Αποστολή</button>
          {msg && <span role="status" className="basis-full text-[length:var(--fs-13)] font-bold text-eu-ink-3">{msg}</span>}
        </form>
      </div>
      <div className="rounded-2xl bg-white border border-eu-line p-3 grid gap-1 text-[length:var(--fs-14)]"><div><span className="text-eu-muted">Θέμα:</span> <b className="text-eu-ink">{subject}</b></div><div className="text-eu-muted">Preheader: <span className="text-eu-ink-2">{text.split("\n")[0]}</span></div></div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setView("desktop")} className={chip(view === "desktop")}><Monitor className="size-4" aria-hidden /> Desktop</button>
        <button type="button" onClick={() => setView("mobile")} className={chip(view === "mobile")}><Smartphone className="size-4" aria-hidden /> Κινητό</button>
        <button type="button" onClick={() => setView("text")} className={chip(view === "text")}><FileText className="size-4" aria-hidden /> Απλό κείμενο</button>
        <button type="button" onClick={() => setView("data")} className={chip(view === "data")}><Code2 className="size-4" aria-hidden /> Δεδομένα δείγματος</button>
      </div>
      <div className="rounded-2xl bg-eu-surface border border-eu-line p-4 grid place-items-center min-h-[600px]">
        {view === "desktop" && <iframe title="Προεπισκόπηση desktop" srcDoc={html} sandbox="allow-same-origin" className="w-full max-w-[720px] h-[900px] bg-white rounded-xl border border-eu-line" />}
        {view === "mobile" && <div className="rounded-[36px] border-[10px] border-eu-navy bg-eu-navy p-0 shadow-[var(--shadow-overlay)]"><iframe title="Προεπισκόπηση κινητού" srcDoc={html} sandbox="allow-same-origin" className="w-[375px] h-[760px] bg-white rounded-[26px] border-0" /></div>}
        {view === "text" && <pre className="m-0 w-full max-w-[720px] whitespace-pre-wrap rounded-xl bg-white border border-eu-line p-4 font-mono text-[length:var(--fs-14)] text-eu-ink">{text}</pre>}
        {view === "data" && <pre className="m-0 w-full max-w-[720px] whitespace-pre-wrap rounded-xl bg-white border border-eu-line p-4 font-mono text-[length:var(--fs-14)] text-eu-ink">{sample}</pre>}
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-4 grid gap-2">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τελευταίες αποστολές</h3>
        {log.length ? <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-14)]">{log.map((l) => <li key={l.id} className="grid grid-cols-[150px_minmax(0,1fr)_100px] gap-2 border-t border-eu-line-2 py-1"><span className="tabular-nums text-eu-muted">{new Date(l.at).toLocaleString("el-GR")}</span><span className="truncate">{l.to} — {l.subject}{l.error ? <span className="text-eu-red"> · {l.error}</span> : null}</span><span className={`font-bold text-right ${l.status === "sent" ? "text-eu-green" : l.status === "failed" ? "text-eu-red" : "text-eu-muted"}`}>{l.status}</span></li>)}</ul> : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Δεν έχει σταλεί ακόμη.</p>}
      </section>
    </div>
  );
}
