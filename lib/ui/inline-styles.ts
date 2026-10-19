/**
 * HTML με inline styles (emails) μέσα σε iframe srcDoc της διαχείρισης: το iframe κληρονομεί το CSP της σελίδας, που δεν
 * επιτρέπει style attributes. Εδώ κάθε `style="…"` γίνεται κλάση `e-<hash>` σε ένα `<style nonce>` στο τέλος του <head>
 * (ίδια προτεραιότητα με πριν: μετά τα υπάρχοντα <style>, που κρατούν τα !important τους) και τα υπάρχοντα <style>
 * παίρνουν το nonce. Μόνο για προεπισκόπηση — το email που στέλνεται μένει με inline styles.
 */
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const clean = (s: string) => s.replace(/[{}<>]|\/\*|\*\//g, "");

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

/** Δηλώσεις ταξινομημένες ανά ιδιότητα, ώστε ίδιο style με άλλη σειρά → ίδια κλάση. */
function normalize(style: string): string {
  return decode(style).split(";").map((d) => d.trim()).filter((d) => d.includes(":"))
    .map((d) => { const i = d.indexOf(":"); return [d.slice(0, i).trim().toLowerCase(), clean(d.slice(i + 1).trim())] as const; })
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(";");
}

export function stylesToClasses(html: string, nonce: string | null | undefined): string {
  if (!nonce) return html;
  const n = nonce.replace(/"/g, "");
  const rules = new Map<string, string>();
  let out = html.replace(/<([a-zA-Z][\w-]*)(\s[^<>]*?)?(\/?)>/g, (tag, name: string, attrs: string | undefined, slash: string) => {
    if (!attrs || !/\sstyle="/i.test(attrs)) return tag;
    const style = /\sstyle="([^"]*)"/i.exec(attrs)![1];
    const body = normalize(style);
    let rest = attrs.replace(/\sstyle="[^"]*"/i, "");
    if (!body) return `<${name}${rest}${slash}>`;
    const cls = `e-${hash(body)}`;
    rules.set(cls, body);
    rest = /\sclass="/i.test(rest) ? rest.replace(/\sclass="([^"]*)"/i, (_, c: string) => ` class="${c ? `${c} ` : ""}${cls}"`) : `${rest} class="${cls}"`;
    // κρατάμε τη σειρά: class πρώτο, όπως στα templates
    return `<${name}${rest.replace(/^([\s\S]*?)(\sclass="[^"]*")([\s\S]*)$/, "$2$1$3")}${slash}>`;
  });
  out = out.replace(/<style\b(?![^>]*\bnonce=)/gi, `<style nonce="${n}"`);
  const sheet = `<style nonce="${n}">${[...rules].map(([c, b]) => `.${c}{${b}}`).join("")}</style>`;
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${sheet}</head>`) : `${sheet}${out}`;
}
