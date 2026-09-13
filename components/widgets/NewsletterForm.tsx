"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * @dynamic Newsletter signup with explicit, un-prechecked consent. Sends the
 * exact consent wording shown, the page URL and the timezone with the
 * request; the server adds IP, OS, browser and device to the consent ledger
 * and starts the double opt-in email.
 */
export function NewsletterForm({ consentText, labels }: { consentText: string; labels: { email: string; submit: string; privacy: string } }) {
  const [state, setState] = useState<"idle" | "busy" | "pending" | "subscribed" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("busy");
    try {
      const r = await fetch("/api/newsletter/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fd.get("email"), source: "footer", url: location.href, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, consentText }) });
      const j = (await r.json()) as { ok: boolean; status?: string; already?: boolean; error?: string };
      if (!j.ok) { setState("error"); setMsg(j.error ?? "Κάτι πήγε στραβά."); return; }
      setState(j.status === "subscribed" ? "subscribed" : "pending");
    } catch {
      setState("error"); setMsg("Κάτι πήγε στραβά. Δοκίμασε ξανά.");
    }
  };
  if (state === "pending" || state === "subscribed")
    return (
      <div role="status" className="rounded-2xl bg-white border border-eu-line p-4 flex items-start gap-3">
        <span className="size-9 rounded-full bg-eu-green/10 text-eu-green grid place-items-center shrink-0"><Check className="size-5" aria-hidden /></span>
        <div className="text-[length:var(--fs-15)]"><b>{state === "subscribed" ? "Είσαι ήδη εγγεγραμμένος." : "Σχεδόν έτοιμο!"}</b><div className="text-eu-muted">{state === "subscribed" ? "Θα συνεχίσεις να λαμβάνεις το newsletter." : "Σου στείλαμε email επιβεβαίωσης. Πάτησε τον σύνδεσμο για να ολοκληρωθεί η εγγραφή."}</div></div>
      </div>
    );
  return (
    <form onSubmit={submit}>
      <div className="flex gap-2 mb-2">
        <label htmlFor="nl-email" className="sr-only">{labels.email}</label>
        <input id="nl-email" name="email" type="email" required autoComplete="email" placeholder={labels.email} className="flex-1 min-w-0 rounded-full bg-white border border-eu-line text-eu-ink placeholder:text-eu-muted-2 px-4 py-3 text-[length:var(--fs-15)] outline-none focus-visible:ring-2 ring-eu-blue" />
        <button type="submit" disabled={state === "busy"} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue disabled:opacity-60 inline-flex items-center gap-2">{state === "busy" && <Loader2 className="size-4 animate-spin" aria-hidden />} {labels.submit}</button>
      </div>
      <label className="flex items-start gap-2 text-eu-muted text-[length:var(--fs-13-5)] leading-[1.45] cursor-pointer">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-eu-blue" />
        <span>{consentText.replace(/\s*\.$/, "")}{" "}(<a href="/aporrito" className="text-eu-blue underline">{labels.privacy}</a>).</span>
      </label>
      {state === "error" && <p role="alert" className="m-0 mt-1 text-eu-red font-bold text-[length:var(--fs-14)]">{msg}</p>}
    </form>
  );
}
