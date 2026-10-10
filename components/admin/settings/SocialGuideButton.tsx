"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { buildSocialGuide, guideToHtml, guideToMarkdown, type GuideProvider } from "@/lib/account/social-guide";

/**
 * «Δημιουργία οδηγού»: αναλυτικές οδηγίες ρύθμισης στα ελληνικά για το domain από το οποίο πατήθηκε (window.location),
 * με όλα τα URLs έτοιμα για αντιγραφή. Ανοίγει σε νέα καρτέλα (εκτύπωση / PDF) ή κατεβαίνει ως Markdown.
 */
export function SocialGuideButton({ providers, tenant, compact = false, label }: { providers?: GuideProvider[]; tenant?: string; compact?: boolean; label?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const doc = () => buildSocialGuide({ origin: window.location.origin, providers, microsoftTenant: tenant });
  const open = () => {
    const d = doc();
    const url = URL.createObjectURL(new Blob([guideToHtml(d)], { type: "text/html;charset=utf-8" }));
    const w = window.open(url, "_blank");
    setErr(w ? null : "Ο browser μπλόκαρε τη νέα καρτέλα — επίτρεψε τα αναδυόμενα παράθυρα για τη διαχείριση ή κατέβασε το αρχείο.");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const download = () => {
    const d = doc();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([guideToMarkdown(d)], { type: "text/markdown;charset=utf-8" }));
    a.download = `social-login-${(providers?.length === 1 ? providers[0] : "oloi")}-${d.host.replace(/[^a-z0-9.-]/gi, "_")}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const cls = "inline-flex items-center justify-center gap-2 rounded-full font-extrabold text-[length:var(--fs-14)] px-4 min-h-11";
  return (
    <span className="inline-grid gap-1">
      <span className="flex flex-wrap gap-2">
        <button type="button" onClick={open} className={`${cls} ${compact ? "border-2 border-eu-navy text-eu-navy hover:bg-white" : "bg-eu-navy text-white hover:bg-eu-blue"}`}><FileText className="size-4" aria-hidden /> {label ?? "Δημιουργία οδηγού"}</button>
        <button type="button" onClick={download} className={`${cls} border border-eu-line text-eu-ink-2 hover:bg-eu-surface`} aria-label={`${label ?? "Οδηγός"}: λήψη ως αρχείο Markdown`}><Download className="size-4" aria-hidden /> .md</button>
      </span>
      {err && <span role="alert" className="text-eu-red font-bold text-[length:var(--fs-13)]">{err}</span>}
    </span>
  );
}

/** Επιλογή παρόχων + κουμπί (για την κεφαλίδα της σελίδας). */
export function SocialGuidePanel({ tenant }: { tenant?: string }) {
  const [which, setWhich] = useState<"all" | GuideProvider>("all");
  const [host, setHost] = useState<string>("");
  return (
    <div className="rounded-xl border border-eu-line bg-eu-surface/60 p-3 grid gap-2" onMouseEnter={() => setHost(window.location.host)} onFocus={() => setHost(window.location.host)}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="font-bold text-eu-ink text-[length:var(--fs-14)]">Οδηγός ρύθμισης για</span>
          <select value={which} onChange={(e) => setWhich(e.target.value as typeof which)} className="rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)]">
            <option value="all">Όλους τους παρόχους</option>
            <option value="google">Google</option>
            <option value="microsoft">Microsoft</option>
            <option value="facebook">Facebook</option>
            <option value="apple">Apple</option>
          </select>
        </label>
        <SocialGuideButton providers={which === "all" ? undefined : [which]} tenant={tenant} />
      </div>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Βήμα-βήμα οδηγίες στα ελληνικά με όλα τα URLs για το domain από το οποίο το πατάς{host ? <> (<b>{host}</b>)</> : ""}. Για άλλο domain (π.χ. το live ή το euronics.gr), άνοιξε τη διαχείριση από εκεί και πάτα ξανά.</p>
    </div>
  );
}
