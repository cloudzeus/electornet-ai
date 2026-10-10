import type { Metadata } from "next";
import Link from "next/link";
import { Package, Truck, ShieldCheck, Gift, CalendarClock, CreditCard, Bell, User, Heart, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { accountAppointments, accountCustomer, accountInstalments, accountOrders, requireCustomer } from "@/lib/account/data";
import { customerDevices } from "@/lib/warranty/server";
import { DeviceCard } from "@/components/account/DeviceWallet";
import { CountUp } from "@/components/motion/CountUp";
import { Reveal } from "@/components/motion/Reveal";
import { StarLight } from "@/components/motion/StarLight";
import { Spotlight } from "@/components/motion/Spotlight";
import { OrderTimeline, StatusChip } from "@/components/account/OrderTimeline";
import { priceLong } from "@/lib/format";

export const metadata: Metadata = { title: "Ο λογαριασμός μου" };

/**
 * @dynamic /logariasmos — dashboard composed from four ERP-bound reads
 * (customer, orders, instalment plans, appointments). Every tile links
 * to its section; the active delivery shows its live courier timeline.
 */
export default async function AccountHome() {
  const me = await requireCustomer();
  const [c, orders, plans, appts, devices] = await Promise.all([accountCustomer(me.id), accountOrders(me.id), accountInstalments(me.id), accountAppointments(me.id), customerDevices(me.id)]);
  if (!c) notFound();
  const activeWarranties = devices.filter((d) => d.daysLeft > 0).length;
  const active = orders.find((o) => ["paid", "processing", "shipped", "ready-for-pickup"].includes(o.status));
  const nextAppt = appts.find((a) => a.status === "scheduled" || a.status === "confirmed");
  const nextPlan = plans.filter((p) => p.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate))[0];
  const tiles = [
    { icon: Package, n: String(orders.length), t: "Παραγγελίες", h: "/logariasmos/paraggelies" },
    { icon: Truck, n: active ? "1" : "0", t: "Σε εξέλιξη", h: active ? `/logariasmos/paraggelies/${active.number}` : "/logariasmos/paraggelies" },
    { icon: ShieldCheck, n: String(activeWarranties), t: "Ενεργές εγγυήσεις", h: "/logariasmos/eggyiseis" },
    { icon: CreditCard, n: String(plans.length), t: "Προγράμματα δόσεων", h: "/logariasmos/pliromes" },
    { icon: CalendarClock, n: String(appts.filter((a) => a.status !== "done" && a.status !== "cancelled").length), t: "Ραντεβού", h: "/logariasmos/rantevou" },
    { icon: Gift, n: (c.loyaltyPoints ?? 0).toLocaleString("el-GR"), t: "Πόντοι Euronics", h: "/kartes-dorou" },
  ];
  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="relative rounded-2xl bg-eu-navy text-white p-5 @md:p-6 flex flex-wrap items-center justify-between gap-4 overflow-hidden isolate">
        <span className="eu-ambient" aria-hidden />
        <Spotlight />
        <StarLight size={56} className="right-6 top-3 hidden @lg:block" rays={false} />
        <div className="relative">
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide">Ο λογαριασμός μου</div>
          <h1 className="m-0 font-heading font-bold text-[length:var(--fs-28)] leading-tight">Καλώς ήρθες, {c.firstName}</h1>
          <p className="m-0 mt-1 text-eu-on-dark text-[length:var(--fs-15)]">
            {[c.email, c.phone, `μέλος από ${new Date(c.memberSince).getFullYear()}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="relative flex flex-wrap gap-2">
          <Link href="/logariasmos/stoixeia" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11">
            <User className="size-4" aria-hidden /> Στοιχεία
          </Link>
          <Link href="/logariasmos/eidopoiiseis" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-[length:var(--fs-14)] px-4 min-h-11">
            <Bell className="size-4" aria-hidden /> Ειδοποιήσεις
          </Link>
          <Link href="/lista" className="inline-flex items-center gap-1.5 rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-yellow-dark">
            <Heart className="size-4" aria-hidden /> Η λίστα μου
          </Link>
        </div>
      </div>

      <Reveal as="ul" className="m-0 p-0 list-none grid grid-cols-2 @xl:grid-cols-3 @5xl:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <li key={t.t} data-reveal>
            <Link href={t.h} className="group block rounded-2xl bg-white border border-eu-line p-4 hover:border-eu-blue hover:shadow-[var(--shadow-raised)] hover:-translate-y-0.5 transition-all h-full">
              <t.icon className="size-5 text-eu-blue transition-transform group-hover:-translate-y-0.5" aria-hidden />
              <div className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-30)] leading-none mt-2 tracking-[-0.02em]">{/^\d+$/.test(t.n.replace(/\./g, "")) ? <CountUp value={Number(t.n.replace(/\./g, ""))} /> : t.n}</div>
              <div className="text-eu-muted text-[length:var(--fs-14)] mt-1">{t.t}</div>
            </Link>
          </li>
        ))}
      </Reveal>

      <section className="grid gap-3" aria-labelledby="devices-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Ηλεκτρονικός φάκελος</div>
            <h2 id="devices-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">
              Οι συσκευές μου
            </h2>
          </div>
          <Link href="/logariasmos/eggyiseis" className="inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline">
            Εγγυήσεις, αποδείξεις & service <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Reveal className="grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-3" stagger={0.08}>
          {devices.slice(0, 3).map((d) => (
            <div key={d.key} data-reveal className="min-w-0">
              <DeviceCard d={d} compact />
            </div>
          ))}
        </Reveal>
      </section>

      {active && (
        <section className="bg-white rounded-2xl border border-eu-line p-5 @md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-19)]">Η παραγγελία σου σε εξέλιξη</h2>
            <Link href={`/logariasmos/paraggelies/${active.number}`} className="inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline">
              Λεπτομέρειες <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <OrderTimeline order={active} />
        </section>
      )}

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
        {nextAppt && (
          <section className="bg-white rounded-2xl border border-eu-line p-5 grid gap-2">
            <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-17)] inline-flex items-center gap-2">
              <CalendarClock className="size-5 text-eu-blue" aria-hidden /> Επόμενο ραντεβού
            </h2>
            <div className="font-bold text-eu-ink text-[length:var(--fs-16)]">{nextAppt.title}</div>
            <div className="text-eu-ink-2 text-[length:var(--fs-15)]">
              {new Date(nextAppt.date).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })} · {nextAppt.slot}
              <br />
              {nextAppt.store}
              {nextAppt.technician ? ` · ${nextAppt.technician}` : ""}
            </div>
            <Link href="/logariasmos/rantevou" className="font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline">
              Όλα τα ραντεβού →
            </Link>
          </section>
        )}
        {nextPlan && (
          <section className="bg-white rounded-2xl border border-eu-line p-5 grid gap-2">
            <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-17)] inline-flex items-center gap-2">
              <CreditCard className="size-5 text-eu-blue" aria-hidden /> Επόμενη δόση
            </h2>
            <div className="font-extrabold text-eu-ink text-[length:var(--fs-24)] leading-none">{priceLong(nextPlan.monthly)}</div>
            <div className="text-eu-ink-2 text-[length:var(--fs-15)]">
              {new Date(nextPlan.nextDate).toLocaleDateString("el-GR", { day: "numeric", month: "long" })} · {nextPlan.title}
              <br />
              {nextPlan.paid} από {nextPlan.months} δόσεις
            </div>
            <Link href="/logariasmos/pliromes" className="font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline">
              Πληρωμές & δόσεις →
            </Link>
          </section>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-eu-line p-5">
        <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-17)] mb-3">Πρόσφατες παραγγελίες</h2>
        <ul className="m-0 p-0 list-none divide-y divide-eu-line-2">
          {orders.slice(0, 3).map((o) => (
            <li key={o.number} className="py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/logariasmos/paraggelies/${o.number}`} className="font-bold text-eu-ink text-[length:var(--fs-15)] hover:text-eu-blue">
                  {o.number}
                </Link>
                <div className="text-eu-muted text-[length:var(--fs-14)] truncate">{o.lines.map((l) => l.title).join(", ")}</div>
              </div>
              <StatusChip status={o.status} />
              <span className="font-extrabold text-eu-ink text-[length:var(--fs-15)]">{priceLong(o.total)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
