import { BRAND, FONT, button, esc, emailImg, money, renderEmail, type Block as EmailBlock, type EmailCtx } from "../email/layout-core";
import type { Block } from "./core";

/**
 * Απόδοση του newsletter προσφοράς σε τελικό HTML + απλό κείμενο.
 * Καθαρή συνάρτηση: το ctx και τα προϊόντα περνούν ως όρισμα (καμία ανάγνωση ρυθμίσεων/βάσης).
 * Το κέλυφος και το υποσέλιδο έρχονται από το `renderEmail` του email design system.
 */
export type NewsletterProduct = { title: string; brand: string; image: string | null; href: string; price: number; listPrice: number | null };

export interface RenderNewsletterInput {
  subject: string;
  preheader: string;
  blocks: Block[];
  products: Map<string, NewsletterProduct>;
  ctx: EmailCtx;
  /** Παράμετροι UTM χωρίς αρχικό `?`/`&`, π.χ. `utm_source=newsletter&utm_medium=email&utm_campaign=BF26`. */
  utm: string;
  /** URL διαγραφής ή το placeholder του Mailgun `%recipient.unsub%` — δεν παίρνει UTM. */
  unsubscribe: string;
  /** «Προβολή στον browser» — null όταν δεν υπάρχει (π.χ. πριν την αποθήκευση). */
  viewUrl: string | null;
}

const FOOTER_NOTE = "Το λαμβάνετε γιατί έχετε εγγραφεί στο newsletter ή δώσει συναίνεση για προσφορές του euronics.gr.";

/** Κείμενο χωρίς tags (το περιεχόμενο των admins/προϊόντων δεν πρέπει να βγάζει HTML ούτε στο text). */
const plain = (s: string) => s.replace(/<[^>]*>/g, "");

/** Σύνδεσμος του site (σχετικός ή με το baseUrl) → απόλυτος με UTM· οτιδήποτε άλλο μένει ως έχει. */
function tag(ctx: EmailCtx, utm: string, href: string, content: string): string {
  const base = new URL(ctx.baseUrl);
  let u: URL;
  try { u = new URL(href, base); } catch { return href; }
  if (u.origin !== base.origin) return href;
  for (const [k, v] of new URLSearchParams(utm)) u.searchParams.set(k, v);
  if (content) u.searchParams.set("utm_content", content);
  return u.toString();
}

