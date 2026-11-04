import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sketsKeyOk } from "@/lib/skets/auth";
import { buildBeats, fillStore, pickOf, totalOf, type Beat } from "@/lib/skets/script";
import snapshot from "@/lib/skets/snapshot.json";
import type { Snapshot } from "@/lib/skets/types";

export const metadata: Metadata = { title: "Ερμής — σενάριο", robots: { index: false, follow: false } };

const snap = snapshot as Snapshot;
const eur = (n: number) => `${n.toLocaleString("el-GR", { maximumFractionDigits: 0 })} €`;
/** οι ατάκες του παρουσιαστή είναι σε «»· ό,τι άλλο στο cue είναι οδηγία σκηνής */
/** «AEG» + «AEG LTR7E373G …» → χωρίς διπλή μάρκα */
const name = (p: { brand: string; title: string }) => (p.title.toUpperCase().startsWith(p.brand.toUpperCase()) ? p.title : `${p.brand} ${p.title}`);
const isLine = (cue: string) => /^«[\s\S]*»$/.test(cue.trim());

type Row = { who: "hermes" | "presenter" | "stage"; text: string; n?: number };

/** Το σενάριο ως θεατρικό κείμενο: Ερμής (ηχογραφημένος), παρουσιαστής (ατάκα που πρέπει να πει), οδηγίες σκηνής/χειριστή. */
function rows(beats: Beat[]): { title: string; rows: Row[] }[] {
  const out: { title: string; rows: Row[] }[] = [{ title: "Αρχή", rows: [] }];
  const store = "το κατάστημα που θα διαλέξεις";
  let n = 0;
  for (const b of beats) {
    const act = b.act;
    if (act?.t === "cat") out.push({ title: snap.cats.find((c) => c.key === act.cat)!.label, rows: [] });
    if (act?.t === "summary") out.push({ title: "Σύνολο & κατάστημα", rows: [] });
    const r = out[out.length - 1].rows;
    if (act?.t === "reject") {
      const p = snap.cats.find((c) => c.key === act.cat)!.candidates.find((x) => x.id === act.id);
      r.push({ who: "stage", text: `Στην οθόνη φεύγει: ${p ? name(p) : act.id} — ${act.reason}` });
    }
    if (act?.t === "pick") {
      const p = snap.cats.find((c) => c.key === act.cat)!.candidates.find((x) => x.id === act.id);
      if (p) r.push({ who: "stage", text: `Επιλέγεται: ${name(p)} · ${eur(p.price)}` });
    }
    if (b.say) r.push({ who: "hermes", text: fillStore(b.say, store) });
    if (b.wait === "presenter" && b.cue && isLine(b.cue)) {
      r.push({ who: "presenter", text: b.cue, n: ++n });
      r.push({ who: "stage", text: "Ο Ερμής απαντά μόλις σωπάσεις (αν δεν ακούει: ο χειριστής πατά «Επόμενο»)" });
    } else if (b.cue) r.push({ who: "stage", text: b.cue });
    if (b.wait === "call") r.push({ who: "stage", text: "Ο Ερμής λέει στον θεατή-κατάστημα ποιες συσκευές θέλει ο πελάτης και ρωτά αν μπορούν να τις κρατήσουν για σήμερα. Ο θεατής απαντά ελεύθερα (π.χ. «Ναι, σας τα κρατάμε»)· ο Ερμής ευχαριστεί, λέει «Καλή συνέχεια!» και κλείνει." });
  }
  return out;
}

