import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Απόδειξη συναίνεσης" };

/** Print-ready evidence bundle for the DPA: identity, every consent decision with device/IP proof, the wordings shown, logins. */
export default async function ConsentProof({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.export");
  const { id } = await params;
  const c = await db.customer.findUnique({ where: { id }, include: { consents: { orderBy: { at: "asc" } }, logins: { orderBy: { at: "asc" }, take: 200 }, subscriptions: true } });
  if (!c) notFound();
  const keys = [...new Set(c.consents.map((x) => x.textKey).filter(Boolean))] as string[];
  const versions = [...new Set(c.consents.map((x) => `${x.textKey}|${x.textVersion}`))];
  const texts = keys.length ? await db.consentText.findMany({ where: { key: { in: keys } } }) : [];
  const dt = (x: Date | null) => (x ? x.toLocaleString("el-GR") : "—");
  return (
    <div className="bg-white text-eu-ink max-w-[960px] p-6 print:p-0 text-[length:var(--fs-14)] grid gap-5" style={{ fontFamily: "Manrope, system-ui, sans-serif" }}>
      <style>{`@media print { aside, header, nav, .no-print { display: none !important } main { padding: 0 !important } body { background: #fff } }`}</style>
      <div className="flex items-start justify-between gap-4 border-b border-eu-line pb-3">
        <div><div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] uppercase tracking-wide">MEGA ELECTRICS ΑΕΒΕ · euronics.gr</div><h1 className="m-0 font-heading font-bold text-[length:var(--fs-22)]">Αποδεικτικό συναινέσεων υποκειμένου δεδομένων</h1><div className="text-eu-muted">Παράχθηκε {new Date().toLocaleString("el-GR")} από {user.name} · Πελάτης #{c.number}</div></div>
        <button type="button" className="no-print rounded-full bg-eu-navy text-white font-extrabold px-4 min-h-11" onClick={undefined}>{/* client-side print handled by browser */}Εκτύπωση: Ctrl/Cmd+P</button>
      </div>
      <section><h2 className="m-0 font-bold text-[length:var(--fs-16)] mb-1">1. Υποκείμενο</h2><dl className="m-0 grid grid-cols-[180px_minmax(0,1fr)] gap-x-3 gap-y-0.5"><dt className="text-eu-muted">Ονοματεπώνυμο</dt><dd className="m-0">{c.lastName} {c.firstName}{c.company ? ` (${c.company})` : ""}</dd><dt className="text-eu-muted">Email</dt><dd className="m-0">{c.email}</dd><dt className="text-eu-muted">Τηλέφωνο</dt><dd className="m-0">{c.mobile ?? c.phone ?? "—"}</dd><dt className="text-eu-muted">Λογαριασμός από</dt><dd className="m-0">{dt(c.createdAt)}</dd><dt className="text-eu-muted">Κατάσταση</dt><dd className="m-0">{c.status}{c.anonymisedAt ? ` (ανωνυμοποίηση ${dt(c.anonymisedAt)})` : ""}</dd><dt className="text-eu-muted">Newsletter</dt><dd className="m-0">{c.subscriptions.map((s) => `${s.email}: ${s.status}${s.confirmedAt ? ` (double opt-in ${dt(s.confirmedAt)})` : ""}`).join("; ") || "—"}</dd></dl></section>
      <section><h2 className="m-0 font-bold text-[length:var(--fs-16)] mb-1">2. Ιστορικό συναινέσεων ({c.consents.length})</h2>
        <table className="w-full border-collapse text-[length:var(--fs-13)]"><thead><tr className="text-left bg-eu-surface"><th className="p-1.5 border border-eu-line">Ημ/νία & ώρα</th><th className="p-1.5 border border-eu-line">Θέμα / κανάλι</th><th className="p-1.5 border border-eu-line">Απόφαση</th><th className="p-1.5 border border-eu-line">Μέθοδος · πηγή · URL</th><th className="p-1.5 border border-eu-line">Κείμενο (έκδοση · hash)</th><th className="p-1.5 border border-eu-line">IP</th><th className="p-1.5 border border-eu-line">Συσκευή / λογισμικό</th></tr></thead><tbody>
          {c.consents.map((x) => <tr key={x.id} className="align-top"><td className="p-1.5 border border-eu-line whitespace-nowrap tabular-nums">{dt(x.at)}{x.confirmedAt ? <div className="text-eu-green">επιβεβ. {dt(x.confirmedAt)}</div> : null}</td><td className="p-1.5 border border-eu-line">{x.topic} · {x.channel}</td><td className={`p-1.5 border border-eu-line font-bold ${x.granted ? "text-eu-green" : "text-eu-red"}`}>{x.granted ? "ΣΥΝΑΙΝΕΣΗ" : "ΑΝΑΚΛΗΣΗ"}</td><td className="p-1.5 border border-eu-line">{x.method} · {x.source}{x.staffId ? " · από προσωπικό" : ""}<div className="text-eu-muted break-all">{x.url ?? ""}</div></td><td className="p-1.5 border border-eu-line font-mono">{x.textKey ?? "—"} {x.textVersion ?? ""}<div className="break-all text-eu-muted">{x.textHash ?? ""}</div></td><td className="p-1.5 border border-eu-line font-mono">{x.ip ?? "—"}{x.ipHash ? <div className="text-eu-muted break-all">h:{x.ipHash.slice(0, 16)}…</div> : null}</td><td className="p-1.5 border border-eu-line">{[x.os, x.browser, x.device, x.locale, x.timezone].filter(Boolean).join(" · ") || "—"}<div className="text-eu-muted break-all">{x.userAgent ?? ""}</div></td></tr>)}
        </tbody></table></section>
      <section><h2 className="m-0 font-bold text-[length:var(--fs-16)] mb-1">3. Κείμενα συναίνεσης που εμφανίστηκαν</h2>
        {versions.filter((v) => !v.startsWith("null")).map((v) => { const [k, ver] = v.split("|"); const t = texts.find((x) => x.key === k && x.version === ver); return t ? <div key={v} className="rounded-lg border border-eu-line p-2 mb-2"><div className="font-bold">{t.title} — έκδοση {t.version} ({t.locale}) · ισχύει από {dt(t.effectiveFrom)}</div><div className="whitespace-pre-wrap">{t.text}</div><div className="text-eu-muted font-mono break-all">sha256 {t.hash}</div></div> : null; })}
      </section>
      <section><h2 className="m-0 font-bold text-[length:var(--fs-16)] mb-1">4. Συνδέσεις λογαριασμού ({c.logins.length})</h2>
        <table className="w-full border-collapse text-[length:var(--fs-13)]"><thead><tr className="text-left bg-eu-surface"><th className="p-1.5 border border-eu-line">Ημ/νία & ώρα</th><th className="p-1.5 border border-eu-line">Αποτέλεσμα</th><th className="p-1.5 border border-eu-line">Μέθοδος</th><th className="p-1.5 border border-eu-line">IP</th><th className="p-1.5 border border-eu-line">Συσκευή / λογισμικό</th></tr></thead><tbody>{c.logins.map((l) => <tr key={l.id}><td className="p-1.5 border border-eu-line tabular-nums">{dt(l.at)}</td><td className="p-1.5 border border-eu-line">{l.success ? "επιτυχία" : `αποτυχία (${l.reason ?? ""})`}</td><td className="p-1.5 border border-eu-line">{l.method}</td><td className="p-1.5 border border-eu-line font-mono">{l.ip ?? "—"}</td><td className="p-1.5 border border-eu-line">{[l.os, l.browser, l.device].filter(Boolean).join(" · ")}<div className="text-eu-muted break-all">{l.userAgent ?? ""}</div></td></tr>)}</tbody></table></section>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Το ledger συναινέσεων είναι μόνο-προσθήκης: καμία γραμμή δεν τροποποιείται ή διαγράφεται. Οι IP διατηρούνται μαζί με hash (SHA-256 με server salt) ώστε η απόδειξη να παραμένει έγκυρη και μετά από ανωνυμοποίηση. Χρόνοι σε τοπική ώρα Ελλάδας του server.</p>
    </div>
  );
}
