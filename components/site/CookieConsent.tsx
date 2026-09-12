"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("cookies");

const KEY = "euronics.consent.v1";

/** GDPR / ePrivacy: equal-weight accept & reject, settings reachable, nothing pre-ticked. */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(KEY)) setShow(true);
      } catch {
        setShow(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const save = (a: boolean, m: boolean) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ analytics: a, marketing: m, at: new Date().toISOString() }));
    } catch {}
    setShow(false);
  };

  if (!show) return null;
  return (
    <div role="dialog" aria-label={c.rythmiseis_cookies} className="fixed inset-x-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-[420px] z-50 bg-white rounded-xl shadow-[var(--shadow-overlay)] border border-eu-line p-4">
      <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)] mb-1">Cookies</div>
      <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)] leading-relaxed">
        Χρησιμοποιούμε απαραίτητα cookies για να λειτουργεί το κατάστημα. Τα cookies μέτρησης και marketing ενεργοποιούνται μόνο αν το επιλέξεις.{" "}
        <Link href="/cookies" className="text-eu-blue underline">
          {c.politiki_cookies}
        </Link>
      </p>
      {settings && (
        <div className="grid gap-2 mt-3 text-[length:var(--fs-14)]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled className="size-4" /> Απαραίτητα (πάντα ενεργά)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="size-4 accent-eu-blue" /> {c.metrisi_episkepsimotitas}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="size-4 accent-eu-blue" /> Marketing
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button type="button" onClick={() => save(false, false)} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] py-2.5 min-h-11 hover:bg-eu-surface">
          {c.aporripsi}
        </button>
        <button type="button" onClick={() => save(true, true)} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] py-2.5 min-h-11 hover:bg-eu-blue">
          {c.apodochi_olon}
        </button>
        {settings ? (
          <button type="button" onClick={() => save(analytics, marketing)} className="col-span-2 rounded-full bg-eu-surface text-eu-ink font-bold text-[length:var(--fs-14)] py-2.5 min-h-11 hover:bg-eu-chip">
            {c.apothikeysi_epilogon}
          </button>
        ) : (
          <button type="button" onClick={() => setSettings(true)} className="col-span-2 text-eu-blue font-bold text-[length:var(--fs-14)] py-2 min-h-10 hover:underline">
            {c.rythmiseis}
          </button>
        )}
      </div>
    </div>
  );
}
