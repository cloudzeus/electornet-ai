import Link from "next/link";
import { AlertTriangle, Boxes, CheckCircle2, Search } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { listSets, PROBLEM_LABEL, type SetProblem, type SetRow } from "@/lib/catalog/sets";
import { Pagination } from "@/components/admin/Pagination";
import { SetMemberLabel } from "@/components/admin/catalog/SetMemberLabel";
import { SetsSyncButton } from "@/components/admin/catalog/SetsSyncButton";

export const metadata = { title: "Bundles · sets" };
export const dynamic = "force-dynamic";

const PAGE = 20;
const FILTERS: { v: string; label: string; test: (s: SetRow) => boolean }[] = [
  { v: "", label: "Όλα", test: () => true },
  { v: "problems", label: "Με προβλήματα", test: (s) => s.problems.length > 0 },
  { v: "member-out", label: PROBLEM_LABEL["member-out"], test: (s) => s.problems.includes("member-out") },
  { v: "no-product", label: PROBLEM_LABEL["no-product"], test: (s) => s.problems.includes("no-product") || s.problems.includes("inactive") },
  { v: "available", label: "Διαθέσιμα τώρα", test: (s) => s.available > 0 },
  { v: "parts", label: "Εξαρτήματα (π.χ. κλιματιστικά)", test: (s) => s.kind === "parts" },
  { v: "gift", label: "Με δώρο", test: (s) => s.kind === "gift" },
  { v: "labels", label: "Χωρίς όνομα για το site (ούτε πρόταση)", test: (s) => s.kind === "parts" && s.members.some((m) => !m.label && !m.suggested) },
];
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Προϊόντα που πουλιούνται μαζί με άλλα είδη — στο SoftOne «Set ειδών» (π.χ. κλιματιστικό = εσωτερική + εξωτερική μονάδα).
 * Μόνο ανάγνωση από το ERP· εδώ ελέγχεις μέλη και απόθεμα (το set είναι διαθέσιμο όσο φτάνουν όλα τα μέλη) και ορίζεις
 * πώς φαίνεται κάθε μέλος στο «Περιλαμβάνει» της σελίδας του προϊόντος.
 */
