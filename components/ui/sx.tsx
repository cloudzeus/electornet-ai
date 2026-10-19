import type { ReactNode } from "react";
import { sxRule, type SxStyle } from "@/lib/ui/sx-core";
import { SxStyleTag } from "./SxStyleTag";

/**
 * Αντί για `style={{ … }}` (το CSP δεν επιτρέπει style attributes): `const s = sx({ width: w })` και
 * `<div className={s.className}>{s.node}…</div>`. Το `node` είναι το <style> της κλάσης — μπαίνει οπουδήποτε μέσα στο
 * δέντρο (σε στοιχεία χωρίς παιδιά, π.χ. <img>, δίπλα τους). Δουλεύει σε server και client components.
 * Για τιμές που αλλάζουν συνέχεια (σύρσιμο, animation) σε client components: ref + element.style (επιτρέπεται).
 */
export function sx(style: SxStyle): { className: string; node: ReactNode } {
  const { className, css } = sxRule(style);
  return { className, node: className ? <SxStyleTag key={className} id={className} css={css} /> : null };
}
