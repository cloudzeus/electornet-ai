"use client";

import { useEffect, useState } from "react";
import { Rows3, Rows4 } from "lucide-react";

const KEY = "eu-admin-density";

/**
 * Πυκνότητα του διαχειριστικού: «άνετα» ή «συμπαγή». Γράφει `data-density`
 * στο `.eu-admin`, όπου η κλίμακα γραμματοσειράς και τα paddings των πινάκων
 * μικραίνουν (app/globals.css). Η επιλογή μένει στον browser του χρήστη.
 */
export function DensityToggle() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    let v = false;
    try { v = localStorage.getItem(KEY) === "compact"; } catch {}
    if (v) setTimeout(() => setCompact(true), 0);
  }, []);
  useEffect(() => {
    const el = document.querySelector(".eu-admin");
    if (el) el.setAttribute("data-density", compact ? "compact" : "comfortable");
  }, [compact]);
  const set = (v: boolean) => { setCompact(v); try { localStorage.setItem(KEY, v ? "compact" : "comfortable"); } catch {} };
  return (
    <div className="flex rounded-full border border-white/20 overflow-hidden" role="group" aria-label="Πυκνότητα">
      <button type="button" onClick={() => set(false)} aria-pressed={!compact} title="Άνετη προβολή" className={`size-8 inline-flex items-center justify-center ${!compact ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
        <Rows3 className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => set(true)} aria-pressed={compact} title="Συμπαγής προβολή — περισσότερα δεδομένα στην οθόνη" className={`size-8 inline-flex items-center justify-center ${compact ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}>
        <Rows4 className="size-4" aria-hidden />
      </button>
    </div>
  );
}
