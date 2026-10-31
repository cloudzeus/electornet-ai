"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Crosshair, Loader2, MapPin, Save } from "lucide-react";
import { locateStore, saveStoreLocation } from "@/app/synergaton/actions";
import { ConfirmModal } from "./wizard";
import { Badge, btn, Callout, Card, CardHead } from "./ui";
import type { Pt } from "./StoreMapLeaflet";

const MapView = dynamic(() => import("./StoreMapLeaflet"), { ssr: false, loading: () => <div className="w-full h-full bg-eu-chip animate-pulse motion-reduce:animate-none" /> });

type Found = { label: string; deltaKm: number | null; query: string };
const fmt = (p: Pt) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Σημείο του καταστήματος στον χάρτη: εντοπισμός από τη διεύθυνση (geocoding), διόρθωση με σύρσιμο, επιβεβαίωση. */
export function StoreLocation({ storeId, address, saved: initial }: { storeId: string; address: string; saved: Pt | null }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [proposal, setProposal] = useState<Pt | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  /** θέση μετά από σύρσιμο (δεν ξαναστήνει τον χάρτη) */
  const [pick, setPick] = useState<Pt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [locating, startLocate] = useTransition();
  const [saving, startSave] = useTransition();
  const target = pick ?? proposal;
  const moved = !!pick && !proposal;

  const locate = () => startLocate(async () => {
    setErr(null); setOk(false);
    const r = await locateStore(storeId);
    if (!r.ok) { setErr(r.error); return; }
    setProposal({ lat: r.lat, lng: r.lng }); setFound({ label: r.label, deltaKm: r.deltaKm, query: r.query }); setPick(null);
  });
  const onMove = (p: Pt) => { setOk(false); setPick(p); setFound((f) => (f ? { ...f, deltaKm: null } : f)); };
  const save = () => startSave(async () => {
    if (!target) return;
    const r = await saveStoreLocation(storeId, target.lat, target.lng);
    setConfirm(false);
    if (!r.ok) { setErr(r.error); return; }
    setSaved(target); setProposal(null); setFound(null); setPick(null); setOk(true); router.refresh();
  });
  const cancel = () => { setProposal(null); setFound(null); setPick(null); setErr(null); };

  return (
    <Card data-help="portal.store-location">
      <CardHead icon={MapPin} title="Σημείο στον χάρτη" sub="Από εδώ βρίσκουν οι πελάτες το κοντινότερο κατάστημα και τις οδηγίες." action={saved ? <Badge tone="good">Στον χάρτη</Badge> : <Badge tone="warn">Χωρίς σημείο</Badge>} />
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative h-[clamp(15rem,45vw,24rem)] rounded-2xl overflow-hidden border border-eu-line isolate">
          <MapView saved={saved} proposal={proposal} onMove={onMove} />
        </div>
        <div className="grid gap-3 content-start text-[length:var(--fs-14)]">
          <div><p className="m-0 text-eu-ink-3 text-[length:var(--fs-12)]">Διεύθυνση (από το SoftOne)</p><p className="m-0 font-bold break-words">{address || "—"}</p></div>
          {saved && !target && <p className="m-0 text-eu-ink-3">Σημερινό σημείο: <span className="font-mono text-eu-ink text-[length:var(--fs-13)]">{fmt(saved)}</span></p>}
          {found && proposal && (
            <Callout tone="info" title="Βρέθηκε από τη διεύθυνση">
              <p className="m-0 break-words">{found.label}</p>
              <p className="m-0 text-[length:var(--fs-13)]">Αναζήτηση με {found.query}.{found.deltaKm == null ? "" : found.deltaKm < 0.05 ? " Συμπίπτει με το σημερινό σημείο." : ` Απέχει ${found.deltaKm.toLocaleString("el-GR")} km από το σημερινό σημείο.`}</p>
              <p className="m-0 text-[length:var(--fs-13)]">Αν δεν πέφτει ακριβώς στην είσοδο, σύρε την κίτρινη καρφίτσα.</p>
            </Callout>
          )}
          {moved && !proposal && <Callout tone="info">Μετακίνησες την καρφίτσα. Αποθήκευσε για να ισχύσει.</Callout>}
          {err && <Callout tone="bad">{err}</Callout>}
          {ok && <Callout tone="good" title="Αποθηκεύτηκε">Το νέο σημείο ισχύει ήδη στο eshop.</Callout>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={locate} disabled={locating || saving} className={btn(target ? "ghost" : "primary")}>{locating ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Crosshair className="size-4" aria-hidden />}{locating ? "Αναζήτηση…" : "Εντοπισμός από τη διεύθυνση"}</button>
            {target && <button type="button" onClick={() => setConfirm(true)} disabled={saving} className={btn("primary")}><Save className="size-4" aria-hidden />Αποθήκευση σημείου</button>}
            {target && <button type="button" onClick={cancel} disabled={saving} className={btn("ghost")}>Άκυρο</button>}
          </div>
          {!saved && !proposal && <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Χωρίς σημείο το κατάστημα δεν εμφανίζεται στον χάρτη ούτε στις «κοντινές» προτάσεις.</p>}
        </div>
      </div>
      <ConfirmModal open={confirm} title="Αποθήκευση σημείου στον χάρτη" confirmLabel="Αποθήκευση" busy={saving} onConfirm={save} onCancel={() => setConfirm(false)}>
        <p className="m-0">Το κατάστημα θα εμφανίζεται στο <b className="font-mono">{target ? fmt(target) : ""}</b>.</p>
        <p className="m-0">Η αλλαγή ισχύει αμέσως στο eshop και γράφεται στο ιστορικό.</p>
      </ConfirmModal>
    </Card>
  );
}
