import Link from "next/link";
import { ChevronLeft, AudioLines } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getAi } from "@/lib/ai/openrouter";
import { getVoiceConfig } from "@/lib/voice/tts";
import { PRESET_PHRASES, PRESET_GROUP_LABEL } from "@/lib/voice/phrases";
import { StatTile } from "@/components/admin/charts/Charts";
import { VoiceTools, PhraseRow } from "./VoiceTools";

export const metadata = { title: "Φωνή & audio cache" };
export const dynamic = "force-dynamic";

/** Admin: the voice advisor's audio cache — preset phrases, dynamic phrases, hits, money saved, prewarm/test tools. */
export default async function VoicePage() {
  await requirePermission("reports.read");
  const [cfg, ai, phrases, usage, lastFail, lastOk] = await Promise.all([
    getVoiceConfig(),
    getAi(),
    db.voicePhrase.findMany({ orderBy: [{ hits: "desc" }, { createdAt: "desc" }], take: 300 }),
    db.aiUsage.groupBy({ by: ["feature"], where: { feature: { in: ["tts", "stt"] } }, _sum: { costUsd: true, billedEur: true, tokensIn: true }, _count: { _all: true } }),
    db.aiUsage.findFirst({ where: { feature: { in: ["tts", "stt"] }, ok: false }, orderBy: { createdAt: "desc" } }),
    db.aiUsage.findFirst({ where: { feature: { in: ["tts", "stt"] }, ok: true }, orderBy: { createdAt: "desc" } }),
  ]);
  // Πρόβλημα παρόχου: η τελευταία κλήση απέτυχε και είναι πιο πρόσφατη από την τελευταία επιτυχία
  const outage = lastFail && (!lastOk || lastFail.createdAt > lastOk.createdAt) ? lastFail : null;
  const enabled = cfg.enabled && !!ai;
  const tts = usage.find((u) => u.feature === "tts"), stt = usage.find((u) => u.feature === "stt");
  const hits = phrases.reduce((a, p) => a + p.hits, 0);
  const avgCost = phrases.length ? phrases.reduce((a, p) => a + p.costUsd, 0) / phrases.length : 0;
  const savedUsd = phrases.reduce((a, p) => a + p.hits * p.costUsd, 0);
  const bytes = phrases.reduce((a, p) => a + p.bytes, 0);
  const presets = PRESET_PHRASES.map((p) => ({ ...p, row: phrases.find((x) => x.key === p.key) ?? null }));
  const dynamic = phrases.filter((p) => !p.key);
  const fmt = (n: number) => (n === 0 ? "$0" : n < 0.001 ? `$${n.toFixed(6).replace(/0+$/, "")}` : `$${n.toFixed(4)}`);
  const secs = stt?._sum.tokensIn ?? 0;
  return (
    <div className="grid gap-5">
      <Link href="/admin/reports/ai" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Κόστος AI</Link>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><AudioLines className="size-3.5" aria-hidden /> AI · Φωνή</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Φωνή του Ερμή & audio cache</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Κάθε φράση που εκφωνείται αποθηκεύεται μία φορά ως έτοιμος ήχος (στο Bunny CDN όταν είναι ενεργό) και ξαναπαίζει με μηδενικό κόστος. Μικρόφωνο: {cfg.sttModel} · Εκφώνηση: {cfg.ttsModel}, φωνή «{cfg.voice}».</p>
        {outage && (
          <p className="m-0 mt-2 rounded-xl bg-eu-red/10 border border-eu-red/40 p-3 text-[length:var(--fs-14)] text-eu-ink">
            <b>Η φωνή δεν λειτουργεί.</b> Η τελευταία κλήση {outage.feature === "stt" ? "απομαγνητοφώνησης" : "εκφώνησης"} στις {outage.createdAt.toLocaleString("el-GR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} απέτυχε{outage.error ? `: ${outage.error}` : "."}{/402|balance|credits/i.test(outage.error ?? "") ? " Το OpenRouter θέλει υπόλοιπο τουλάχιστον $0,50 για audio — πρόσθεσε credits στον λογαριασμό. Οι φράσεις που υπάρχουν ήδη στην cache συνεχίζουν να παίζουν." : ""}
          </p>
        )}
        {!enabled && <p className="m-0 mt-2 rounded-xl bg-eu-yellow/15 border border-eu-yellow p-3 text-[length:var(--fs-14)] text-eu-ink">Η φωνή είναι ανενεργή. Ο super admin την ενεργοποιεί στο <Link href="/admin/settings/ai" className="font-bold text-eu-blue underline">Ρυθμίσεις → AI & υπηρεσίες</Link> («Φωνή στον Ερμή»){!ai ? " και χρειάζεται κλειδί OpenRouter" : ""}.</p>}
      </div>
      <div className="grid grid-cols-2 @lg:grid-cols-3 @5xl:grid-cols-6 gap-3">
        <StatTile label="Φράσεις στο cache" value={String(phrases.length)} sub={`${(bytes / 1024).toFixed(0)} KB ήχου`} accent />
        <StatTile label="Αναπαραγωγές από cache" value={hits.toLocaleString("el-GR")} sub="χωρίς κλήση API" />
        <StatTile label="Εξοικονόμηση" value={fmt(savedUsd)} sub={`≈ ${fmt(avgCost)} ανά φράση`} />
        <StatTile label="Κόστος εκφώνησης" value={fmt(tts?._sum.costUsd ?? 0)} sub={`${tts?._count._all ?? 0} κλήσεις`} />
        <StatTile label="Κόστος μικροφώνου" value={fmt(stt?._sum.costUsd ?? 0)} sub={secs < 60 ? `${secs} δευτ. ήχου` : `${(secs / 60).toFixed(1)} λεπτά ήχου`} />
        <StatTile label="Χρεωμένο (με markup)" value={`${((tts?._sum.billedEur ?? 0) + (stt?._sum.billedEur ?? 0)).toFixed(3)} €`} />
      </div>
      <section className="rounded-2xl bg-white border border-eu-line p-5 grid gap-3">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Εργαλεία</h3>
        <VoiceTools enabled={enabled} />
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-5">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Τυποποιημένες φράσεις</h3>
        <p className="m-0 mt-1 mb-3 text-eu-muted text-[length:var(--fs-14)]">Καλωσόρισμα, αναμονή, επιβεβαιώσεις, σφάλματα, αποχαιρετισμός. Ορίζονται στο <code>lib/voice/phrases.ts</code>.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[length:var(--fs-14)]">
            <thead><tr className="text-left text-eu-muted"><th className="py-2 pr-3 font-bold">Ομάδα</th><th className="py-2 pr-3 font-bold">Κλειδί</th><th className="py-2 pr-3 font-bold">Φράση</th><th className="py-2 pr-3 font-bold text-right">Αναπαραγωγές</th><th className="py-2 pr-3 font-bold text-right">Διάρκεια</th><th className="py-2 pr-3 font-bold text-right">Πιστότητα</th><th className="py-2 font-bold">Κατάσταση</th></tr></thead>
            <tbody>
              {presets.map((p) => (
                <tr key={p.key} className="border-t border-eu-line-2">
                  <td className="py-2 pr-3 text-eu-ink-3">{PRESET_GROUP_LABEL[p.group]}</td>
                  <td className="py-2 pr-3"><code className="rounded bg-eu-surface px-1.5 py-0.5 text-eu-ink">{p.key}</code></td>
                  <td className="py-2 pr-3 text-eu-ink">{p.text}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-bold text-eu-navy">{p.row?.hits ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-eu-ink-3">{p.row ? `${(p.row.durationMs / 1000).toFixed(1)} s` : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums" title={p.row?.transcript ?? undefined}>{p.row?.fidelity != null ? <span className={p.row.fidelity >= 0.9 ? "text-eu-green font-bold" : "text-eu-ink-3"}>{Math.round(p.row.fidelity * 100)}%</span> : "—"}</td>
                  <td className="py-2">{p.row ? <PhraseRow id={p.row.id} url={p.row.url} /> : <span className="text-eu-muted">δεν έχει δημιουργηθεί</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl bg-white border border-eu-line p-5">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-18)]">Φράσεις από συνομιλίες</h3>
        <p className="m-0 mt-1 mb-3 text-eu-muted text-[length:var(--fs-14)]">Απαντήσεις του Ερμή έως {cfg.cacheMaxChars} χαρακτήρες. Ταξινόμηση κατά αναπαραγωγές: όσο ψηλότερα, τόσο περισσότερο αξίζει που είναι έτοιμες.</p>
        {dynamic.length === 0 ? <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Καμία ακόμη. Όταν ο πελάτης ανοίξει το ηχείο στον Ερμή, οι απαντήσεις θα εμφανίζονται εδώ.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--fs-14)]">
              <thead><tr className="text-left text-eu-muted"><th className="py-2 pr-3 font-bold">Φράση</th><th className="py-2 pr-3 font-bold text-right">Αναπαραγωγές</th><th className="py-2 pr-3 font-bold text-right">Κόστος 1ης</th><th className="py-2 pr-3 font-bold text-right">Εξοικονόμηση</th><th className="py-2 pr-3 font-bold">Τελευταία</th><th className="py-2 font-bold"></th></tr></thead>
              <tbody>
                {dynamic.map((p) => (
                  <tr key={p.id} className="border-t border-eu-line-2">
                    <td className="py-2 pr-3 text-eu-ink max-w-[52ch]">{p.text}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-bold text-eu-navy">{p.hits}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-ink-3">{fmt(p.costUsd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-eu-green font-bold">{fmt(p.hits * p.costUsd)}</td>
                    <td className="py-2 pr-3 text-eu-ink-3 whitespace-nowrap">{p.lastUsedAt.toLocaleDateString("el-GR")}</td>
                    <td className="py-2"><PhraseRow id={p.id} url={p.url} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
