import Image from "next/image";

/**
 * Η περιγραφή του ERP είναι ελεύθερο κείμενο, αλλά σχεδόν πάντα έχει δομή που χάνεται σε μία παράγραφο:
 * γραμμές «ΤΙΤΛΟΣ : α, β, γ» (λειτουργίες, προγράμματα) και κανονικές παραγράφους. Εδώ οι πρώτες γίνονται
 * τίτλος + λίστα, οι δεύτερες παράγραφοι· από κάτω μπαίνουν τα banners χαρακτηριστικών του κατασκευαστή.
 */
export interface Banner { url: string; width: number | null; height: number | null; alt: string | null; blur?: string | null }

type Block = { kind: "p"; text: string } | { kind: "list"; title: string; items: string[] };
const tidy = (s: string) => { const t = s.trim().replace(/[.;]+$/, ""); return t ? t[0].toLocaleUpperCase("el-GR") + t.slice(1) : t; };
/** Το ERP γράφει τις επικεφαλίδες με κεφαλαία χωρίς τόνους· οι συχνές παίρνουν τη σωστή γραφή, οι υπόλοιπες απλώς πεζά. */
const HEADINGS: Record<string, string> = { "ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Χαρακτηριστικά", "ΑΛΛΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Άλλα χαρακτηριστικά", "ΓΕΝΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Γενικά χαρακτηριστικά", "ΤΕΧΝΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ": "Τεχνικά χαρακτηριστικά", "ΠΡΟΓΡΑΜΜΑΤΑ": "Προγράμματα", "ΛΕΙΤΟΥΡΓΙΕΣ": "Λειτουργίες", "ΑΣΦΑΛΕΙΑ": "Ασφάλεια", "ΣΥΝΔΕΣΙΜΟΤΗΤΑ": "Συνδεσιμότητα", "ΓΕΝΙΚΑ": "Γενικά", "ΕΞΟΠΛΙΣΜΟΣ": "Εξοπλισμός", "ΑΞΕΣΟΥΑΡ": "Αξεσουάρ", "ΠΕΡΙΛΑΜΒΑΝΕΙ": "Περιλαμβάνει", "ΣΥΝΤΗΡΗΣΗ": "Συντήρηση", "ΚΑΤΑΨΥΞΗ": "Κατάψυξη", "ΑΠΟΔΟΣΗ": "Απόδοση", "ΑΝΕΣΗ": "Άνεση" };
const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const titleCase = (s: string) => HEADINGS[strip(s).toLocaleUpperCase("el-GR").trim()] ?? (s === s.toLocaleUpperCase("el-GR") ? s[0] + s.slice(1).toLocaleLowerCase("el-GR") : s);

export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim(); if (!line) continue;
    const m = /^([^:]{3,40}?)\s*:\s*(.+)$/.exec(line);
    const items = m ? m[2].split(/\s*,\s*(?![^()]*\))/).map(tidy).filter(Boolean) : [];
    if (m && items.length >= 3 && m[1].split(/\s+/).length <= 4) out.push({ kind: "list", title: titleCase(m[1].trim()), items });
    else out.push({ kind: "p", text: line });
  }
  return out;
}

export function RichDescription({ text, banners = [] }: { text: string; banners?: Banner[] }) {
  const blocks = parseBlocks(text);
  return (
    <div className="grid gap-5 max-w-[78ch]">
      {blocks.map((b, i) => b.kind === "p" ? (
        <p key={i} className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.75]">{b.text}</p>
      ) : (
        <div key={i}>
          <h3 className="m-0 mb-2 font-bold text-eu-ink text-[length:var(--fs-17)]">{b.title}</h3>
          <ul className="m-0 p-0 list-none grid gap-x-6 gap-y-1.5 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
            {b.items.map((it) => <li key={it} className="flex gap-2 text-eu-ink-2 text-[length:var(--fs-15)] leading-snug"><span className="mt-[0.55em] size-1.5 rounded-full bg-eu-yellow shrink-0" aria-hidden />{it}</li>)}
          </ul>
        </div>
      ))}
      {banners.length > 0 && (
        <div className="grid gap-3 mt-2">
          {banners.map((b) => b.width && b.height ? (
            <Image key={b.url} src={b.url} alt={b.alt ?? ""} width={b.width} height={b.height} sizes="(min-width: 1024px) 760px, 100vw" placeholder={b.blur ? "blur" : "empty"} blurDataURL={b.blur ?? undefined} className="w-full h-auto rounded-xl" />
          ) : null)}
        </div>
      )}
    </div>
  );
}
