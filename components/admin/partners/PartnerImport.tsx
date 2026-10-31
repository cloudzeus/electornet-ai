"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { runPartnerImport } from "@/app/admin/(shell)/synergates/actions";
import type { ImportSummary } from "@/lib/b2b/partners-import";

/** «Εισαγωγή από SoftOne»: πρώτα προεπισκόπηση (δεν γράφει τίποτα), μετά επιβεβαίωση. Από το SoftOne μόνο διαβάζουμε. */
export function PartnerImport() {
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const btn = "inline-flex items-center gap-2 rounded-full px-4 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-50";

  const run = (dryRun: boolean) => start(async () => {
    setMsg(null);
    const r = await runPartnerImport(dryRun);
    if (!r.ok) { setMsg(r.error); return; }
    if (dryRun) { setPreview(r.summary); return; }
    setPreview(null);
    const s = r.summary;
    setMsg(`Έγινε: ${s.partners.created} νέα μέλη, ${s.partners.updated} ενημερώσεις, ${s.branchRows.created} νέα υποκαταστήματα · συνδέθηκαν ${s.matched.byBranchEmail + s.matched.byPartnerEmail} καταστήματα · απομένουν ${s.storesWithoutPartner} καταστήματα eshop χωρίς μέλος.`);
  });

  return (
    <div className="grid gap-2 justify-items-start sm:justify-items-end max-w-[46ch]">
      <button type="button" disabled={pending} onClick={() => run(true)} className={`${btn} border-2 border-eu-navy text-eu-navy hover:bg-eu-navy hover:text-white`}>
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> Εισαγωγή από SoftOne
      </button>
      {preview && (
        <div role="status" className="rounded-xl border border-eu-line bg-white p-3 text-[length:var(--fs-13)] grid gap-2">
          <p className="m-0">Στο SoftOne: <b>{preview.members}</b> μέλη, <b>{preview.branches}</b> υποκαταστήματα και <b>{preview.virtual}</b> μέλη χωρίς υποκατάστημα (παίρνουν ένα από τη διεύθυνσή τους).</p>
          <p className="m-0">Θα συνδεθούν αυτόματα <b>{preview.matched.byBranchEmail + preview.matched.byPartnerEmail}</b> καταστήματα του eshop ({preview.matched.byBranchEmail} με το email του υποκαταστήματος, {preview.matched.byPartnerEmail} με το email του μέλους). Θα μείνουν <b>{preview.storesWithoutPartner}</b> για σύνδεση με το χέρι.</p>
          <p className="m-0 text-eu-ink-3">Στο SoftOne δεν γράφεται τίποτα.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(false)} className={`${btn} bg-eu-navy text-white hover:bg-eu-blue`}>Εισαγωγή τώρα</button>
            <button type="button" disabled={pending} onClick={() => setPreview(null)} className={`${btn} text-eu-ink hover:underline`}>Άκυρο</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">{msg}</p>}
    </div>
  );
}
