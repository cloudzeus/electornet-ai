import type { Metadata } from "next";
import { DeviceCard, type DeviceRow } from "@/components/account/DeviceWallet";
import { ServiceRequest } from "@/components/account/ServiceRequest";
import { Reveal } from "@/components/motion/Reveal";
import { requireCustomer } from "@/lib/account/data";
import { customerDevices } from "@/lib/warranty/server";

export const metadata: Metadata = { title: "Οι συσκευές μου · Εγγυήσεις & service" };

/** Μήνυμα μετά την επιστροφή από τη Viva (αγορά επέκτασης εγγύησης). */
const EXT_MSG = {
  ok: { tone: "bg-eu-green/10 text-eu-green", text: "Η πληρωμή ολοκληρώθηκε — η εγγύηση επεκτάθηκε κατά 2 έτη. Θα λάβεις και την απόδειξη της Viva με email." },
  pending: { tone: "bg-eu-amber/15 text-eu-ink-2", text: "Η πληρωμή είναι σε εξέλιξη. Μόλις την επιβεβαιώσει η Viva, η επέκταση θα φανεί εδώ." },
  failed: { tone: "bg-eu-red/10 text-eu-red", text: "Η πληρωμή δεν ολοκληρώθηκε και δεν έγινε χρέωση. Μπορείς να δοκιμάσεις ξανά από την κάρτα της συσκευής." },
} as const;

/**
 * @dynamic «Οι συσκευές μου»: every appliance bought, with warranty ring,
 * documents (receipt, certificate, manual, energy label), service history
 * and one-tap fault report / service booking. ?service=<productId> opens
 * the request form for that device.
 */
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ service?: string; ext?: string }> }) {
  const [{ service, ext }, me] = await Promise.all([searchParams, requireCustomer("/logariasmos/eggyiseis")]);
  // οι πραγματικές συσκευές του πελάτη (e-shop, καταστήματα από το SoftOne, καταχωρίσεις)
  const rows: DeviceRow[] = await customerDevices(me.id);
  const extendable = rows.filter((r) => r.extendable).length;
  const paidExt = rows.filter((r) => !r.extendable && r.extendPrice).length;
  const extMsg = ext && ext in EXT_MSG ? EXT_MSG[ext as keyof typeof EXT_MSG] : null;
  const target = service ? rows.find((r) => r.productId === service) : null;
  const active = rows.filter((r) => r.daysLeft > 0).length;
  return (
    <div className="grid grid-cols-1 gap-5">
      <Reveal>
        <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Εγγυήσεις & service</div>
            <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] leading-tight">Οι συσκευές μου</h1>
            <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)]">
              {rows.length} συσκευές · {active} με ενεργή εγγύηση · αποδείξεις, πιστοποιητικά, εγχειρίδια και ιστορικό service σε ένα μέρος.
            </p>
            {extendable > 0 && (
              <p className="m-0 mt-2 rounded-xl bg-eu-green/10 px-3 py-2 text-eu-green font-bold text-[length:var(--fs-15)]">
                {extendable === 1 ? "Μία συσκευή σου μπορεί" : `${extendable} συσκευές σου μπορούν`} να πάρει δωρεάν επέκταση εγγύησης +2 έτη — πάτα «Δωρεάν επέκταση» στην κάρτα της.
              </p>
            )}
            {paidExt > 0 && (
              <p className="m-0 mt-2 rounded-xl bg-eu-chip px-3 py-2 text-eu-blue font-bold text-[length:var(--fs-15)]">
                {paidExt === 1 ? "Μία συσκευή σου μπορεί" : `${paidExt} συσκευές σου μπορούν`} να πάρει επέκταση εγγύησης +2 έτη όσο η εγγύησή της είναι σε ισχύ — η τιμή φαίνεται στην κάρτα της.
              </p>
            )}
            {extMsg && (
              <p role="status" className={`m-0 mt-2 rounded-xl px-3 py-2 font-bold text-[length:var(--fs-15)] ${extMsg.tone}`}>{extMsg.text}</p>
            )}
            {rows.length === 0 && (
              <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">Δεν έχουμε ακόμη συσκευές στον λογαριασμό σου. Οι αγορές σου από το e-shop και τα καταστήματα Euronics εμφανίζονται εδώ αυτόματα.</p>
            )}
          </div>
        </div>
      </Reveal>
      {target && <ServiceRequest device={{ id: target.deviceId, title: `${target.brand} ${target.title}`, serial: target.info?.serial, inWarranty: target.daysLeft > 0 }} />}
      <Reveal className="grid grid-cols-1 @5xl:grid-cols-2 gap-4" stagger={0.08}>
        {rows.map((d) => (
          <div key={d.key} data-reveal className="min-w-0">
            <DeviceCard d={d} />
          </div>
        ))}
      </Reveal>
    </div>
  );
}
