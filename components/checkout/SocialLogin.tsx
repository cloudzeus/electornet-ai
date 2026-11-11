"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppleMark, GoogleMark, MicrosoftMark, FacebookMark } from "./BrandMarks";

export type Provider = "google" | "microsoft" | "facebook" | "apple";

// Ίδια ουδέτερη εμφάνιση για όλους: το χρώμα το κουβαλά μόνο το σήμα του παρόχου (επιτρέπεται από τις οδηγίες Google/Microsoft/Facebook/Apple).
const META: Record<Provider, { label: string; mark: React.ReactNode }> = {
  google: { label: "Google", mark: <GoogleMark /> },
  microsoft: { label: "Microsoft", mark: <MicrosoftMark /> },
  facebook: { label: "Facebook", mark: <FacebookMark /> },
  apple: { label: "Apple", mark: <AppleMark /> },
};

/**
 * Σύνδεση / εγγραφή με Google, Microsoft, Facebook, Apple (πραγματικό OAuth — /api/account/oauth/<πάροχος>).
 * Εμφανίζει μόνο όσους παρόχους έχουν ενεργοποιηθεί ΚΑΙ ρυθμιστεί πλήρως στις Ρυθμίσεις → Social login· αν δεν
 * υπάρχει κανένας, δεν εμφανίζεται τίποτα (ούτε το διαχωριστικό «ή»). Μετά τη σύνδεση επιστρέφει στη σελίδα.
 */
export function SocialLogin({ next, separator = "none" }: { next?: string; separator?: "none" | "before" | "after" }) {
  const [live, setLive] = useState<Provider[] | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  useEffect(() => { let on = true; fetch("/api/account/oauth/providers").then((r) => r.json()).then((j: { providers?: Provider[] }) => { if (on) setLive(j.providers ?? []); }).catch(() => { if (on) setLive([]); }); return () => { on = false; }; }, []);
  if (!live?.length) return null;
  const sep = <div className="flex items-center gap-3 text-eu-muted text-[length:var(--fs-13)]"><span className="flex-1 h-px bg-eu-line" /> ή <span className="flex-1 h-px bg-eu-line" /></div>;
  return (
    <div className="@container grid gap-2">
      {separator === "before" && sep}
      {live.length > 1 && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)] font-semibold">Συνέχεια με</p>}
      {/* όλα σε μία σειρά όταν χωράνε, αλλιώς ένα κάτω από το άλλο (ποτέ 2+1 με ορφανό) */}
      <div className={`grid gap-2 grid-cols-1 ${live.length === 3 ? "@[27rem]:grid-cols-3" : live.length > 1 ? "@[18rem]:grid-cols-2" : ""}`}>
        {live.map((p) => (
          <a key={p} href={`/api/account/oauth/${p}`} aria-label={`Συνέχεια με ${META[p].label}`} aria-busy={busy === p}
            onClick={(e) => {
              // επιστροφή στη σελίδα όπου πατήθηκε (ή στο ?next= της)
              e.preventDefault(); setBusy(p);
              const back = next ?? new URLSearchParams(window.location.search).get("next") ?? `${window.location.pathname}${window.location.search}`;
              // πλήρης πλοήγηση (όχι router.push): το route ανακατευθύνει στον πάροχο
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign(`/api/account/oauth/${p}?next=${encodeURIComponent(back)}`);
            }}
            className={`rounded-full bg-white border-2 border-eu-line text-eu-ink font-semibold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center gap-2 px-4 whitespace-nowrap transition-colors hover:border-eu-blue hover:bg-eu-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-eu-blue ${busy && busy !== p ? "opacity-60 pointer-events-none" : ""}`}>
            {busy === p ? <Loader2 className="size-4 animate-spin" aria-hidden /> : META[p].mark}
            <span>{live.length === 1 ? `Συνέχεια με ${META[p].label}` : META[p].label}</span>
          </a>
        ))}
      </div>
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)] leading-snug">Αν δεν έχεις λογαριασμό, δημιουργείται αυτόματα. Συνεχίζοντας αποδέχεσαι τους <Link href="/oroi-chrisis" className="underline hover:text-eu-blue">όρους χρήσης</Link> και την <Link href="/aporrito" className="underline hover:text-eu-blue">πολιτική απορρήτου</Link>.</p>
      {separator === "after" && sep}
    </div>
  );
}