export default async function SetsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; page?: string }> }) {
  const user = await requirePermission("catalog.products.read");
  const { q = "", f = "", page: p = "1" } = await searchParams;
  const canWrite = can(user.permissions, "catalog.products.write");
  const canSync = can(user.permissions, "catalog.sync.run");
  const all = await listSets().catch(() => null);
  const filter = FILTERS.find((x) => x.v === f) ?? FILTERS[0];
  const nq = norm(q.trim());
  const rows = (all ?? []).filter((s) => filter.test(s) && (!nq || norm(`${s.name} ${s.code} ${s.main.title ?? ""} ${s.members.map((m) => `${m.name} ${m.code ?? ""} ${m.mtrl}`).join(" ")}`).includes(nq)));
  const page = Math.max(1, Number(p) || 1), pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  const count = (v: string) => (all ?? []).filter((FILTERS.find((x) => x.v === v) ?? FILTERS[0]).test).length;
  const href = (n: number) => `?${new URLSearchParams({ q, f, page: String(n) })}`;
  const last = all?.reduce<Date | null>((a, s) => (!a || s.syncedAt > a ? s.syncedAt : a), null);

  return (
    <div className="@container grid gap-5 min-w-0">
      <div className="grid gap-1">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Boxes className="size-3.5" aria-hidden /> Κατάλογος</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Bundles · sets</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Προϊόντα που πουλιούνται μαζί με άλλα είδη — στο SoftOne «Set ειδών» (π.χ. κλιματιστικό = εσωτερική + εξωτερική μονάδα). Δύο είδη: <b className="text-eu-ink">εξαρτήματα</b> — διαθέσιμο όσο φτάνουν όλα τα μέλη, και ο πελάτης τα βλέπει στο «Περιλαμβάνει» με τα ονόματα που ορίζεις εδώ — και <b className="text-eu-ink">με δώρο</b> — το προϊόν πουλιέται και μόνο του, το δώρο δεν αλλάζει τη διαθεσιμότητα.</p>
      </div>

      {all === null ? (
        <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-4 text-eu-ink-2 text-[length:var(--fs-15)]">Οι πίνακες των sets δεν υπάρχουν ακόμη στη βάση. Χρειάζεται <code>npx prisma db push</code> και μετά «Ανάγνωση από SoftOne».</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]"><b className="text-eu-ink tabular-nums">{all.length.toLocaleString("el-GR")}</b> sets · <b className="text-eu-ink tabular-nums">{count("available").toLocaleString("el-GR")}</b> διαθέσιμα τώρα · <b className={count("problems") ? "text-eu-red tabular-nums" : "text-eu-ink tabular-nums"}>{count("problems").toLocaleString("el-GR")}</b> με προβλήματα{last ? ` · τελευταία ανάγνωση ${last.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            {canSync && <SetsSyncButton />}
          </div>

          <form className="grid gap-2 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] items-end">
            <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Αναζήτηση
              <span className="relative">
                <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-eu-muted" aria-hidden />
                <input name="q" defaultValue={q} placeholder="Όνομα, κωδικός set ή μέλους…" className="rounded-full border border-eu-line pl-10 pr-4 min-h-11 text-[length:var(--fs-14)] font-normal w-full" />
              </span>
            </label>
            <label className="grid gap-1 text-[length:var(--fs-13)] font-bold text-eu-ink-2">Εμφάνιση
              <select name="f" defaultValue={f} className="rounded-full border border-eu-line px-3 min-h-11 text-[length:var(--fs-14)] font-normal bg-white w-full">
                {FILTERS.map((x) => <option key={x.v} value={x.v}>{x.label} ({count(x.v).toLocaleString("el-GR")})</option>)}
              </select>
            </label>
            <button className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue cursor-pointer">Εφαρμογή</button>
          </form>

          <div className="grid gap-3">
            {slice.map((s) => (
              <article key={s.spcs} className="rounded-2xl border border-eu-line bg-white min-w-0">
                <header className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 border-b border-eu-line">
                  <div className="size-14 shrink-0 rounded-xl bg-eu-surface overflow-hidden grid place-items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.main.image ? <img src={s.main.image} alt="" loading="lazy" className="size-full object-contain" /> : <Boxes className="size-5 text-eu-muted" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1 basis-60 grid gap-1">
                    <div className="font-bold text-eu-ink break-words"><span className={`mr-1.5 align-middle rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${s.kind === "gift" ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface text-eu-ink-3"}`}>{s.kind === "gift" ? "Με δώρο" : "Εξαρτήματα"}</span>{s.name}</div>
                    <div className="text-eu-muted text-[length:var(--fs-13)]">
                      Set {s.code} · {s.main.productId ? <Link href={`/admin/catalog/${s.main.productId}?tab=set`} className="font-bold text-eu-blue hover:underline">{s.main.title}</Link> : `κύριο είδος MTRL ${s.main.mtrl}`}
                      {s.main.price ? ` · ${s.main.price.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ""}
                    </div>
                    {s.problems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">{s.problems.map((pr: SetProblem) => <span key={pr} className="inline-flex items-center gap-1 rounded-full bg-eu-red/10 text-eu-red font-bold px-2 py-0.5 text-[length:var(--fs-12)]"><AlertTriangle className="size-3" aria-hidden /> {PROBLEM_LABEL[pr]}</span>)}</div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-[length:var(--fs-13)] ${s.available > 0 ? "bg-eu-green/12 text-eu-green" : "bg-eu-surface text-eu-ink-3"}`}>
                    {s.available > 0 ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                    {s.available > 0 ? `${s.available} διαθέσιμα sets` : "Κατόπιν παραγγελίας"}
                  </span>
                </header>
                <ul className="m-0 p-0 list-none">
                  {s.members.map((m, i) => (
                    <li key={m.lineNum} className={`grid gap-2 p-3 @3xl:grid-cols-[minmax(0,1fr)_7rem_minmax(0,18rem)] @3xl:items-center ${i ? "border-t border-eu-line" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${m.isMain ? "bg-eu-navy text-white" : "bg-eu-surface text-eu-ink-3"}`}>{m.isMain ? "Κύριο" : s.kind === "gift" ? "Δώρο" : "Μέλος"}</span>
                          <span className="font-bold text-eu-ink break-words">{m.name}</span>
                        </div>
                        <div className="text-eu-muted text-[length:var(--fs-13)]">{m.code ? `κωδικός ${m.code} · ` : ""}MTRL {m.mtrl}{m.qty !== 1 ? ` · × ${m.qty}` : ""}{m.productId && !m.isMain ? <> · <Link href={`/admin/catalog/${m.productId}`} className="text-eu-blue hover:underline">στον κατάλογο</Link></> : ""}</div>
                      </div>
                      <div className={`tabular-nums font-bold text-[length:var(--fs-14)] ${m.stock >= (m.qty || 1) ? "text-eu-green" : "text-eu-red"}`}>{m.stock >= (m.qty || 1) ? `${m.stock} τεμ.` : "Χωρίς απόθεμα"}</div>
                      <label className="grid gap-1 text-[length:var(--fs-12)] font-bold text-eu-ink-3 min-w-0">Όνομα στο «Περιλαμβάνει»{m.suggested && !m.label ? " · αυτόματη πρόταση" : ""}
                        <SetMemberLabel spcs={s.spcs} lineNum={m.lineNum} initial={m.label} placeholder={m.suggested ?? m.name} canWrite={canWrite} />
                      </label>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
            {!slice.length && <p className="m-0 rounded-2xl border border-eu-line bg-white p-8 text-center text-eu-muted">{all.length ? "Κανένα set με αυτά τα κριτήρια." : "Δεν έχουν διαβαστεί ακόμη sets — πάτησε «Ανάγνωση από SoftOne»."}</p>}
            <div className="flex justify-center"><Pagination page={page} pages={pages} total={rows.length} label="sets" href={href} /></div>
          </div>
        </>
      )}
    </div>
  );
}