const heroBlock = (ctx: EmailCtx, b: Extract<Block, { type: "hero" }>, link: string): EmailBlock => {
  const head = `<h1 style="margin:0 0 8px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:800;color:${BRAND.ink}">${esc(b.headline)}</h1><p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${BRAND.ink2}">${esc(b.sub)}</p>`;
  const text = `${plain(b.headline)}\n${plain(b.sub)}\n${link}`;
  if (b.image) {
    return { html: `<a href="${esc(link)}" style="text-decoration:none"><img src="${esc(emailImg(ctx, b.image))}" width="528" alt="${esc(b.alt)}" style="display:block;width:100%;max-width:528px;height:auto;border:0;border-radius:14px;margin:0 0 16px"></a>${head}`, text };
  }
  return { html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px"><tr><td style="background:${BRAND.navy};border-radius:14px;padding:30px 26px;font-family:${FONT}"><a href="${esc(link)}" style="text-decoration:none;color:#ffffff"><div style="font-size:26px;line-height:1.2;font-weight:800;color:#ffffff">${esc(b.headline)}</div></a><div style="margin-top:8px;font-size:16px;line-height:1.55;color:#c9d4ee">${esc(b.sub)}</div></td></tr></table>`, text };
};

const textBlock = (body: string): EmailBlock => {
  const paras = body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return {
    html: paras.map((s) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:16px;line-height:1.55;color:${BRAND.ink2}">${esc(s).replace(/\n/g, "<br>")}</p>`).join(""),
    text: paras.map(plain).join("\n\n"),
  };
};

/** 2 στήλες· σε στενή οθόνη το `@media` (βλ. PRODUCTS_CSS) τις κάνει 1. Άγνωστα ids παραλείπονται. */
const productsBlock = (ctx: EmailCtx, utm: string, ids: string[], products: Map<string, NewsletterProduct>): EmailBlock | null => {
  const items = ids.map((id) => products.get(id)).filter((x): x is NewsletterProduct => !!x);
  if (!items.length) return null;
  const card = (it: NewsletterProduct, col: number) => {
    const link = tag(ctx, utm, it.href, "products");
    const old = it.listPrice != null && it.listPrice > it.price ? ` <span style="font-size:14px;font-weight:400;color:${BRAND.muted};text-decoration:line-through">${money(it.listPrice)}</span>` : "";
    return `<td class="nl-col" width="50%" valign="top" style="width:50%;padding:0 ${col ? "0 16px 8px" : "8px 16px 0"};vertical-align:top;font-family:${FONT}"><a href="${esc(link)}" style="text-decoration:none;color:${BRAND.ink}"><div style="background:${BRAND.surface};border-radius:12px;padding:10px;text-align:center">${it.image ? `<img src="${esc(emailImg(ctx, it.image))}" width="160" alt="${esc(it.title)}" style="display:block;margin:0 auto;width:160px;max-width:100%;height:160px;object-fit:contain;border:0">` : `<div style="height:160px"></div>`}</div><div style="font-size:14px;font-weight:700;color:${BRAND.muted};margin-top:8px">${esc(it.brand)}</div><div style="font-size:15px;font-weight:700;line-height:1.3;color:${BRAND.ink}">${esc(it.title)}</div><div style="font-size:17px;font-weight:800;color:${BRAND.navy};margin-top:4px">${money(it.price)}${old}</div></a><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 0"><tr><td style="border-radius:999px;background:${BRAND.yellow}"><a href="${esc(link)}" style="display:inline-block;padding:10px 20px;font-family:${FONT};font-size:14px;font-weight:800;color:${BRAND.navy};text-decoration:none;border-radius:999px">Δες το</a></td></tr></table></td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    rows.push(`<tr>${pair.map((it, c) => card(it, c)).join("")}${pair.length === 1 ? `<td class="nl-col" width="50%" style="width:50%;padding:0 0 0 8px"></td>` : ""}</tr>`);
  }
  return {
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px">${rows.join("")}</table>`,
    text: items.map((it) => `- ${plain(it.brand)} ${plain(it.title)} — ${money(it.price)}${it.listPrice != null && it.listPrice > it.price ? ` (αντί ${money(it.listPrice)})` : ""}\n  ${tag(ctx, utm, it.href, "products")}`).join("\n"),
  };
};

const PRODUCTS_CSS = "@media (max-width:480px){.nl-col{display:block!important;width:100%!important;padding:0 0 16px!important}}";

export function renderNewsletter(input: RenderNewsletterInput): { html: string; text: string } {
  const { ctx, utm, products } = input;
  const blocks: EmailBlock[] = [];
  for (const b of input.blocks) {
    if (b.type === "hero") blocks.push(heroBlock(ctx, b, tag(ctx, utm, b.href, "hero")));
    else if (b.type === "text") blocks.push(textBlock(b.body));
    else if (b.type === "products") { const pb = productsBlock(ctx, utm, b.ids, products); if (pb) blocks.push(pb); }
    else { const link = tag(ctx, utm, b.href, "cta"); const btn = button(plain(b.label), link); blocks.push({ html: btn.html, text: `${plain(b.label)}: ${link}` }); }
  }
  const footerNote = `${esc(FOOTER_NOTE)}${input.viewUrl ? ` <a href="${esc(input.viewUrl)}" style="color:${BRAND.blue}">Προβολή στον browser</a>` : ""}`;
  const r = renderEmail({ ...ctx, unsubscribeUrl: input.unsubscribe }, { subject: input.subject, preheader: input.preheader, blocks, footerNote, marketing: true, css: PRODUCTS_CSS });
  // Ό,τι άλλο δείχνει στο site (λογότυπο, Απόρρητο, Όροι) παίρνει UTM χωρίς block· τα unsubscribe/προβολή μένουν ως έχουν.
  const skip = new Set([input.unsubscribe, input.viewUrl].filter((x): x is string => !!x));
  const html = r.html.replace(/href="([^"]*)"/g, (m, raw: string) => {
    const href = raw.replace(/&amp;/g, "&");
    if (skip.has(href) || /(^|[?&])utm_source=/.test(href)) return m;
    const t = tag(ctx, utm, href, "layout");
    return t === href ? m : `href="${esc(t)}"`;
  });
  const text = [r.text, "", plain(FOOTER_NOTE), input.viewUrl ? `Προβολή στον browser: ${input.viewUrl}` : ""].filter((x, i) => i === 1 || x).join("\n");
  return { html, text };
}
