"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Crosshair, Loader2 } from "lucide-react";
import { StoreMapClient, type MapLine, type MapMarker } from "@/components/admin/stores/StoreMapClient";
import { geocodeMissingAction } from "@/app/admin/(shell)/synergates/card-actions";

export interface NetPoint { id: string; kind: "partner" | "agency" | "ours"; name: string; city: string | null; district: string | null; lat: number | null; lng: number | null; agencyId: string | null; approx: boolean; served?: number }
const KIND = { partner: "Συνεργάτες", agency: "Πρακτορεία", ours: "Δικά μας καταστήματα" } as const;
const field = "rounded-lg border border-eu-line bg-white px-2.5 min-h-11 text-[length:var(--fs-14)] w-full min-w-0";

export function NetworkMap({ points, canWrite, canWriteCarriers }: { points: NetPoint[]; canWrite: boolean; canWriteCarriers: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState({ partner: true, agency: true, ours: true });
  const [agency, setAgency] = useState(""), [district, setDistrict] = useState(""), [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, start] = useTransition();
  const [res, setRes] = useState<string | null>(null);
  const agencies = useMemo(() => points.filter((p) => p.kind === "agency").sort((a, b) => a.name.localeCompare(b.name, "el")), [points]);
  const districts = useMemo(() => [...new Set(points.map((p) => p.district).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "el")), [points]);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const partners = points.filter((p) => p.kind === "partner");
  const noAgency = partners.filter((p) => !p.agencyId);
  const noPoint = points.filter((p) => p.kind !== "ours" && p.lat == null);

  const visible = useMemo(() => points.filter((p) => {
    if (!show[p.kind]) return false;
    if (p.kind === "partner") {
      if (agency && p.agencyId !== agency) return false;
      if (district && p.district !== district) return false;
      if (onlyMissing && p.agencyId) return false;
    }
    if (p.kind === "agency" && agency && p.id !== agency) return false;
    return true;
  }), [points, show, agency, district, onlyMissing]);
  const markers: MapMarker[] = visible.filter((p) => p.lat != null && p.lng != null).map((p) => ({
    id: p.id, lat: p.lat as number, lng: p.lng as number,
    label: `${p.name}${p.city ? ` · ${p.city}` : ""}${p.kind === "partner" && !p.agencyId ? " · χωρίς πρακτορείο" : ""}${p.kind === "agency" ? ` · ${p.served ?? 0} συνεργάτες` : ""}${p.approx ? " · θέση από το κατάστημα" : ""}`,
    href: p.kind === "partner" ? `/admin/synergates/${p.id}` : p.kind === "agency" ? `/admin/apostoles/praktoreia/${p.id}` : `/admin/stores/${p.id}`,
    tone: p.kind === "agency" ? "blue" : p.kind === "ours" ? "navy" : p.agencyId ? "green" : "yellow",
  }));
  const lines: MapLine[] = show.agency ? visible.flatMap((p) => {
    const a = p.kind === "partner" && p.agencyId ? byId.get(p.agencyId) : null;
    return a && p.lat != null && p.lng != null && a.lat != null && a.lng != null ? [{ from: [p.lat, p.lng] as [number, number], to: [a.lat, a.lng] as [number, number], tone: "blue" as const }] : [];
  }) : [];
  const locate = (e: "partner" | "carrier") => start(async () => {
    const r = await geocodeMissingAction(e);
    setRes(`${e === "partner" ? "Συνεργάτες" : "Πρακτορεία"}: βρέθηκαν ${r.done}, δεν βρέθηκαν ${r.failed}${r.left ? `, μένουν ${r.left} (πάτα ξανά)` : ""}.`);
    router.refresh();
  });

  return (
    <div className="grid gap-4 min-w-0">
      <div data-help="network.counts" className="grid grid-cols-2 @2xl:grid-cols-4 gap-2">
        {(["partner", "agency", "ours"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })} className={`rounded-2xl border p-3 text-left grid gap-1 min-h-11 ${show[k] ? "border-eu-navy bg-white" : "border-eu-line bg-eu-surface-2 opacity-70"}`}>
            <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)] font-bold"><span className={`size-3 rounded-full ${k === "partner" ? "bg-eu-green" : k === "agency" ? "bg-[#2C6ED5]" : "bg-eu-navy"}`} aria-hidden /> {KIND[k]}</span>
            <b className="text-eu-navy text-[length:var(--fs-22)] tabular-nums">{points.filter((p) => p.kind === k).length}</b>
          </button>
        ))}
        <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(!onlyMissing)} className={`rounded-2xl border p-3 text-left grid gap-1 min-h-11 ${onlyMissing ? "border-eu-amber bg-eu-amber/10" : noAgency.length ? "border-eu-amber/50 bg-white" : "border-eu-line bg-white"}`}>
          <span className="inline-flex items-center gap-1.5 text-eu-ink-3 text-[length:var(--fs-13)] font-bold"><span className="size-3 rounded-full bg-[#F1C400]" aria-hidden /> Χωρίς πρακτορείο</span>
          <b className={`text-[length:var(--fs-22)] tabular-nums ${noAgency.length ? "text-eu-amber" : "text-eu-green"}`}>{noAgency.length}</b>
        </button>
      </div>

      <div data-help="network.filters" className="grid gap-2 @2xl:grid-cols-2">
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Πρακτορείο</span><select className={field} value={agency} onChange={(e) => setAgency(e.target.value)}><option value="">Όλα</option>{agencies.map((a) => <option key={a.id} value={a.id}>{a.name}{a.city ? ` · ${a.city}` : ""}</option>)}</select></label>
        <label className="grid gap-1"><span className="text-eu-ink-3 text-[length:var(--fs-13)] font-bold">Νομός συνεργάτη</span><select className={field} value={district} onChange={(e) => setDistrict(e.target.value)}><option value="">Όλοι</option>{districts.map((d) => <option key={d}>{d}</option>)}</select></label>
      </div>

      {noPoint.length > 0 && (
        <div data-help="network.locate" className="rounded-2xl border border-eu-amber/50 bg-eu-amber/10 p-3 flex flex-wrap items-center gap-3 text-[length:var(--fs-14)]">
          <AlertTriangle className="size-4 text-eu-amber shrink-0" aria-hidden />
          <span className="flex-1 min-w-[220px]"><b>{noPoint.length}</b> δεν έχουν θέση και λείπουν από τον χάρτη ({noPoint.filter((p) => p.kind === "partner").length} συνεργάτες, {noPoint.filter((p) => p.kind === "agency").length} πρακτορεία). Ο εντοπισμός βρίσκει 15 κάθε φορά από τη διεύθυνση.</span>
          {canWrite && <button type="button" disabled={busy} onClick={() => locate("partner")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Crosshair className="size-4" aria-hidden />} Εντοπισμός συνεργατών</button>}
          {canWriteCarriers && <button type="button" disabled={busy} onClick={() => locate("carrier")} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-4 min-h-11 disabled:opacity-60"><Crosshair className="size-4" aria-hidden /> Εντοπισμός πρακτορείων</button>}
        </div>
      )}
      {busy && <p role="status" className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Ψάχνω διευθύνσεις στον χάρτη, ένα το δευτερόλεπτο. Περίμενε λίγο.</p>}
      {res && !busy && <p role="status" className="m-0 text-eu-green font-bold text-[length:var(--fs-14)]">{res}</p>}

      <div data-help="network.map"><StoreMapClient markers={markers} lines={lines} height="min(70dvh, 640px)" /></div>

      {onlyMissing && (
        <ul className="m-0 p-0 list-none grid gap-1 @2xl:grid-cols-2">
          {visible.filter((p) => p.kind === "partner").map((p) => (
            <li key={p.id}><Link href={`/admin/synergates/${p.id}?tab=transport`} className="flex items-center gap-2 rounded-xl border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] hover:border-eu-blue"><b className="flex-1 min-w-0 [overflow-wrap:anywhere]">{p.name}</b><span className="text-eu-ink-3">{p.city ?? "—"}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
