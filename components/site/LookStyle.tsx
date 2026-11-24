import type { ReactNode } from "react";
import { lookRules, type Look } from "@/lib/cms/look";
import { sxRule } from "@/lib/ui/sx-core";
import { SxStyleTag } from "@/components/ui/SxStyleTag";

/**
 * Η «Εμφάνιση» μιας ζώνης ως κλάσεις + το <style> τους (βλ. sx: το CSP δεν επιτρέπει style attributes).
 * Μία κλάση για τη βάση (υπολογιστής) και μία ανά συσκευή που διαφέρει, μέσα στο media query της.
 * null = καμία ρύθμιση — ο καλών αποδίδει το στοιχείο όπως ήταν.
 */
export function lookClass(l: Look): { className: string; node: ReactNode } | null {
  const rules = lookRules(l);
  if (!rules) return null;
  const base = sxRule(rules.base);
  // το --lk ξεχωρίζει την κλάση της συσκευής από μια ίδια «σκέτη» κλάση sx αλλού στη σελίδα (εκείνη θα ίσχυε σε όλες τις οθόνες)
  const dev = rules.devices.map((d, i) => { const r = sxRule({ ...d.style, "--lk": `d${i}-${d.media.length}` }); return { className: r.className, css: `@media ${d.media}{${r.css}}` }; });
  const className = [rules.className, base.className, ...dev.map((d) => d.className)].filter(Boolean).join(" ");
  const css = base.css + dev.map((d) => d.css).join("");
  return { className, node: css ? <SxStyleTag key={className} id={className} css={css} /> : null };
}