/** Σενάριο για εκτύπωση / πρόβα του παρουσιαστή: /ermis-live/script?k=<SKETS_KEY> (Cmd+P για χαρτί). */
export default async function Page({ searchParams }: PageProps<"/ermis-live/script">) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "";
  if (!sketsKeyOk(k)) notFound();
  const parts = rows(buildBeats(snap));
  const mine = parts.flatMap((p) => p.rows).filter((r) => r.who === "presenter");

  return (
    <main className="min-h-dvh bg-white text-eu-ink">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 print:px-0 print:py-0">
        <header className="border-b-2 border-eu-navy pb-4">
          <p className="font-bold uppercase tracking-wide text-eu-blue text-[length:var(--fs-13)]">Σκετς · Euronics</p>
          <h1 className="mt-1 font-black text-[length:var(--fs-36)] leading-tight">Ο Ερμής εξοπλίζει ένα σπίτι στη Λάρισα</h1>
          <p className="mt-2 text-eu-muted text-[length:var(--fs-15)]">Παρουσιαστής: <b className="text-eu-ink">{snap.presenter.full}</b> · Ο Ερμής σε ακούει από το μικρόφωνο της σκηνής και απαντά μόλις σωπάσεις. Οι ατάκες σου δεν χρειάζεται να είναι λέξη-λέξη — δες αμέσως παρακάτω πώς παίζεις ελεύθερα χωρίς να σπάσει η ροή.</p>
          <p className="mt-2 text-eu-muted text-[length:var(--fs-13)] print:hidden">Για χαρτί: Cmd+P (ή Ctrl+P).</p>
        </header>

        <section className="mt-6 rounded-2xl ring-1 ring-eu-line p-4 sm:p-5 break-inside-avoid">
          <h2 className="font-black text-[length:var(--fs-20)]">Πώς παίζεις ελεύθερα χωρίς να σπάσει η ροή</h2>
          <p className="mt-1 text-eu-muted text-[length:var(--fs-14)]">Τα βήματα και οι συσκευές είναι σταθερά. Μέσα σε αυτά λες ό,τι θέλεις· ο Ερμής καταλαβαίνει τι από όλα είναι απάντηση, ερώτηση ή αντίρρηση.</p>
          <h3 className="mt-3 font-bold text-[length:var(--fs-16)]">Μπορείς</h3>
          <ul className="mt-1 grid gap-1.5 list-disc pl-5 text-[length:var(--fs-15)] leading-snug">
            <li><b>Με δικά σου λόγια.</b> Ό,τι δεν είναι ερώτηση το παίρνει ως την ατάκα σου και προχωρά («Σίγουρα, όλη μέρα δουλεύει» = «Ναι, σίγουρα»).</li>
            <li><b>Πολλά μαζί, από την αρχή.</b> «Ερμή, μετακομίζω στη Λάρισα και θέλω να μου εξοπλίσεις το σπίτι» → πάει κατευθείαν στο «Ας ξεκινήσουμε». Αν προσθέσεις «θέλω μεγάλο κάδο, το σαλόνι είναι τριάντα τετραγωνικά, και ψυγείο που καίει λίγο», όταν φτάσει εκεί λέει «μου το είπατε ήδη» και δεν το ξαναρωτά. Πιάνει: κάδο/παπλώματα, ρεύμα/ενεργειακή κλάση, μέτρα απόστασης για την τηλεόραση, τετραγωνικά για το κλιματιστικό, κεραμική.</li>
            <li><b>Άλλο μέγεθος.</b> Πες άλλα τετραγωνικά ή άλλη απόσταση και αλλάζει επιλογή και σύνολο — δες «Αν απαντήσεις αλλιώς» στο τέλος.</li>
            <li><b>Ρώτα ή διαφώνησε.</b> «Γιατί όχι μεγαλύτερη τηλεόραση;», «Πόσο ρεύμα καίει;», «Προτιμώ επαγωγική». Απαντά σύντομα, υπερασπίζεται την επιλογή του σεναρίου με επιχείρημα και ξαναθέτει την ερώτηση· μετά απάντησε κανονικά και συνεχίζει.</li>
            <li><b>Κατάστημα με τη φωνή:</b> «της Ηπείρου», «το πρώτο», «το πιο κοντινό».</li>
          </ul>
          <h3 className="mt-3 font-bold text-[length:var(--fs-16)]">Πρόσεξε</h3>
          <ul className="mt-1 grid gap-1.5 list-disc pl-5 text-[length:var(--fs-15)] leading-snug">
            <li><b>Πάνω από τον Ερμή:</b> «Σας ακούω» = μίλα τώρα · «Σκέφτομαι…» = περίμενε. Όσο μιλά ο Ερμής δεν ακούει· άφησέ τον να τελειώσει και μίλα μετά από μισό δευτερόλεπτο.</li>
            <li><b>Μία ανάσα ανά ατάκα.</b> Παύση πάνω από μισό δευτερόλεπτο στη μέση = τέλος της ατάκας σου.</li>
            <li><b>«Όχι» σημαίνει αντίρρηση.</b> Αν το πεις για αστείο, θα σου απαντήσει σαν να διαφωνείς.</li>
            <li><b>Δόσεις, παράδοση, εγγύηση:</b> δεν έχει στοιχεία — θα πει ειλικρινά να το δείτε στο κατάστημα.</li>
            <li><b>Αν κολλήσει:</b> ο χειριστής πατά «Επόμενο». Στο κινητό φαίνεται τι άκουσε ο Ερμής και τι έκανε («συνέχισε», «απαντά»).</li>
          </ul>
        </section>

        <section className="mt-6 rounded-2xl bg-eu-surface p-4 sm:p-5 break-inside-avoid">
          <h2 className="font-black text-[length:var(--fs-20)]">Οι {mine.length} ατάκες σου, με τη σειρά</h2>
          <ol className="mt-3 grid gap-2">
            {mine.map((r) => (
              <li key={r.n} className="flex gap-3 text-[length:var(--fs-16)] leading-snug">
                <span className="shrink-0 w-7 font-black text-eu-blue tabular-nums">{r.n}.</span>
                <span className="font-semibold">{r.text}</span>
              </li>
            ))}
          </ol>
        </section>

        {parts.map((p) => (
          <section key={p.title} className="mt-8">
            <h2 className="border-b border-eu-line pb-1 font-black uppercase tracking-wide text-eu-navy text-[length:var(--fs-15)]">{p.title}</h2>
            <div className="mt-3 grid gap-3">
              {p.rows.map((r, n) =>
                r.who === "stage" ? (
                  <p key={n} className="pl-4 sm:pl-24 italic text-eu-muted text-[length:var(--fs-14)] leading-snug">({r.text})</p>
                ) : (
                  <div key={n} className={`grid gap-1 sm:grid-cols-[5.5rem_1fr] sm:gap-4 break-inside-avoid ${r.who === "presenter" ? "rounded-xl bg-eu-yellow/25 p-3 -mx-1" : ""}`}>
                    <span className={`font-black uppercase text-[length:var(--fs-13)] sm:pt-0.5 ${r.who === "hermes" ? "text-eu-blue" : "text-eu-navy"}`}>
                      {r.who === "hermes" ? "Ερμής" : `${snap.presenter.name} ${r.n}`}
                    </span>
                    <p className={`text-[length:var(--fs-17)] leading-snug ${r.who === "presenter" ? "font-bold" : ""}`}>{r.text}</p>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}

        <section className="mt-10 rounded-2xl ring-1 ring-eu-line p-4 sm:p-5 break-inside-avoid">
          <h2 className="font-black text-[length:var(--fs-20)]">Αν απαντήσεις αλλιώς</h2>
          <div className="mt-3 grid gap-4">
            {snap.cats.filter((c) => c.alts?.length).flatMap((c) => c.alts!.map((a) => {
              const p = pickOf(c, { [c.key]: a.key });
              const said = c.unit === "m2" ? (a.min ? `${a.min}+ τετραγωνικά (π.χ. «Είναι σαράντα»)` : `έως ${a.max} τετραγωνικά (π.χ. «Πιο μικρό, δεκαπέντε»)`) : a.min ? `πάνω από ${a.min.toLocaleString("el-GR")} m (π.χ. «Γύρω στα τέσσερα μέτρα»)` : `έως ${a.max!.toLocaleString("el-GR")} m (π.χ. «Ενάμισι μέτρο»)`;
              return (
                <div key={`${c.key}-${a.key}`} className="text-[length:var(--fs-15)] leading-snug">
                  <p className="font-bold">{c.label}: {said}</p>
                  <p className="mt-0.5"><b className="text-eu-blue">Ερμής:</b> {a.verdict} {a.pickLine}</p>
                  <p className="mt-0.5 italic text-eu-muted">(Επιλέγεται: {name(p)} · {eur(p.price)} · σύνολο {eur(totalOf(snap, { [c.key]: a.key }))})</p>
                </div>
              );
            }))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl ring-1 ring-eu-line p-4 sm:p-5 break-inside-avoid">
          <h2 className="font-black text-[length:var(--fs-20)]">Αν ρωτήσει κάτι το κοινό</h2>
          <ul className="mt-2 grid gap-1.5 list-disc pl-5 text-[length:var(--fs-15)] leading-snug">
            <li>Ο χειριστής κρατά πατημένο το «Ερώτηση κοινού» (ή το M στο laptop) όσο ακούγεται η ερώτηση — ή την πληκτρολογεί στο τηλεχειριστήριο.</li>
            <li>Ο Ερμής λέει «Μισό λεπτό να κοιτάξω στον κατάλογο…» και σε 8–12 δευτερόλεπτα απαντά ζωντανά, με πραγματικά προϊόντα. Γέμισε το κενό: «Για να δούμε τι θα βρει…»</li>
            <li>Μετά: «↩ Πίσω στο σενάριο» (ή Esc). Ο Ερμής λέει «Λοιπόν, πάμε πίσω εκεί που μείναμε» και συνεχίζει από το ίδιο σημείο.</li>
          </ul>
        </section>

        <section className="mt-6 text-eu-muted text-[length:var(--fs-13)]">
          <p>Καταστήματα στον χάρτη: {snap.stores.map((s, i) => `${i + 1}. ${s.street} (${s.km.toLocaleString("el-GR", { maximumFractionDigits: 1 })} km)`).join(" · ")}</p>
          <p className="mt-1">Προϊόντα από τον κατάλογο στις {new Date(snap.at).toLocaleDateString("el-GR")}.</p>
        </section>
      </div>
    </main>
  );
}
