"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2, MapPin, Move } from "lucide-react";
import { StoreMapClient, type MapLine, type MapMarker } from "@/components/admin/stores/StoreMapClient";
import { geocodeAction, setPointAction } from "@/app/admin/(shell)/synergates/card-actions";
import type { GeoEntity } from "@/lib/geo/entity-geo";

const SOURCE: Record<string, string> = { nominatim: "από τη διεύθυνση", store: "από το κατάστημα της έδρας", manual: "ορίστηκε με το χέρι" };

/**
 * Χάρτης καρτέλας: η θέση της εγγραφής (κόκκινος δείκτης) και γύρω της ό,τι σχετίζεται (`others`, π.χ. καταστήματα, πρακτορείο).
 * «Βρες από τη διεύθυνση» = Nominatim· «Μετακίνηση» = σύρε τον δείκτη ή πάτα στον χάρτη, αποθηκεύεται ως χειροκίνητη θέση.
 */
export function EntityMap({ entity, id, name, point, others = [], lines = [], canWrite, height = 320 }: {
  entity: GeoEntity; id: string; name: string; point: { lat: number; lng: number; source: string | null; label: string | null } | null;
  others?: MapMarker[]; lines?: MapLine[]; canWrite: boolean; height?: number;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const markers = useMemo(() => [...(point ? [{ id: "self", lat: point.lat, lng: point.lng, label: name, tone: "red" as const }] : []), ...(edit ? [] : others)], [point, name, others, edit]);
  const find = () => start(async () => {
    const r = await geocodeAction(entity, id);
    setMsg(r.ok ? { ok: true, text: "Βρέθηκε η θέση." } : { ok: false, text: r.error });
    router.refresh();
  });
  const onMove = useCallback((p: { lat: number; lng: number }) => start(async () => {
    try { await setPointAction(entity, id, p.lat, p.lng); setMsg({ ok: true, text: "Η θέση αποθηκεύτηκε." }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Δεν αποθηκεύτηκε" }); }
  }), [entity, id, router]);

  return (
    <div className="grid gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 flex-1 min-w-[200px] text-eu-ink-3 text-[length:var(--fs-13)] inline-flex items-start gap-1.5">
          <MapPin className="size-4 shrink-0 text-eu-red mt-0.5" aria-hidden />
          {point ? <span>Θέση {SOURCE[point.source ?? ""] ?? ""}{point.label && point.source !== "manual" ? `: ${point.label}` : ""}</span> : <span><b className="text-eu-ink">Δεν έχει θέση στον χάρτη.</b> {canWrite ? "Βρες την από τη διεύθυνση ή όρισέ την με το χέρι." : ""}</span>}
        </p>
        {canWrite && <>
          <button type="button" disabled={busy} onClick={find} className="inline-flex items-center gap-1.5 rounded-full border border-eu-navy text-eu-navy font-bold px-3.5 min-h-11 text-[length:var(--fs-14)] disabled:opacity-60">
            {busy && !edit ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Crosshair className="size-4" aria-hidden />} Βρες από τη διεύθυνση
          </button>
          <button type="button" aria-pressed={edit} onClick={() => setEdit(!edit)} className={`inline-flex items-center gap-1.5 rounded-full font-bold px-3.5 min-h-11 text-[length:var(--fs-14)] ${edit ? "bg-eu-navy text-white" : "border border-eu-line text-eu-ink"}`}>
            <Move className="size-4" aria-hidden /> {edit ? "Τέλος μετακίνησης" : "Μετακίνηση"}
          </button>
        </>}
      </div>
      {edit && <p className="m-0 rounded-lg bg-eu-chip text-eu-navy p-2 text-[length:var(--fs-13)]">Σύρε τον κόκκινο δείκτη ή πάτα στο σωστό σημείο του χάρτη. Αποθηκεύεται αμέσως και δεν αλλάζει πια αυτόματα.</p>}
      <div style={{ height }}><StoreMapClient markers={markers} lines={edit ? [] : lines} editable={edit} onMove={edit ? onMove : undefined} height={height} zoom={point ? 13 : 6} /></div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`m-0 text-[length:var(--fs-13)] font-bold ${msg.ok ? "text-eu-green" : "text-eu-red"}`}>{msg.text}</p>}
    </div>
  );
}
