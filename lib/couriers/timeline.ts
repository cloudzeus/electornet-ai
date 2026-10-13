import "server-only";
import { COURIER_NAME, isVoucherCarrier, trackVoucher, type Checkpoint } from "./shipments";
import { stepsOf, trackUrl, type ShipmentTimeline } from "./timeline-model";

export type { ShipmentTimeline } from "./timeline-model";

/**
 * Η διαδρομή μιας αποστολής για το widget παρακολούθησης (διαχείριση, λογαριασμός πελάτη, δημόσιος εντοπισμός).
 * Τα σημεία έρχονται ζωντανά από τον courier με κρυφή μνήμη 10 λεπτών ανά voucher· αν ο courier δεν απαντά, μένει η
 * τελευταία γνωστή κίνηση από τη βάση (cron κάθε 2 ώρες).
 */
const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; checkpoints: Checkpoint[]; state: string | null }>();

export interface ShipmentRow { carrier: string; voucher: string | null; status: string; createdAt: Date; deliveredAt?: Date | null; lastCheckpoint?: unknown }

export async function shipmentTimeline(sh: ShipmentRow, opts: { live?: boolean; fresh?: boolean } = {}): Promise<ShipmentTimeline | null> {
  if (!sh.voucher || !isVoucherCarrier(sh.carrier)) return null;
  const key = `${sh.carrier}:${sh.voucher}`;
  let hit = cache.get(key);
  let error: string | null = null;
  const live = (opts.live ?? true) && !["cancelled"].includes(sh.status);
  if (live && (opts.fresh || !hit || Date.now() - hit.at > TTL)) {
    try {
      const t = await trackVoucher(sh.carrier, sh.voucher);
      hit = { at: Date.now(), checkpoints: t.checkpoints, state: t.state };
      cache.set(key, hit);
    } catch (e) { error = e instanceof Error ? e.message : "Ο courier δεν απάντησε."; }
  }
  const last = (sh.lastCheckpoint ?? null) as Checkpoint | null;
  const checkpoints = hit?.checkpoints ?? (last?.text ? [last] : []);
  // η κατάσταση της βάσης μένει «κυρίαρχη» για ακύρωση· αλλιώς ό,τι λέει τώρα ο courier
  const status = sh.status === "cancelled" ? "cancelled" : hit?.state ?? sh.status;
  return {
    carrier: sh.carrier, courier: COURIER_NAME[sh.carrier], voucher: sh.voucher, status,
    steps: stepsOf(status), url: trackUrl(sh.carrier, sh.voucher),
    checkpoints: [...checkpoints].reverse(), createdAt: sh.createdAt.toISOString(), deliveredAt: sh.deliveredAt?.toISOString() ?? null,
    checkedAt: hit ? new Date(hit.at).toISOString() : null, error,
  };
}
