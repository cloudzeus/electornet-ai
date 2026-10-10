import type { Metadata } from "next";
import { getDevices, getOrders } from "@/lib/data/repo";
import { DeviceCard, deviceRows, type DeviceRow } from "@/components/account/DeviceWallet";
import { ServiceRequest } from "@/components/account/ServiceRequest";
import { Reveal } from "@/components/motion/Reveal";
import { getCustomerSession } from "@/lib/account/session";
import { customerDevices } from "@/lib/warranty/server";

export const metadata: Metadata = { title: "Οι συσκευές μου · Εγγυήσεις & service" };

/**
 * @dynamic «Οι συσκευές μου»: every appliance bought, with warranty ring,
 * documents (receipt, certificate, manual, energy label), service history
 * and one-tap fault report / service booking. ?service=<productId> opens
 * the request form for that device.
 */
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const [{ service }, me] = await Promise.all([searchParams, getCustomerSession()]);
  // συνδεδεμένος πελάτης: οι πραγματικές συσκευές του (e-shop, καταστήματα από το SoftOne, καταχωρίσεις) — αλλιώς επίδειξη
  const rows: DeviceRow[] = me ? await customerDevices(me.id) : deviceRows(await getOrders(), await getDevices());
  const extendable = rows.filter((r) => r.extendable).length;
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
            {me && rows.length === 0 && (
              <p className="m-0 mt-2 text-eu-ink-3 text-[length:var(--fs-15)]">Δεν έχουμε ακόμη συσκευές στον λογαριασμό σου. Οι αγορές σου από το e-shop και τα καταστήματα Euronics εμφανίζονται εδώ αυτόματα.</p>
            )}
          </div>
        </div>
      </Reveal>
      {target && <ServiceRequest device={{ title: `${target.brand} ${target.title}`, serial: target.info?.serial, inWarranty: target.daysLeft > 0 }} />}
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
